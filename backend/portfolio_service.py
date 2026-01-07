import yfinance as yf
import requests
import time
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, List, Optional
from supabase import create_client, Client
try:
    from dotenv import load_dotenv
    # Load .env from root or current directory
    load_dotenv()
    # Also try loading from one level up if we are in /backend
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
except ImportError:
    pass

# Supabase credentials (use environment variables)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

class PortfolioService:
    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self._price_cache = {}  # Format: {ticker: {"price": float, "day_change": float, "ts": float}}
        self._cache_expiry = 5  # seconds
        self._fundamental_cache = {} # Format: {ticker: {"data": dict, "ts": float}}
        self._fundamental_expiry = 24 * 3600  # 24 hours

    def is_market_open(self) -> bool:
        """Checks if Indian market is open (9:15 AM - 3:30 PM IST, Mon-Fri)."""
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        if now.weekday() >= 5:  # Saturday or Sunday
            return False
        
        market_start = now.replace(hour=9, minute=15, second=0, microsecond=0)
        market_end = now.replace(hour=15, minute=30, second=0, microsecond=0)
        
        return market_start <= now <= market_end

    def get_holdings(self, portfolio_id: str) -> Dict:
        """Reads holdings for a specific portfolio from Supabase and merges with live data."""
        is_open = self.is_market_open()
        try:
            # Fetch holdings for the portfolio
            response = self.supabase.table('holdings').select('*').eq('portfolio_id', portfolio_id).execute()
            holdings = response.data
            
            if not holdings:
                return {"holdings": [], "is_market_open": is_open}
            
            # Determine which tickers need fetching from yfinance
            now_ts = time.time()
            tickers_to_fetch = []
            
            for h in holdings:
                ticker = h.get('ticker', '').strip()
                if not ticker: continue
                
                # If market is open, use short cache
                if is_open:
                    cache_entry = self._price_cache.get(ticker)
                    if not cache_entry or (now_ts - cache_entry['ts'] >= self._cache_expiry):
                        if ticker not in tickers_to_fetch:
                            tickers_to_fetch.append(ticker)
                else:
                    # If market is closed, only fetch if we have absolutely no cached price
                    if not h.get('last_price'):
                        if ticker not in tickers_to_fetch:
                            tickers_to_fetch.append(ticker)

            # Bulk fetch from yfinance if needed
            try:
                data = None
                if tickers_to_fetch:
                    print(f"Fetching {len(tickers_to_fetch)} tickers (Market Open: {is_open})")
                    data = yf.download(' '.join(tickers_to_fetch), period='5d', group_by='ticker', progress=False, threads=False)

                # Process results
                updates_to_supabase = []
                for holding in holdings:
                    ticker = holding.get('ticker', '').strip()
                    holding['is_market_open'] = is_open
                    
                    # Ensure defaults for required frontend fields
                    holding.setdefault('state', 'HOLD')
                    holding.setdefault('state_reason', '')
                    
                    if not ticker: continue

                    # 1. Update cache with fresh yfinance data
                    hist = None
                    if data is not None and not data.empty and ticker in data.columns.get_level_values(0):
                        hist = data[ticker].dropna(subset=['Close'])
                    
                    if hist is not None and not hist.empty:
                        price = float(hist['Close'].iloc[-1])
                        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else price
                        change_amt = price - prev_close
                        change_pct = (change_amt / prev_close * 100) if prev_close > 0 else 0
                        
                        # Update local cache
                        self._price_cache[ticker] = {
                            "price": price, "day_change_amount": change_amt, 
                            "day_change_percent": change_pct, "ts": now_ts
                        }
                        
                        # Prepare for Supabase persistence
                        # Include required fields to avoid NOT NULL violations on INSERT
                        db_payload = {
                            "portfolio_id": portfolio_id,
                            "isin": holding['isin'],
                            "stock_name": holding.get('stock_name'),
                            "quantity": holding.get('quantity'),
                            "average_buy_price": holding.get('average_buy_price'),
                            "ticker": holding.get('ticker'),
                            "target": holding.get('target'),
                            "stop_loss": holding.get('stop_loss'),
                            "date_of_exit": holding.get('date_of_exit'),
                            "last_price": price,
                            "last_day_change_amt": change_amt,
                            "last_day_change_pct": change_pct,
                            "market_data_updated_at": datetime.now(ZoneInfo("UTC")).isoformat()
                        }
                        if 'id' in holding:
                            db_payload['id'] = holding['id']
                        updates_to_supabase.append(db_payload)

                    # 2. Use data (Cache > Supabase Persistent > yf Fresh)
                    cache_entry = self._price_cache.get(ticker)
                    if cache_entry:
                        holding['current_price'] = cache_entry['price']
                        holding['day_change_amount'] = cache_entry['day_change_amount']
                        holding['day_change_percent'] = cache_entry['day_change_percent']
                    elif holding.get('last_price'):
                        # Use persisted data from Supabase
                        holding['current_price'] = float(holding['last_price'])
                        holding['day_change_amount'] = float(holding.get('last_day_change_amt', 0))
                        holding['day_change_percent'] = float(holding.get('last_day_change_pct', 0))
                        holding['is_cached'] = True

                    # 3. Calculate Returns and State
                    if holding.get('current_price') and holding.get('average_buy_price'):
                        curr = float(holding['current_price'])
                        buy = float(holding['average_buy_price'])
                        holding['total_return_percent'] = ((curr - buy) / buy * 100) if buy > 0 else 0
                        
                        # Logic for state
                        if holding.get('target') and curr >= float(holding['target']):
                            holding['state'], holding['state_reason'] = "SELL", "Target Hit"
                        elif holding.get('total_return_percent', 0) >= 30:
                            holding['state'], holding['state_reason'] = "SELL", "Returns > 30%"
                        elif holding.get('stop_loss') and curr <= float(holding['stop_loss']):
                            holding['state'], holding['state_reason'] = "SELL", "Stop Loss Hit"

                    # 4. Fundamental Data
                    holding.update(self._get_fundamental_data(ticker))

                # Background update Supabase if we have new data
                if updates_to_supabase:
                    try:
                        self.supabase.table('holdings').upsert(updates_to_supabase).execute()
                    except Exception as e:
                        print(f"Supabase persistence error: {e}")

            except Exception as e:
                print(f"Fetch/Process error: {e}")
                import traceback
                traceback.print_exc()

            return {"holdings": holdings, "is_market_open": is_open}

        except Exception as e:
            print(f"get_holdings error: {e}")
            return {"holdings": [], "is_market_open": is_open}

    def _calculate_cagr(self, values: List[float], years: int) -> Optional[float]:
        """Calculates CAGR for a list of annual values."""
        try:
            if len(values) < years + 1:
                return None
            start_val = values[years]
            end_val = values[0]
            if start_val <= 0 or end_val <= 0:
                return None
            return ((end_val / start_val) ** (1/years) - 1) * 100
        except Exception:
            return None

    def _get_fundamental_data(self, ticker: str) -> Dict:
        """Fetch fundamental data with 24h caching."""
        now = time.time()
        cache_entry = self._fundamental_cache.get(ticker)
        
        if cache_entry and (now - cache_entry['ts'] < self._fundamental_expiry):
            return cache_entry['data']
        
        print(f"Fetching fundamentals for {ticker}...")
        data = {
            'peg_ratio': None,
            'debt_to_equity': None,
            'pe_ratio': None,
            'market_cap': None,
            'sales_growth_3y': None,
            'sales_growth_5y': None,
            'eps_growth_3y': None,
            'eps_growth_5y': None,
        }
        
        try:
            t = yf.Ticker(ticker)
            info = t.info
            
            data['peg_ratio'] = info.get('pegRatio')
            data['debt_to_equity'] = info.get('debtToEquity')
            data['pe_ratio'] = info.get('trailingPE') or info.get('forwardPE')
            data['market_cap'] = info.get('marketCap')
            
            # Growth calculations (3Y and 5Y - usually only 4Y available in yf)
            financials = t.financials
            if not financials.empty:
                # Revenue Growth
                if 'Total Revenue' in financials.index:
                    revs = financials.loc['Total Revenue'].tolist()
                    data['sales_growth_3y'] = self._calculate_cagr(revs, 3)
                
                # EPS Growth (Net Income / Approx shares or Net Income Common Stockholders)
                if 'Net Income Common Stockholders' in financials.index:
                    ni = financials.loc['Net Income Common Stockholders'].tolist()
                    data['eps_growth_3y'] = self._calculate_cagr(ni, 3)

            # Manual PEG calculation if missing
            if not data['peg_ratio'] and data['pe_ratio'] and data['eps_growth_3y']:
                if data['eps_growth_3y'] > 0:
                    data['peg_ratio'] = data['pe_ratio'] / data['eps_growth_3y']
            
            # Cache the result
            self._fundamental_cache[ticker] = {"data": data, "ts": now}
            
        except Exception as e:
            print(f"Error fetching fundamentals for {ticker}: {e}")
            
        return data

    def delete_holdings(self, portfolio_id: str, isins: List[str]):
        """Bulk deletes holdings from a portfolio."""
        try:
            if not isins:
                return {"success": True}
            
            self.supabase.table('holdings').delete().eq('portfolio_id', portfolio_id).in_('isin', isins).execute()
            return {"success": True}
        except Exception as e:
            print(f"Error deleting holdings: {e}")
            return {"success": False, "error": str(e)}

    def add_holding(self, data: Dict):
        """Adds a new holding manually."""
        try:
            # Basic validation
            if not data.get('portfolio_id') or not data.get('isin') or not data.get('stock_name'):
                return {"success": False, "error": "Missing required fields"}
            
            # Upsert (uses portfolio_id + isin as primary key)
            self.supabase.table('holdings').upsert(data).execute()
            return {"success": True}
        except Exception as e:
            print(f"Error adding holding: {e}")
            return {"success": False, "error": str(e)}

    def get_portfolios(self) -> List[Dict]:
        """Fetch all portfolios."""
        try:
            response = self.supabase.table('portfolios').select('*').execute()
            return response.data
        except Exception as e:
            print(f"Error fetching portfolios: {e}")
            return []

    def create_portfolio(self, name: str) -> Dict:
        """Create a new portfolio."""
        try:
            response = self.supabase.table('portfolios').insert({"name": name}).execute()
            if response.data:
                return {"success": True, "portfolio": response.data[0]}
            return {"success": False, "error": "Failed to create portfolio"}
        except Exception as e:
            print(f"Error creating portfolio: {e}")
            return {"success": False, "error": str(e)}

    def rename_portfolio(self, portfolio_id: str, new_name: str) -> Dict:
        """Rename an existing portfolio."""
        try:
            response = self.supabase.table('portfolios').update({"name": new_name}).eq('id', portfolio_id).execute()
            if response.data:
                return {"success": True, "portfolio": response.data[0]}
            return {"success": False, "error": "Failed to rename portfolio"}
        except Exception as e:
            print(f"Error renaming portfolio: {e}")
            return {"success": False, "error": str(e)}

    def delete_portfolio(self, portfolio_id: str):
        """Delete a portfolio and all its holdings."""
        try:
            # Cascade: Supabase normally handles this if FK is set to CASCADE, 
            # but we explicitly delete holdings just in case.
            self.supabase.table('holdings').delete().eq('portfolio_id', portfolio_id).execute()
            self.supabase.table('portfolios').delete().eq('id', portfolio_id).execute()
            return {"success": True}
        except Exception as e:
            print(f"Error deleting portfolio: {e}")
            return {"success": False, "error": str(e)}

    def update_holding_settings(self, portfolio_id: str, isin: str, ticker: Optional[str] = None, date_of_exit: Optional[str] = None, target: Optional[float] = None, stop_loss: Optional[float] = None, quantity: Optional[int] = None, avg_price: Optional[float] = None):
        """Updates a holding's settings in Supabase."""
        try:
            update_data = {}
            
            if ticker is not None:
                update_data['ticker'] = ticker
            if date_of_exit is not None:
                update_data['date_of_exit'] = date_of_exit
            if target is not None:
                update_data['target'] = target
            if stop_loss is not None:
                update_data['stop_loss'] = stop_loss
            if quantity is not None:
                update_data['quantity'] = quantity
            if avg_price is not None:
                update_data['average_buy_price'] = avg_price
            
            if update_data:
                self.supabase.table('holdings').update(update_data).eq('portfolio_id', portfolio_id).eq('isin', isin).execute()
            
            return {"success": True}
        except Exception as e:
            print(f"Error updating holding: {e}")
            return {"success": False, "error": str(e)}

    def auto_discover_ticker(self, isin: str, stock_name: str) -> Optional[str]:
        """Attempts to find ticker by ISIN, then by Name."""
        def _search(query: str) -> Optional[str]:
            try:
                url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=5&newsCount=0"
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                response = requests.get(url, headers=headers, timeout=5)
                
                if response.status_code == 200:
                    data = response.json()
                    quotes = data.get('quotes', [])
                    
                    # Prioritize NSE tickers
                    for quote in quotes:
                        symbol = quote.get('symbol', '')
                        if '.NS' in symbol:
                            return symbol
                    
                    # Fallback to first result
                    if quotes:
                        return quotes[0].get('symbol')
            except Exception as e:
                print(f"Search error for {query}: {e}")
            return None
        
        # Try ISIN first
        ticker = _search(isin)
        if ticker:
            return ticker
        
        # Try stock name
        clean_name = stock_name.replace(" LIMITED", "").replace(" LTD", "").replace(" LTD.", "")
        ticker = _search(clean_name)
        
        return ticker

    def auto_discover_all(self):
        """Auto-discovers tickers for all holdings without tickers."""
        try:
            response = self.supabase.table('holdings').select('*').execute()
            holdings = response.data
            updated_count = 0
            
            for holding in holdings:
                isin = holding['isin']
                current_ticker = holding.get('ticker')
                
                if not current_ticker:
                    found_ticker = self.auto_discover_ticker(isin, holding['stock_name'])
                    if found_ticker:
                        print(f"Found {found_ticker} for {isin}")
                        self.update_holding_settings(holding['portfolio_id'], isin, ticker=found_ticker)
                        updated_count += 1
                        time.sleep(0.2)  # Rate limit
            
            return {"updated": updated_count}
        except Exception as e:
            print(f"Error in auto_discover_all: {e}")
            return {"updated": 0}

    def save_excel_file(self, content: bytes):
        """Processes uploaded Excel file and updates Supabase."""
        import pandas as pd
        import io
        
        try:
            # Read Excel from bytes
            df = pd.read_excel(io.BytesIO(content), header=None)
            
            # Find header row
            header_row = None
            for idx, row in df.iterrows():
                if any('ISIN' in str(cell) or 'Symbol' in str(cell) for cell in row):
                    header_row = idx
                    break
            
            if header_row is None:
                raise ValueError("Could not find header row in Excel")
            
            df = pd.read_excel(io.BytesIO(content), header=header_row)
            
            # Get current holdings from DB
            current_holdings = self.supabase.table('holdings').select('isin, ticker, date_of_exit, target, stop_loss').execute().data
            settings_map = {h['isin']: h for h in current_holdings}
            
            # Process new data
            new_records = []
            for _, row in df.iterrows():
                isin = str(row.get('ISIN', '')).strip()
                if not isin or isin == 'nan':
                    continue
                
                stock_name = str(row.get('Stock Name', row.get('Security Name', ''))).strip()
                quantity = int(row.get('Quantity', row.get('Qty', 0)))
                avg_price = float(row.get('Average buy price', row.get('Avg Price', 0)))
                
                # Preserve existing settings
                existing = settings_map.get(isin, {})
                
                record = {
                    'isin': isin,
                    'stock_name': stock_name,
                    'quantity': quantity,
                    'average_buy_price': avg_price,
                    'ticker': existing.get('ticker'),
                    'date_of_exit': existing.get('date_of_exit'),
                    'target': existing.get('target'),
                    'stop_loss': existing.get('stop_loss')
                }
                new_records.append(record)
            
            # Upsert all records (mapped to portfolio_id)
            if new_records:
                # Add default portfolio_id if not present
                first_port = self.get_portfolios()
                p_id = first_port[0]['id'] if first_port else None
                if not p_id: raise ValueError("No portfolios found to upload to")
                
                for r in new_records:
                    r['portfolio_id'] = p_id
                    
                self.supabase.table('holdings').upsert(new_records).execute()
            
            return {"success": True, "count": len(new_records)}
        except Exception as e:
            print(f"Error processing Excel: {e}")
            raise

# Global instance
portfolio_service = PortfolioService()

import yfinance as yf
import requests
import time
import os
from typing import Dict, List, Optional
from supabase import create_client, Client

# Supabase credentials (use environment variables)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xfaicvomzoisplarbjjs.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

class PortfolioService:
    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    def get_holdings(self) -> List[Dict]:
        """Reads holdings from Supabase and merges with live data."""
        try:
            # Fetch all holdings from Supabase
            response = self.supabase.table('holdings').select('*').execute()
            holdings = response.data
            
            if not holdings:
                return []
            
            # Collect all tickers for bulk fetching (deduplicate and strip)
            tickers_to_fetch = list(set(h['ticker'].strip() for h in holdings if h.get('ticker')))
            
            # If no tickers, return holdings immediately (skip yfinance)
            if not tickers_to_fetch:
                print("No tickers found - skipping live price fetch")
                for holding in holdings:
                    holding['state'] = 'HOLD'
                    holding['state_reason'] = ''
                return holdings
            
            try:
                # Let yfinance handle the session (uses curl_cffi internally)
                print(f"Fetching prices for {len(tickers_to_fetch)} unique tickers...")
                
                # group_by='ticker' ensures a MultiIndex (Ticker, Field)
                data = yf.download(
                    ' '.join(tickers_to_fetch),
                    period='5d',
                    group_by='ticker',
                    progress=False,
                    threads=False
                )
                
                if data.empty:
                    print("ERROR: No data returned from yfinance for any ticker")

                # Process each holding
                for holding in holdings:
                    ticker = holding.get('ticker', '').strip()
                    
                    # Ensure defaults
                    holding['state'] = 'HOLD'
                    holding['state_reason'] = ''
                    holding['current_price'] = None
                    holding['day_change_percent'] = None
                    holding['total_return_percent'] = None
                    
                    if not ticker:
                        continue
                        
                    try:
                        # Extract ticker data safely from MultiIndex dataframe
                        # Try MultiIndex access first
                        hist = None
                        if ticker in data.columns.get_level_values(0):
                            hist = data[ticker].dropna(subset=['Close'])
                        
                        # Fallback: if bulk fetch missed this ticker, try individual download
                        if hist is None or hist.empty:
                            hist = yf.download(ticker, period='5d', progress=False, threads=False).dropna(subset=['Close'])

                        if hist is not None and not hist.empty:
                            current_price = float(hist['Close'].iloc[-1])
                            holding['current_price'] = current_price
                            # print(f"DEBUG: Processed {ticker}: {current_price}")
                            
                            # Day change
                            if len(hist) > 1:
                                prev_close = hist['Close'].iloc[-2]
                                if prev_close > 0:
                                    change = ((current_price - prev_close) / prev_close) * 100
                                    holding['day_change_percent'] = change
                            
                            # Total return
                            if holding.get('average_buy_price'):
                                buy_price = float(holding['average_buy_price'])
                                if buy_price > 0:
                                    total_ret = ((current_price - buy_price) / buy_price) * 100
                                    holding['total_return_percent'] = total_ret
                            
                            # Calculate State
                            state = "HOLD"
                            reason = ""
                            target = holding.get('target')
                            stop_loss = holding.get('stop_loss')
                            
                            if target and current_price >= float(target):
                                state = "SELL"
                                reason = "Target Hit"
                            elif holding.get('total_return_percent', 0) >= 30:
                                state = "SELL"
                                reason = "Returns > 30%"
                            elif stop_loss and current_price <= float(stop_loss):
                                state = "SELL"
                                reason = "Stop Loss Hit"
                                
                            holding['state'] = state
                            holding['state_reason'] = reason
                        else:
                            print(f"ERROR: Could not fetch price data for {ticker}")

                    except Exception as e:
                        print(f"Error processing {ticker}: {e}")
                            
            except Exception as e:
                print(f"Error bulk fetching data: {e}")
                import traceback
                traceback.print_exc()
                # Ensure defaults for all if bulk fetch fails
                for holding in holdings:
                    holding['state'] = 'HOLD'
                    holding['state_reason'] = ''

            return holdings

        except Exception as e:
            print(f"Error reading holdings: {e}")
            return []

    def update_holding_settings(self, isin: str, ticker: Optional[str] = None, date_of_exit: Optional[str] = None, target: Optional[float] = None, stop_loss: Optional[float] = None):
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
            
            if update_data:
                self.supabase.table('holdings').update(update_data).eq('isin', isin).execute()
            
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
                        self.update_holding_settings(isin, ticker=found_ticker)
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
            
            # Upsert all records
            if new_records:
                self.supabase.table('holdings').upsert(new_records).execute()
            
            return {"success": True, "count": len(new_records)}
        except Exception as e:
            print(f"Error processing Excel: {e}")
            raise

# Global instance
portfolio_service = PortfolioService()

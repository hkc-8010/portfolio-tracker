#!/usr/bin/env python3
"""
Migration script to transfer data from Excel + JSON to Supabase
"""
import os
import json
import pandas as pd
from supabase import create_client, Client

# Supabase credentials
SUPABASE_URL = "https://xfaicvomzoisplarbjjs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmYWljdm9tem9pc3BsYXJiampzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcxOTUzNiwiZXhwIjoyMDgzMjk1NTM2fQ.LsXoGMW-VhZETtGyMcfVcID36mVaj19ugaBoRAnIbAY"

# File paths
EXCEL_PATH = '/Users/hemchheda/Downloads/Stocks_Holdings_Statement_1631918194_05-01-2026.xlsx'
SETTINGS_PATH = '/Users/hemchheda/.gemini/antigravity/scratch/portfolio-tracker/portfolio_settings.json'

def main():
    print("🚀 Starting migration to Supabase...")
    
    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Connected to Supabase")
    
    # Read Excel file
    print(f"📖 Reading Excel file: {EXCEL_PATH}")
    df = pd.read_excel(EXCEL_PATH, header=None)
    
    # Find header row
    header_row = None
    for idx, row in df.iterrows():
        if any('ISIN' in str(cell) or 'Symbol' in str(cell) for cell in row):
            header_row = idx
            break
    
    if header_row is None:
        print("❌ Could not find header row in Excel")
        return
    
    df = pd.read_excel(EXCEL_PATH, header=header_row)
    print(f"✅ Found {len(df)} holdings in Excel")
    
    # Load settings
    settings = {}
    if os.path.exists(SETTINGS_PATH):
        with open(SETTINGS_PATH, 'r') as f:
            settings = json.load(f)
        print(f"✅ Loaded settings for {len(settings)} stocks")
    
    # Prepare records for insertion
    records = []
    for _, row in df.iterrows():
        isin = str(row.get('ISIN', '')).strip()
        if not isin or isin == 'nan':
            continue
        
        stock_name = str(row.get('Stock Name', row.get('Security Name', ''))).strip()
        quantity = int(row.get('Quantity', row.get('Qty', 0)))
        avg_price = float(row.get('Average buy price', row.get('Avg Price', 0)))
        
        # Get settings for this ISIN
        stock_settings = settings.get(isin, {})
        
        record = {
            'isin': isin,
            'stock_name': stock_name,
            'quantity': quantity,
            'average_buy_price': avg_price,
            'ticker': stock_settings.get('ticker'),
            'date_of_exit': stock_settings.get('date_of_exit'),
            'target': stock_settings.get('target'),
            'stop_loss': stock_settings.get('stop_loss')
        }
        records.append(record)
    
    print(f"📦 Prepared {len(records)} records for migration")
    
    # Insert records into Supabase
    print("💾 Inserting records into Supabase...")
    for i, record in enumerate(records, 1):
        try:
            supabase.table('holdings').upsert(record).execute()
            print(f"  ✓ [{i}/{len(records)}] {record['stock_name']}")
        except Exception as e:
            print(f"  ✗ [{i}/{len(records)}] {record['stock_name']}: {e}")
    
    print("\n🎉 Migration completed!")
    print(f"📊 Total records migrated: {len(records)}")

if __name__ == '__main__':
    main()

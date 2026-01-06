import pandas as pd

file_path = '/Users/hemchheda/Downloads/Stocks_Holdings_Statement_1631918194_05-01-2026.xlsx'

try:
    # Read with header=None to see all rows clearly
    df = pd.read_excel(file_path, header=None)
    
    # Search for the header row
    header_row_idx = None
    for i, row in df.iterrows():
        row_str = " ".join([str(x) for x in row.values])
        if "Symbol" in row_str or "ISIN" in row_str or "Security" in row_str:
            print(f"Found potential header at row {i}:")
            print(row.values)
            header_row_idx = i
            break
            
    if header_row_idx is not None:
        # Read again with correct header
        df = pd.read_excel(file_path, header=header_row_idx)
        print("\nColumns found:", df.columns.tolist())
        print("\nFirst 3 data rows:")
        print(df.head(3).to_markdown())
    else:
        print("Could not find header row. Printing first 20 rows:")
        print(df.head(20).to_markdown())
        
except Exception as e:
    print(f"Error reading file: {e}")

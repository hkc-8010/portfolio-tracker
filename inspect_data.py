import pandas as pd

file_path = '/Users/hemchheda/Downloads/Stocks_Holdings_Statement_1631918194_05-01-2026.xlsx'

try:
    # Read the excel file
    df = pd.read_excel(file_path)
    print("Columns:", df.columns.tolist())
    print("\nFirst 5 rows:")
    print(df.head().to_markdown())
except Exception as e:
    print(f"Error reading file: {e}")

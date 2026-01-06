import requests
import json
import time

def search_yahoo(query):
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {
        "q": query,
        "quotesCount": 10,
        "newsCount": 0,
        "enableFuzzyQuery": False,
        "quotesQueryId": "tss_match_phrase_query"
    }
    # Using a common browser user agent
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, params=params, headers=headers)
        if response.status_code != 200:
            print(f"Failed with status code: {response.status_code}")
            return

        data = response.json()
        print(f"Query: {query}")
        if 'quotes' in data:
            for quote in data['quotes']:
                print(f"  - {quote.get('symbol')} ({quote.get('longname')}) - Exch: {quote.get('exchange')}")
        else:
            print("  No quotes found")
    except Exception as e:
        print(f"Error: {e}")

print("--- Testing ISIN Search ---")
search_yahoo("INE0LRU01027") # Aarti Pharmalabs
time.sleep(1)

print("\n--- Testing Name Search ---")
search_yahoo("AARTI PHARMALABS")
time.sleep(1)
search_yahoo("AEROFLEX INDUSTRIES")
time.sleep(1)
search_yahoo("RELIANCE INDUSTRIES")

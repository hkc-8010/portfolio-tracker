import requests
import json

def search_yahoo(query):
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {
        "q": query,
        "quotesCount": 10,
        "newsCount": 0,
        "enableFuzzyQuery": False,
        "quotesQueryId": "tss_match_phrase_query"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
    }
    try:
        response = requests.get(url, params=params, headers=headers)
        data = response.json()
        print(f"Query: {query}")
        if 'quotes' in data:
            for quote in data['quotes']:
                print(f"  - {quote.get('symbol')} ({quote.get('longname')}) - Exch: {quote.get('exchange')}")
        else:
            print("  No quotes found")
    except Exception as e:
        print(f"Error: {e}")

# Test cases from user's file
# AARTI PHARMALABS LIMITED - INE0LRU01027
# AEROFLEX INDUSTRIES LTD - INE024001021
# ASIAN GRANITO IND. LTD. - INE022I01019

print("--- Testing ISIN Search ---")
search_yahoo("INE0LRU01027")
search_yahoo("INE024001021")

print("\n--- Testing Name Search ---")
search_yahoo("AARTI PHARMALABS LIMITED")
search_yahoo("AEROFLEX INDUSTRIES LTD")

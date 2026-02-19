"""
Download real OHLC data for BTC-USD, ETH-USD, and SPX.
Uses Binance API (no auth) for crypto, Yahoo Finance for SPX.
Saves as simple CSV: Date,Open,High,Low,Close
"""
import urllib.request
import json
import csv
import time
import ssl
import os

# Disable SSL verification for compatibility
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def fetch_binance_klines(symbol, interval='1d', start_ms=None, end_ms=None):
    """Fetch klines from Binance API (max 1000 per request)."""
    all_klines = []
    current_start = start_ms
    
    while True:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit=1000"
        if current_start:
            url += f"&startTime={current_start}"
        if end_ms:
            url += f"&endTime={end_ms}"
        
        print(f"  Fetching {symbol} from {current_start}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, context=ctx)
        data = json.loads(resp.read().decode())
        
        if not data:
            break
        
        all_klines.extend(data)
        
        # Next batch starts after last kline's close time
        last_close_time = data[-1][6]  # close time in ms
        current_start = last_close_time + 1
        
        if len(data) < 1000:
            break
        
        time.sleep(0.2)  # Rate limit
    
    return all_klines

def save_binance_csv(symbol, filename):
    """Download and save Binance data as CSV."""
    # 5 years: Jan 1, 2020 to Dec 31, 2024
    start_ms = 1577836800000  # Jan 1, 2020 00:00 UTC
    end_ms   = 1735689599000  # Dec 31, 2024 23:59 UTC
    
    print(f"Downloading {symbol}...")
    klines = fetch_binance_klines(symbol, '1d', start_ms, end_ms)
    
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Date', 'Open', 'High', 'Low', 'Close'])
        for k in klines:
            # k = [open_time, open, high, low, close, volume, close_time, ...]
            date_str = time.strftime('%Y-%m-%d', time.gmtime(k[0] / 1000))
            writer.writerow([date_str, k[1], k[2], k[3], k[4]])
    
    print(f"  Saved {len(klines)} candles to {filepath}")
    return len(klines)

def download_yahoo_csv(symbol, filename):
    """Download daily OHLC from Yahoo Finance."""
    # 5 years: Jan 1, 2020 to Dec 31, 2024  
    period1 = 1577836800  # Jan 1, 2020
    period2 = 1735689600  # Jan 1, 2025
    
    url = f"https://query1.finance.yahoo.com/v7/finance/download/{symbol}?period1={period1}&period2={period2}&interval=1d&events=history"
    
    print(f"Downloading {symbol} from Yahoo Finance...")
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/csv'
    })
    
    try:
        resp = urllib.request.urlopen(req, context=ctx)
        raw = resp.read().decode()
        
        # Parse Yahoo CSV (Date,Open,High,Low,Close,Adj Close,Volume)
        lines = raw.strip().split('\n')
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Open', 'High', 'Low', 'Close'])
            for line in lines[1:]:  # Skip header
                parts = line.split(',')
                if len(parts) >= 5 and parts[1] != 'null':
                    writer.writerow([parts[0], parts[1], parts[2], parts[3], parts[4]])
        
        count = len(lines) - 1
        print(f"  Saved {count} candles to {filepath}")
        return count
    except Exception as e:
        print(f"  Yahoo Finance failed: {e}")
        return 0

def download_stooq_csv(symbol, filename):
    """Download daily OHLC from stooq.com as fallback for indices."""
    url = f"https://stooq.com/q/d/l/?s={symbol}&d1=20200101&d2=20241231&i=d"
    
    print(f"Downloading {symbol} from stooq...")
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    
    try:
        resp = urllib.request.urlopen(req, context=ctx)
        raw = resp.read().decode()
        
        lines = raw.strip().split('\n')
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # Stooq format: Date,Open,High,Low,Close,Volume
        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Open', 'High', 'Low', 'Close'])
            for line in lines[1:]:
                parts = line.split(',')
                if len(parts) >= 5:
                    writer.writerow([parts[0], parts[1], parts[2], parts[3], parts[4]])
        
        count = len(lines) - 1
        print(f"  Saved {count} candles to {filepath}")
        return count
    except Exception as e:
        print(f"  Stooq failed: {e}")
        return 0

if __name__ == '__main__':
    print("=" * 60)
    print("Real Market Data Download")
    print("=" * 60)
    
    # 1. BTC
    btc_count = save_binance_csv('BTCUSDT', 'btc_daily.csv')
    
    # 2. ETH
    eth_count = save_binance_csv('ETHUSDT', 'eth_daily.csv')
    
    # 3. SPX — try Yahoo first, then stooq
    spx_count = download_yahoo_csv('%5EGSPC', 'spx_daily.csv')
    if spx_count == 0:
        print("  Trying stooq fallback for SPX...")
        spx_count = download_stooq_csv('^spx', 'spx_daily.csv')
    if spx_count == 0:
        print("  Trying NASDAQ via stooq...")
        spx_count = download_stooq_csv('^ndq', 'spx_daily.csv')
    
    print("\n" + "=" * 60)
    print(f"BTC: {btc_count} candles")
    print(f"ETH: {eth_count} candles")
    print(f"SPX: {spx_count} candles")
    print("=" * 60)

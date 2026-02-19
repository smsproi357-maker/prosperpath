$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$outDir = "c:\Users\smspr\Downloads\kebo1dd"

function Download-Binance {
    param([string]$symbol, [string]$filename)
    
    $allData = @()
    $startMs = 1577836800000  # Jan 1, 2020
    $endMs   = 1735689599000  # Dec 31, 2024
    
    Write-Host "Downloading $symbol from Binance..."
    
    for ($batch = 0; $batch -lt 3; $batch++) {
        $url = "https://api.binance.com/api/v3/klines?symbol=$symbol&interval=1d&limit=1000&startTime=$startMs&endTime=$endMs"
        try {
            $resp = Invoke-RestMethod -Uri $url -UseBasicParsing
            if ($resp.Count -eq 0) { break }
            $allData += ,$resp
            $lastCloseTime = [long]$resp[-1][6]
            $startMs = $lastCloseTime + 1
            if ($resp.Count -lt 1000) { break }
            Start-Sleep -Milliseconds 300
        } catch {
            Write-Host "  Error: $_"
            break
        }
    }
    
    $lines = @("Date,Open,High,Low,Close")
    foreach ($batch in $allData) {
        foreach ($k in $batch) {
            $ts = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$k[0]).DateTime.ToString("yyyy-MM-dd")
            $lines += "$ts,$($k[1]),$($k[2]),$($k[3]),$($k[4])"
        }
    }
    
    $outPath = Join-Path $outDir $filename
    $lines | Out-File -FilePath $outPath -Encoding utf8
    $count = $lines.Count - 1
    Write-Host "  Saved $count candles to $outPath"
    return $count
}

function Download-Stooq {
    param([string]$symbol, [string]$filename)
    
    Write-Host "Downloading $symbol from stooq..."
    $url = "https://stooq.com/q/d/l/?s=$symbol&d1=20200101&d2=20241231&i=d"
    
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing
        $raw = $resp.Content
        $rawLines = $raw -split "`n" | Where-Object { $_.Trim() -ne "" }
        
        $lines = @("Date,Open,High,Low,Close")
        for ($i = 1; $i -lt $rawLines.Count; $i++) {
            $parts = $rawLines[$i].Trim() -split ","
            if ($parts.Count -ge 5) {
                $lines += "$($parts[0]),$($parts[1]),$($parts[2]),$($parts[3]),$($parts[4])"
            }
        }
        
        $outPath = Join-Path $outDir $filename
        $lines | Out-File -FilePath $outPath -Encoding utf8
        $count = $lines.Count - 1
        Write-Host "  Saved $count candles to $outPath"
        return $count
    } catch {
        Write-Host "  Stooq failed: $_"
        return 0
    }
}

Write-Host "============================================"
Write-Host "Real Market Data Download"
Write-Host "============================================"

$btc = Download-Binance -symbol "BTCUSDT" -filename "btc_daily.csv"
$eth = Download-Binance -symbol "ETHUSDT" -filename "eth_daily.csv"
$spx = Download-Stooq -symbol "^spx" -filename "spx_daily.csv"

if ($spx -eq 0) {
    Write-Host "  Trying NASDAQ..."
    $spx = Download-Stooq -symbol "^ndq" -filename "spx_daily.csv"
}

Write-Host ""
Write-Host "============================================"
Write-Host "BTC: $btc candles"
Write-Host "ETH: $eth candles"
Write-Host "SPX: $spx candles"
Write-Host "============================================"

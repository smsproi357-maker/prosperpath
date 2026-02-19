# Download BTC-USDT OHLCV from Binance for 4H and 1H timeframes (2019-2024)
# Output: btc_4h.csv, btc_1h.csv (Date,Open,High,Low,Close)

$ErrorActionPreference = "Stop"

function Download-BinanceKlines {
    param(
        [string]$Symbol = "BTCUSDT",
        [string]$Interval,
        [long]$StartMs,
        [long]$EndMs,
        [string]$OutputFile
    )

    $baseUrl = "https://api.binance.com/api/v3/klines"
    $limit = 1000
    $allCandles = @()
    $currentStart = $StartMs
    $requestCount = 0

    Write-Host "Downloading $Symbol $Interval from $(([DateTimeOffset]::FromUnixTimeMilliseconds($StartMs)).DateTime.ToString('yyyy-MM-dd')) to $(([DateTimeOffset]::FromUnixTimeMilliseconds($EndMs)).DateTime.ToString('yyyy-MM-dd'))..."

    while ($currentStart -lt $EndMs) {
        $url = "${baseUrl}?symbol=${Symbol}&interval=${Interval}&startTime=${currentStart}&endTime=${EndMs}&limit=${limit}"
        
        try {
            $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
        }
        catch {
            Write-Host "  Request failed, retrying in 5s..."
            Start-Sleep -Seconds 5
            try {
                $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
            }
            catch {
                Write-Host "  Retry failed, skipping batch."
                break
            }
        }

        if ($response.Count -eq 0) { break }

        foreach ($k in $response) {
            # Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
            $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$k[0])
            $dateStr = $timestamp.DateTime.ToString("yyyy-MM-dd HH:mm")
            $allCandles += [PSCustomObject]@{
                Date  = $dateStr
                Open  = $k[1]
                High  = $k[2]
                Low   = $k[3]
                Close = $k[4]
            }
        }

        $requestCount++
        $lastCloseTime = [long]$response[-1][6]
        $currentStart = $lastCloseTime + 1

        if ($requestCount % 10 -eq 0) {
            Write-Host "  Fetched $($allCandles.Count) candles so far..."
        }

        # Rate limit: Binance allows 1200 req/min, be conservative
        Start-Sleep -Milliseconds 200
    }

    # Write CSV
    $header = "Date,Open,High,Low,Close"
    $lines = @($header)
    foreach ($c in $allCandles) {
        $lines += "$($c.Date),$($c.Open),$($c.High),$($c.Low),$($c.Close)"
    }
    $lines | Out-File -FilePath $OutputFile -Encoding UTF8

    Write-Host "  Saved $($allCandles.Count) candles to $OutputFile"
    return $allCandles.Count
}

# Time range: 2019-01-01 00:00 UTC to 2024-12-31 23:59 UTC
$startMs = 1546300800000  # 2019-01-01 00:00:00 UTC
$endMs = 1735689599000  # 2024-12-31 23:59:59 UTC

# Download 4H candles
$count4h = Download-BinanceKlines -Interval "4h" -StartMs $startMs -EndMs $endMs -OutputFile "btc_4h.csv"
Write-Host "`n4H download complete: $count4h candles"

# Download 1H candles
$count1h = Download-BinanceKlines -Interval "1h" -StartMs $startMs -EndMs $endMs -OutputFile "btc_1h.csv"
Write-Host "`n1H download complete: $count1h candles"

Write-Host "`nAll downloads complete."

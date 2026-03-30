function Test-Yahoo {
    param($sym, $interval, $range)
    try {
        $enc = [System.Uri]::EscapeDataString($sym)
        $url = "https://query1.finance.yahoo.com/v8/finance/chart/" + $enc + "?interval=" + $interval + "&range=" + $range
        $h = @{ "User-Agent" = "Mozilla/5.0" }
        $r = Invoke-RestMethod -Uri $url -Headers $h -TimeoutSec 15 -ErrorAction Stop
        $res = $r.chart.result
        if ($res -and $res.Count -gt 0) {
            $cls = $res[0].indicators.quote[0].close
            $vol = $res[0].indicators.quote[0].volume
            $cc = 0
            if ($cls) { $cc = ($cls | Where-Object { $_ -ne $null }).Count }
            $vc = 0
            if ($vol) { $vc = ($vol | Where-Object { $_ -ne $null -and $_ -gt 0 }).Count }
            $vf = "N"
            if ($vc -gt 0) { $vf = "Y" }
            return "OK" + $cc + "V" + $vf
        }
        return "FAIL"
    } catch {
        return "ERR"
    }
}

$syms = @(
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD",
    "GC=F", "CL=F", "SI=F", "NG=F", "HG=F", "ZW=F", "ZC=F",
    "GLD", "SLV", "USO", "UNG", "CORN", "WEAT",
    "EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "GBPJPY=X",
    "USDTRY=X", "USDINR=X", "NZDUSD=X", "USDCAD=X"
)

$outLines = @("SYMBOL|DAILY_1d_1y|5MIN_5d|HOURLY_1h_1mo")

foreach ($s in $syms) {
    $d = Test-Yahoo $s "1d" "1y"
    Start-Sleep -Seconds 1
    $f5m = Test-Yahoo $s "5m" "5d"
    Start-Sleep -Seconds 1
    $hh = Test-Yahoo $s "1h" "1mo"
    Start-Sleep -Seconds 1
    $line = $s + "|" + $d + "|" + $f5m + "|" + $hh
    $outLines += $line
    Write-Host $line
}

$outLines | Out-File -FilePath "C:\Users\smspr\Downloads\kebo1dd\yahoo_audit_results.txt" -Encoding ASCII
Write-Host "Results saved to yahoo_audit_results.txt"

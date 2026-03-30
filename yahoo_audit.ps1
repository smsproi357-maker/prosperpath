
function Test-Yahoo {
    param($sym, $interval, $range)
    try {
        $enc = [System.Uri]::EscapeDataString($sym)
        $url = "https://query1.finance.yahoo.com/v8/finance/chart/$enc" + "?interval=$interval&range=$range"
        $h = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        $r = Invoke-RestMethod -Uri $url -Headers $h -TimeoutSec 15 -ErrorAction Stop
        $res = $r.chart.result
        if ($res -and $res.Count -gt 0) {
            $cls = $res[0].indicators.quote[0].close
            $vol = $res[0].indicators.quote[0].volume
            $cc = if ($cls) { ($cls | Where-Object { $_ -ne $null }).Count } else { 0 }
            $vc = if ($vol) { ($vol | Where-Object { $_ -ne $null -and $_ -gt 0 }).Count } else { 0 }
            $volFlag = if ($vc -gt 0) { "V:Y" } else { "V:N" }
            return "OK($cc)$volFlag"
        }
        return "FAIL"
    } catch {
        return "ERR"
    }
}

$symbols = @(
    @{name="Bitcoin";        sym="BTC-USD";   type="Crypto"},
    @{name="Ethereum";       sym="ETH-USD";   type="Crypto"},
    @{name="Solana";         sym="SOL-USD";   type="Crypto"},
    @{name="XRP";            sym="XRP-USD";   type="Crypto"},
    @{name="BNB";            sym="BNB-USD";   type="Crypto"},
    @{name="Cardano";        sym="ADA-USD";   type="Crypto"},
    @{name="Dogecoin";       sym="DOGE-USD";  type="Crypto"},
    @{name="Gold Futures";   sym="GC=F";      type="Commodity-Futures"},
    @{name="Crude Oil";      sym="CL=F";      type="Commodity-Futures"},
    @{name="Silver Futures"; sym="SI=F";      type="Commodity-Futures"},
    @{name="NatGas Future";  sym="NG=F";      type="Commodity-Futures"},
    @{name="Copper Futures"; sym="HG=F";      type="Commodity-Futures"},
    @{name="Wheat Futures";  sym="ZW=F";      type="Commodity-Futures"},
    @{name="Corn Futures";   sym="ZC=F";      type="Commodity-Futures"},
    @{name="Platinum";       sym="PL=F";      type="Commodity-Futures"},
    @{name="Coffee Futures"; sym="KC=F";      type="Commodity-Futures"},
    @{name="Cotton Futures"; sym="CT=F";      type="Commodity-Futures"},
    @{name="Gold ETF";       sym="GLD";       type="Commodity-ETF"},
    @{name="Silver ETF";     sym="SLV";       type="Commodity-ETF"},
    @{name="Oil ETF";        sym="USO";       type="Commodity-ETF"},
    @{name="NatGas ETF";     sym="UNG";       type="Commodity-ETF"},
    @{name="Corn ETF";       sym="CORN";      type="Commodity-ETF"},
    @{name="Wheat ETF";      sym="WEAT";      type="Commodity-ETF"},
    @{name="Coffee ETF";     sym="JO";        type="Commodity-ETF"},
    @{name="Sugar ETF";      sym="SGG";       type="Commodity-ETF"},
    @{name="EUR/USD";        sym="EURUSD=X";  type="Forex"},
    @{name="GBP/USD";        sym="GBPUSD=X";  type="Forex"},
    @{name="USD/JPY";        sym="USDJPY=X";  type="Forex"},
    @{name="AUD/USD";        sym="AUDUSD=X";  type="Forex"},
    @{name="USD/CHF";        sym="USDCHF=X";  type="Forex"},
    @{name="EUR/GBP";        sym="EURGBP=X";  type="Forex"},
    @{name="GBP/JPY";        sym="GBPJPY=X";  type="Forex"},
    @{name="USD/TRY";        sym="USDTRY=X";  type="Forex"},
    @{name="USD/INR";        sym="USDINR=X";  type="Forex"},
    @{name="USD/CNY";        sym="USDCNY=X";  type="Forex"},
    @{name="NZD/USD";        sym="NZDUSD=X";  type="Forex"},
    @{name="USD/CAD";        sym="USDCAD=X";  type="Forex"},
    @{name="EUR/JPY";        sym="EURJPY=X";  type="Forex"},
    @{name="USD/MXN";        sym="USDMXN=X";  type="Forex"},
    @{name="USD/ZAR";        sym="USDZAR=X";  type="Forex"}
)

Write-Host "Type|Name|Yahoo_Symbol|Daily_1d_1y|Intraday_5m_5d|Hourly_1h_1mo"
Write-Host "---------------------------------------------------------------------"

foreach ($s in $symbols) {
    $d  = Test-Yahoo $s.sym "1d" "1y"
    Start-Sleep -Seconds 1
    $im = Test-Yahoo $s.sym "5m" "5d"
    Start-Sleep -Seconds 1
    $hh = Test-Yahoo $s.sym "1h" "1mo"
    Start-Sleep -Seconds 1
    $line = "$($s.type)|$($s.name)|$($s.sym)|$d|$im|$hh"
    Write-Host $line
}

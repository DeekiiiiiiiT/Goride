# Phase D watch — Oct 19 must hold Expected (default 37397.13 before closes).
param(
  [double]$Expected = 37397.13
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
$raw = npx supabase db query --linked -o json -f scripts/watch-kenny-oct19.sql
$parsed = $raw | ConvertFrom-Json
$row = $parsed.rows[0]
if (-not $row) { throw "No Kenny Oct 19 period row" }
$amount = [double]$row.settlement_amount
$ok = [math]::Abs($amount - $Expected) -lt 0.005
Write-Output (@{
  settlement_amount = $amount
  expected = $Expected
  status = $row.status
  updated_at = $row.updated_at
  ok = $ok
  checked_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Compress)
if (-not $ok) {
  Write-Error "P0: Oct 19 drifted - expected $Expected, got $amount. Stop closing more weeks."
  exit 2
}

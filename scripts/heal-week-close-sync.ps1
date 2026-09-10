# One-time Close Week heal (PowerShell). Run from repo root:
#   .\scripts\heal-week-close-sync.ps1
# Optional: .\scripts\heal-week-close-sync.ps1 -Weeks "2025-12-29,2026-02-16"
# Optional: set $env:SUPABASE_SERVICE_ROLE_KEY first, or pass -ServiceRoleKey

param(
  [string]$Weeks = "",
  [string]$ServiceRoleKey = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-ServiceRoleJwtFromCli {
  # Capture stdout only as plain text (2>&1 ErrorRecords break JSON regex).
  $raw = & npx supabase projects api-keys --project-ref csfllzzastacofsvcdsc 2>$null
  if (-not $raw) {
    throw "Could not read api-keys. Run: npx supabase login"
  }
  $text = ($raw | Out-String).Trim()
  # Strip any leading junk before the JSON object.
  $jsonStart = $text.IndexOf('{')
  if ($jsonStart -lt 0) {
    throw "api-keys output was not JSON. Run: npx supabase login"
  }
  $obj = $text.Substring($jsonStart) | ConvertFrom-Json
  $keys = @($obj.keys)
  if (-not $keys -or $keys.Count -eq 0) {
    throw "api-keys JSON had no keys[]"
  }

  # Prefer legacy JWT (eyJ…) with id/name service_role.
  $legacy = $keys | Where-Object {
    ($_.id -eq 'service_role' -or $_.name -eq 'service_role') -and
    ($_.api_key -is [string]) -and
    $_.api_key.StartsWith('eyJ')
  } | Select-Object -First 1
  if ($legacy) { return [string]$legacy.api_key }

  # Fallback: any key whose JWT payload role is service_role.
  foreach ($k in $keys) {
    $ak = [string]$k.api_key
    if (-not $ak.StartsWith('eyJ')) { continue }
    if ($ak -match 'service_role') { return $ak }
  }

  throw "Parsed api-keys but could not find service_role JWT (eyJ…). Paste from Dashboard → Settings → API."
}

$key = $ServiceRoleKey.Trim()
if (-not $key) { $key = ($env:SUPABASE_SERVICE_ROLE_KEY -as [string]).Trim() }
if (-not $key) {
  Write-Host "Fetching GoRide service_role key via Supabase CLI…"
  $key = (Get-ServiceRoleJwtFromCli).Trim()
}

if ($key.Length -lt 40 -or -not $key.StartsWith('eyJ')) {
  throw "service_role key looks invalid (len=$($key.Length); expect eyJ… JWT from Dashboard → API → service_role)"
}

$env:SUPABASE_URL = "https://csfllzzastacofsvcdsc.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = $key
$env:ORGANIZATION_ID = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"
if ($Weeks) { $env:WEEKS = $Weeks } else { Remove-Item Env:WEEKS -ErrorAction SilentlyContinue }

Write-Host "Key loaded (len=$($key.Length)). Starting heal…"
deno run -A --config deno.json supabase/functions/_fleet-server/heal_week_close_sync.ts

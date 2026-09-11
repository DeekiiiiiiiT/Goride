# Close Week heal (PowerShell). Run from repo root:
#   .\scripts\heal-week-close-sync.ps1 -OrgId <uuid> -ActorId <uuid> -Weeks "2026-02-16,2026-02-23"
# Optional: set $env:SUPABASE_SERVICE_ROLE_KEY first, or pass -ServiceRoleKey

param(
  [Parameter(Mandatory = $true)]
  [string]$OrgId,
  [Parameter(Mandatory = $true)]
  [string]$ActorId,
  [Parameter(Mandatory = $true)]
  [string]$Weeks,
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
  $jsonStart = $text.IndexOf('{')
  if ($jsonStart -lt 0) {
    throw "api-keys output was not JSON. Run: npx supabase login"
  }
  $obj = $text.Substring($jsonStart) | ConvertFrom-Json
  $keys = @($obj.keys)
  if (-not $keys -or $keys.Count -eq 0) {
    throw "api-keys JSON had no keys[]"
  }

  $legacy = $keys | Where-Object {
    ($_.id -eq 'service_role' -or $_.name -eq 'service_role') -and
    ($_.api_key -is [string]) -and
    $_.api_key.StartsWith('eyJ')
  } | Select-Object -First 1
  if ($legacy) { return [string]$legacy.api_key }

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

$uuidRe = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
if ($OrgId -notmatch $uuidRe) { throw "OrgId must be a valid UUID" }
if ($ActorId -notmatch $uuidRe) { throw "ActorId must be a valid UUID" }
if (-not $Weeks.Trim()) { throw "Weeks is required (comma-separated Monday YYYY-MM-DD)" }

$env:SUPABASE_URL = "https://csfllzzastacofsvcdsc.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = $key
$env:ORG_ID = $OrgId.Trim()
$env:ORGANIZATION_ID = $OrgId.Trim()
$env:ACTOR_ID = $ActorId.Trim()
$env:HEAL_ACTOR_ID = $ActorId.Trim()
$env:WEEKS = $Weeks.Trim()

Write-Host "Key loaded (len=$($key.Length)). Starting heal for $($Weeks.Split(',').Count) week(s)…"
deno run -A --config deno.json scripts/heal-week-close-sync.ts

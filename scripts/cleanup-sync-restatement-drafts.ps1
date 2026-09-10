# Cleanup junk sync restatement drafts. From repo root:
#   .\scripts\cleanup-sync-restatement-drafts.ps1 [-Dry]
param([switch]$Dry)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$raw = npx supabase projects api-keys --project-ref csfllzzastacofsvcdsc 2>&1 | Out-String
$m = [regex]::Match($raw, '"api_key"\s*:\s*"(eyJ[^"]+)"[^}]*"id"\s*:\s*"service_role"')
if (-not $m.Success) {
  $m = [regex]::Match($raw, '"id"\s*:\s*"service_role"[\s\S]*?"api_key"\s*:\s*"(eyJ[^"]+)"')
}
if (-not $m.Success) { throw "Could not parse service_role key. Run: npx supabase login" }
$key = $m.Groups[1].Value.Trim()
if ($key.Length -lt 40) { throw "service_role key empty" }

$env:SUPABASE_URL = "https://csfllzzastacofsvcdsc.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = $key
$env:ORGANIZATION_ID = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"

$nodeArgs = @()
if ($Dry) { $nodeArgs += "--dry" }
node scripts/cleanup-sync-restatement-drafts.mjs @nodeArgs

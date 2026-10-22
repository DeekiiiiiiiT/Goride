# Always-on week calculator. Requires gcloud auth and GOOGLE_CLOUD_PROJECT.
# CPU stays on between requests (--no-cpu-throttling) so the queue keeps moving.
$ErrorActionPreference = "Stop"
$Project = $env:GOOGLE_CLOUD_PROJECT
if (-not $Project) { throw "Set GOOGLE_CLOUD_PROJECT to the Google Cloud project id." }
$Region = if ($env:GOOGLE_CLOUD_REGION) { $env:GOOGLE_CLOUD_REGION } else { "us-east1" }

gcloud builds submit --project $Project --config cloudbuild.recon-worker.yaml .
gcloud run deploy recon-worker `
  --project $Project `
  --region $Region `
  --image "gcr.io/$Project/recon-worker" `
  --min-instances 1 `
  --max-instances 1 `
  --concurrency 1 `
  --cpu 1 `
  --memory 1Gi `
  --no-cpu-throttling `
  --timeout 3600 `
  --port 8080 `
  --no-allow-unauthenticated `
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"

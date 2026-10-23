# Week calculator. Builds and deploys asleep (minimum 0).
# The database wakes it when a week changes. Do not set a minimum of 1.
# Requires gcloud auth and GOOGLE_CLOUD_PROJECT.
$ErrorActionPreference = "Stop"
$Project = $env:GOOGLE_CLOUD_PROJECT
if (-not $Project) { throw "Set GOOGLE_CLOUD_PROJECT to the Google Cloud project id." }

gcloud builds submit --project $Project --config cloudbuild.recon-worker.yaml .

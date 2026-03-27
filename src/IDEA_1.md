Setting up the Supabase CLI with GitHub Actions allows you to automate database migrations, Edge Function deployments, and type generation. [1, 2, 3] 
1. Configure GitHub Secrets [4] 
To run in non-interactive CI mode, you must add specific environment variables as encrypted secrets in your GitHub repository. [5] 

* SUPABASE_ACCESS_TOKEN: Generate this at Supabase Account Tokens.
* SUPABASE_PROJECT_ID: Found in your project settings dashboard.
* SUPABASE_DB_PASSWORD: The password you set when creating the project. [6, 7, 8, 9] 

2. Create the Workflow File [9] 
Create a new YAML file at .github/workflows/supabase-ci.yml in your repository. Use the official supabase/setup-cli action to install the CLI on the runner. [3, 5, 10, 11] 
Example: Automatic Edge Function Deployment [1] 
This workflow deploys your functions whenever code is pushed to the main branch. [1, 12] 

name: Deploy Edge Functions
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

3. Common Use Cases

* Database Testing: Use supabase db start and supabase test db to run [pgTAP tests](https://supabase.com/docs/guides/deployment/ci/testing) against a local ephemeral database in the runner.
* Type Generation: Automate supabase gen types typescript to ensure your local frontend types stay synced with your remote schema.
* Database Migrations: Use supabase db push to automatically apply local migration files to your production environment upon merging a PR. [2, 3, 8, 9, 13, 14] 

4. Optional: GitHub Dashboard Integration [15] 
For a more visual experience, you can enable the [Supabase GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration) via the [Supabase Dashboard](https://supabase.com/) (Settings > Integrations). This allows Supabase to automatically manage preview environments for your PRs without manual workflow configuration. [15, 16] 
Which specific task are you trying to automate (e.g., migrations, functions, or type safety)?

Vercel + Supabase setup guide (for non coders)
This guide walks you through connecting a website hosted on Vercel to a Supabase project (database + login). You can reuse it every time you add a new app or new domain.
Time: about 15–30 minutes per app (plus waiting for deploys).
________________________________________
What you are actually doing (in plain English)
1.	Supabase holds your data and handles login (email, Google, etc.).
2.	Your website on Vercel needs two public pieces of information to talk to Supabase:
o	Where Supabase lives (the Project URL).
o	Which browser key to use (the anon / public key — not the secret admin key).
3.	You paste those into Vercel → Environment Variables so each site gets its own copy when it builds.
4.	You tell Supabase which website addresses are allowed after login (Redirect URLs). If a URL is missing here, login can work “sometimes” or break for magic links / password reset later.
________________________________________
Words you will see (quick glossary)
Term	What it means
Project URL	Your Supabase address, like https://abcdefgh.supabase.co.
Anon (public) key	A long key starting with eyJ.... Safe to use in a public website if your database uses Row Level Security (RLS).
Service role key	Secret. Never put this in a website. Never use it as a VITE_ variable. It bypasses normal security rules.
VITE_ variable	A setting whose name starts with VITE_. For Roam apps, these values are included when Vercel builds the site.
Production	The “real” live site customers use.
Preview	Temporary sites Vercel creates for branches / pull requests.
Redeploy	Run the build again so new settings take effect.
________________________________________
Before you start (checklist)
•	[ ] You know which Vercel project matches which website (example: roam-admin → roamdominion.co).
•	[ ] You can log into Supabase and Vercel.
•	[ ] You have 15 minutes without rushing (mistakes usually come from skipping redeploy).
________________________________________
Step 0 — Get your Supabase values (once per Supabase project)
You will copy two values. You can reuse the same two values on many Vercel projects if they all use the same Supabase project.
0a. Open the right place in Supabase
1.	Go to https://supabase.com/dashboard.
2.	Open the correct project (example: “GoRide”).
3.	Go to Project Settings (gear icon) → API Keys (under Configuration).
Tip: Do not use Data API for this step. That screen is for a different kind of database API setup. You want API Keys.
0b. Copy the Project URL
You may see it as:
•	Project URL, or
•	Build it yourself: https://<Project ID>.supabase.co
(The Project ID is shown on Settings → General.)
Example: https://csfllzzastacofsvcdsc.supabase.co
0c. Copy the anon public key
1.	On API Keys, open the tab that shows legacy keys if needed (wording can change).
2.	Find the row labeled anon / anon public / public.
3.	Click Copy.
It should:
•	Start with eyJ... (a JWT), or
•	In some newer UIs, start with sb_publishable_....
For Roam’s current code: use the eyJ... anon JWT if both exist. That is what you put in VITE_SUPABASE_ANON_KEY.
0d. Safety check (30 seconds)
•	[ ] You copied anon public, not service_role.
•	[ ] You did not paste the database password from a Postgres connection string into Vercel VITE_ variables.
Stop if unsure. Using the wrong key can leak full database access.
________________________________________
Step 1 — Add environment variables in Vercel (repeat per website / project)
Do this once per Vercel project that should talk to this Supabase project.
1a. Open the correct Vercel project
1.	Go to https://vercel.com/dashboard.
2.	Click the project (example: roam-admin).
1b. Open Environment Variables
1.	Click Settings (top).
2.	Click Environment Variables (left sidebar).
Common mistake: opening Environments instead. That page is about types of environments, not where you paste keys.
1c. Add VITE_SUPABASE_URL
1.	Click Add / Add Environment Variable.
2.	Name (Key): VITE_SUPABASE_URL
o	Type this exactly. Capital letters matter.
3.	Value: paste your Project URL from Step 0 (example: https://xxxxx.supabase.co).
4.	Environments: enable Production.
o	Also enable Preview if you want preview links to work with Supabase.
5.	Click Save.
If Vercel shows a warning about VITE_ exposing values to the browser: that is expected for these two variables. The anon key is meant to be used from the browser (with RLS). Click Mark as safe / continue — never do this for service_role.
1d. Add VITE_SUPABASE_ANON_KEY
1.	Click Add Environment Variable again.
2.	Name: VITE_SUPABASE_ANON_KEY
3.	Value: paste the anon key from Step 0 (full string).
4.	Environments: match what you chose above (Production + Preview is typical).
5.	Save.
1e. Optional: “Sensitive” toggle
Turning Sensitive on only hides the value in the Vercel dashboard. It does not keep it out of the built website. Either choice is fine; Sensitive is slightly nicer for screenshots.
1f. Redeploy (required)
Environment variables are applied when the site is built.
1.	Click Deployments (top).
2.	Click the latest deployment.
3.	Click ⋯ (three dots) → Redeploy.
4.	If asked about build cache: choosing not to reuse cache is the safest when you first add variables (wording varies).
Wait until the deployment status is Ready.
1g. Quick test
1.	Open your real domain in a private / incognito window.
2.	Try sign in.
If login works, this Vercel project is probably configured correctly.
________________________________________
Step 2 — Repeat for every other app
For each additional Vercel project (example: roam-driver, Goride / fleet):
•	[ ] Add VITE_SUPABASE_URL (same value if same Supabase project)
•	[ ] Add VITE_SUPABASE_ANON_KEY (same value)
•	[ ] Redeploy that project
•	[ ] Test login on that domain
________________________________________
Step 3 — Supabase Auth URLs (redirect allow list)
Even if “it works today,” you should still configure this so email links, password reset, and some OAuth flows do not randomly fail later.
3a. Open URL configuration
1.	Supabase dashboard → your project.
2.	Authentication → URL configuration.
3b. Set Site URL
Pick one primary URL — often:
•	The main product customers use, or
•	The app you consider “home base” after login.
Examples: https://roamfleet.co or https://roamdash.co
This is not a list; it’s a single default.
3c. Add Redirect URLs (this is a list)
Click Add URL for each pattern you need.
Include:
•	Every production domain you use (https://yourdomain.com/** style patterns are common).
•	www variants if you use them (https://www.yourdomain.com/**).
•	Local development URLs if you test on your computer, for example:
o	http://localhost:3000/**
o	http://localhost:5174/** (port depends on your app)
•	Vercel preview URLs if you test previews:
o	https://*.vercel.app/**
Pattern tip: Supabase often allows wildcards like /** at the end so paths under your domain are allowed.
3d. Save
Click Save if shown.
________________________________________
Copy paste template (fill in for each new app)
App name: _______________________
Vercel project name: _______________________
Public domain(s): _______________________
Supabase
•	[ ] Project URL: https://________________.supabase.co
•	[ ] Anon key copied (starts eyJ or publishable per your stack)
Vercel (this project)
•	[ ] VITE_SUPABASE_URL added (Production / Preview as needed)
•	[ ] VITE_SUPABASE_ANON_KEY added
•	[ ] Redeploy completed → Ready
•	[ ] Incognito login test passed
Supabase Auth
•	[ ] Redirect URL added for this domain (and www if used)
•	[ ] Preview URL pattern added if you use Vercel previews (https://*.vercel.app/**)
________________________________________
Troubleshooting (most common fixes)
“Invalid redirect URL” or login bounces to an error page
Cause: Supabase does not allow that exact return URL yet.
Fix: Add the exact domain (and path pattern) to Redirect URLs. Wait 1–2 minutes and try again.
It works on production but not on a *.vercel.app preview link
Fix: Add https://*.vercel.app/** to Redirect URLs (or the specific preview URL).
It works locally but not on the real domain
Fix: Confirm you added the https production URLs (not only http://localhost...).
You rotated the anon key in Supabase
Fix: Update VITE_SUPABASE_ANON_KEY in every Vercel project that uses it → Redeploy each.
________________________________________
Official docs (if you want deeper reading)
•	Supabase Auth redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
•	Vercel environment variables: https://vercel.com/docs/projects/environment-variables
•	Vite env variables (VITE_ prefix): https://vitejs.dev/guide/env-and-mode.html
________________________________________
Roam specific note (this repo)
Roam’s Vite apps read Supabase settings from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY via the shared package @roam/api-client at build time. If those variables are missing, the build can still fall back to defaults baked into the repo — but for production you should always set the Vercel variables so you can change projects/keys without editing code.
________________________________________
Last updated: guide for repeating Vercel + Supabase setup across multiple apps and domains.



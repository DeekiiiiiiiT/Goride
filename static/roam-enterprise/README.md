# Deploy legal pages to roamenterprise.co

Static files for Google Play and in-app legal links live in this folder.

| URL | Upload this file |
|-----|------------------|
| `https://roamenterprise.co/privacy` | `privacy/index.html` |
| `https://roamenterprise.co/terms` | `terms/index.html` |

## Option A — cPanel / traditional hosting

1. Sign in to your `roamenterprise.co` hosting control panel.
2. Open **File Manager** → `public_html` (or your web root).
3. Create folders `privacy` and `terms`.
4. Upload `privacy/index.html` and `terms/index.html`.
5. Confirm both URLs load in an **incognito** browser (no login required).

## Option B — Cloudflare Pages

1. Create a Pages project connected to this repo (or upload the `static/roam-enterprise` folder).
2. Set **Build output directory** to `static/roam-enterprise` (or copy files to project root).
3. Add custom domain `roamenterprise.co`.
4. Use **Redirects** or folder structure so `/privacy` and `/terms` resolve correctly.

## Option C — Netlify / Vercel

Deploy `static/roam-enterprise` as a static site and map the custom domain.

## After deploy

1. Play Console → **Main store listing** → **Privacy policy**: `https://roamenterprise.co/privacy`
2. **App content → Data safety** → account deletion: email `deekiiiiiii@gmail.com` (same as policy)
3. Test in-app links in Roam Rides and Roam Driver (Settings → Privacy Policy)

Source of truth for policy text: `docs/legal/PRIVACY_POLICY.md`

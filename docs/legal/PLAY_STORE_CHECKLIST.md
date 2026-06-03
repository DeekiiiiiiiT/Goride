# Google Play — privacy & legal checklist

## Your action required (cannot be done from code)

### 1. Deploy legal pages to roamenterprise.co

Upload files from `static/roam-enterprise/` to your web host:

- `privacy/index.html` → `https://roamenterprise.co/privacy`
- `terms/index.html` → `https://roamenterprise.co/terms`

See `static/roam-enterprise/README.md` for step-by-step options.

**Verify:** open both URLs in an incognito window (must load without login).

### 2. Play Console — Main store listing (both apps)

| Field | Value |
|-------|--------|
| Privacy policy URL | `https://roamenterprise.co/privacy` |
| Contact email | `deekiiiiiii@gmail.com` (your verified account email is fine) |

### 3. Play Console — App content → Data safety

Declare data types that match `docs/legal/PRIVACY_POLICY.md`:

- Location (precise; background for Driver)
- Personal info (name, email, phone, photos)
- Financial info (payment / trip records)
- Messages (in-trip chat)
- Device IDs / crash logs / push tokens

**Account deletion:** select email-based deletion → `deekiiiiiii@gmail.com`

### 4. Email (optional later)

Do **not** use `support@roamdriver.co` or `support@roam-s.co` until inboxes are set up and tested. Personal Gmail is fine for launch.

When ready: set up forwarding (Cloudflare Email Routing / Google Workspace), update `packages/business-config/src/legalUrls.ts`, redeploy apps.

---

## Already implemented in the codebase

- Policy source: `docs/legal/PRIVACY_POLICY.md`
- Static HTML: `static/roam-enterprise/privacy/` and `terms/`
- Shared URLs: `packages/business-config/src/legalUrls.ts`
- In-app links: login/signup, Roam Rides Settings → Privacy / Terms / deletion email
- Driver: background location disclosure before going online or granting GPS
- Driver splash footer: Privacy Policy + Terms links

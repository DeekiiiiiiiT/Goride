# App permissions policy

Roam separates **device permissions** (chosen by the user in iOS/Android/browser) from **product policy** (configured in admin portals).

## Admin portals

| Portal | Path | Surface |
|--------|------|---------|
| Rides Admin | App Permissions | `rider` |
| Driver Admin | App Permissions | `driver` |

Each row in the table is a permission from the catalog. Toggles:

| Toggle | Meaning |
|--------|---------|
| **Enabled** | Include this permission in the product (copy, checks). |
| **Prompt on onboarding** | Show the permission sheet on first use when not yet granted. |
| **Block until granted** | Hard gate (rider: book; driver: go online) until the web permission is granted. |

Admin toggles **do not** change settings on users’ phones.

## Tier labels

| Tier | Meaning |
|------|---------|
| Core mandatory | App cannot reliably do rides without it. |
| Driver mandatory | Required for drivers specifically. |
| Strongly expected | Uber/inDrive-style onboarding; poor UX without it. |
| Feature optional | Sub-features only (calls, profile photo, etc.). |

## Platform labels

| Label | Meaning |
|-------|---------|
| Web | Actionable in PWA/browser today. |
| Native | Capacitor/native app only (checklist on web). |
| Web + Native | Both. |

## API

- Public: `GET /rides/v1/app-permission-policy?surface=rider|driver`
- Admin: `GET|PATCH /rides/admin/app-permissions?surface=rider|driver`

## Defaults (seed migration)

**Rider:** location + notifications — prompt on, block off for location.

**Driver:** location while using + notifications — prompt on, block on; native rows enabled with prompt, block off until native app ships.

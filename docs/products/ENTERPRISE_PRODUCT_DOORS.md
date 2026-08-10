# Enterprise dual product doors (ops)

Permanent doors (same Vercel project `goride-enterprise`):

| Door | Production host | Local |
|------|-----------------|-------|
| Courier | `https://courier.roamenterprise.co` | `http://courier.localhost:3003` |
| Warehouse | `https://warehouse.roamenterprise.co` | `http://warehouse.localhost:3003` |
| Marketing apex | `https://roamenterprise.co` | `http://localhost:3003` |

## Vercel (dashboard)
1. Project → Domains → add `courier.roamenterprise.co` and `warehouse.roamenterprise.co`
2. DNS: CNAME both to Vercel (`cname.vercel-dns.com` or the value Vercel shows)
3. Redeploy after DNS verifies

## Supabase Auth URL allowlist
Add (Authentication → URL Configuration → Redirect URLs):

```
https://courier.roamenterprise.co/**
https://warehouse.roamenterprise.co/**
http://courier.localhost:3003/**
http://warehouse.localhost:3003/**
https://courier.roamenterprise.co/reset-password
https://warehouse.roamenterprise.co/reset-password
http://courier.localhost:3003/reset-password
http://warehouse.localhost:3003/reset-password
```

See also [`docs/auth/SUPABASE_REDIRECT_CHECKLIST.md`](../auth/SUPABASE_REDIRECT_CHECKLIST.md).

## Local smoke
Modern browsers resolve `*.localhost` to `127.0.0.1` (no hosts file needed).

```bash
pnpm --filter @roam/enterprise dev
```

- Courier: http://courier.localhost:3003/login  
- Warehouse: http://warehouse.localhost:3003/login  

Install PWA from each host → two desktop icons.

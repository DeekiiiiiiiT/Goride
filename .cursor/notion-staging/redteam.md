# Edge Function Red-Team Curl Suite

Security verification checklist for Wave 6 auth hardening. Run these against a deployed environment to confirm endpoints reject unauthorized access correctly.

## Environment Variables Required

```bash
# Set these before running tests
export BASE_URL="https://csfllzzastacofsvcdsc.supabase.co/functions/v1"
export ANON_KEY="<supabase-anon-key>"
export USER_JWT="<valid-authenticated-user-jwt>"
export ADMIN_JWT="<valid-admin-or-platform-owner-jwt>"
```

---

## 1. Unauthenticated Access (Expect 401)

These endpoints require authentication. All should return `401 Unauthorized` when no token is provided.

### Toll reset-period (no auth)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/toll-reconciliation/reset-period" \
  -H "Content-Type: application/json" \
  -d '{"periodStart":"2026-01-01","periodEnd":"2026-01-07","confirmationLabel":"test"}'
# Expected: 401 Unauthorized
```

### Payment ledger import (no auth)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/payment-ledger-lines/import" \
  -H "Content-Type: application/json" \
  -d '{"lines":[]}'
# Expected: 401 Unauthorized
```

### Admin-operations delete-user (no auth)

```bash
curl -X POST "${BASE_URL}/admin-operations/delete-user" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-id"}'
# Expected: 401 Unauthorized
```

### Dispute refund import (no auth)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/dispute-refunds/import" \
  -H "Content-Type: application/json" \
  -d '{"refunds":[]}'
# Expected: 401 Unauthorized
```

### Dispute refund match (no auth)

```bash
curl -X PATCH "${BASE_URL}/make-server-37f42386/dispute-refunds/test-id/match" \
  -H "Content-Type: application/json" \
  -d '{"tollTransactionId":"toll-123"}'
# Expected: 401 Unauthorized
```

### Bulk reconcile (no auth)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/toll-reconciliation/bulk-reconcile" \
  -H "Content-Type: application/json" \
  -d '{"matches":[]}'
# Expected: 401 Unauthorized
```

---

## 2. Authenticated Low-Privilege vs Owner (Expect 403 vs 200)

These test that role-based access control is functioning. A regular user (driver role) should get `403 Forbidden`, while an admin/owner should get `200 OK` or appropriate success.

### Toll reset-period (low-privilege user)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/toll-reconciliation/reset-period" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"periodStart":"2026-01-01","periodEnd":"2026-01-07","confirmationLabel":"test"}'
# Expected: 403 Forbidden (if user lacks toll.manage permission)
```

### Toll reset-period (admin/owner)

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/toll-reconciliation/reset-period" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"periodStart":"2026-01-01","periodEnd":"2026-01-07","confirmationLabel":"DELETE JAN 1-7"}'
# Expected: 200 OK (with valid period and confirmation)
```

### Admin-operations invite-user (low-privilege user)

```bash
curl -X POST "${BASE_URL}/admin-operations/invite-user" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test","role":"driver"}'
# Expected: 403 Forbidden
```

### Admin-operations invite-user (platform admin)

```bash
curl -X POST "${BASE_URL}/admin-operations/invite-user" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"SecurePass123!","name":"New User","role":"driver"}'
# Expected: 200 OK (user created)
```

---

## 3. Quote Token Verification (Unsigned Token Rejected)

Test that fare quote tokens without valid signatures are rejected at booking time.

### Unsigned/forged quote token

```bash
curl -X POST "${BASE_URL}/rides" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "request_ride",
    "pickup_lat": 18.0179,
    "pickup_lng": -76.8099,
    "dropoff_lat": 18.0261,
    "dropoff_lng": -76.7897,
    "vehicle_option": "economy",
    "quote_token": "eyJhbGciOiJub25lIn0.eyJmYXJlIjoxMDAwLCJleHAiOjk5OTk5OTk5OTl9."
  }'
# Expected: 400 Bad Request or 401 (invalid/unsigned quote token)
```

### Missing quote token

```bash
curl -X POST "${BASE_URL}/rides" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "request_ride",
    "pickup_lat": 18.0179,
    "pickup_lng": -76.8099,
    "dropoff_lat": 18.0261,
    "dropoff_lng": -76.7897,
    "vehicle_option": "economy"
  }'
# Expected: 400 Bad Request (quote token required)
```

---

## 4. Sanitized Error Responses (Wave 6)

Verify that 500 errors return the stable sanitized shape, not raw Postgres/JS messages.

### Force internal error via malformed request

```bash
curl -X POST "${BASE_URL}/make-server-37f42386/payment-ledger-lines/import" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d 'not-valid-json'
# Expected: 500 with body {"error":"internal_error","code":"INTERNAL","message":"Something went wrong"}
# NOT: {"error":"Unexpected token..."} or raw Postgres error
```

---

## Verification Checklist

Run each test and record results:

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| Toll reset-period (no auth) | 401 | | |
| Payment ledger import (no auth) | 401 | | |
| Admin delete-user (no auth) | 401 | | |
| Dispute refund import (no auth) | 401 | | |
| Dispute refund match (no auth) | 401 | | |
| Bulk reconcile (no auth) | 401 | | |
| Toll reset-period (low-priv) | 403 | | |
| Toll reset-period (admin) | 200 | | |
| Admin invite-user (low-priv) | 403 | | |
| Admin invite-user (admin) | 200 | | |
| Unsigned quote token | 400/401 | | |
| Missing quote token | 400 | | |
| Sanitized error response | Stable JSON | | |

---

## Notes

- Wave 1B added `requireAuth({ strict: true })` to all money/admin controllers
- Wave 6 added `safeErrorResponse()` to sanitize 500s
- Test with actual tokens from your environment
- Run against staging before production

# Storage Buckets Audit — Roam / GoRide

*Audited 2026-07-18 on production `csfllzzastacofsvcdsc`.*

## Buckets

| Bucket | Public | Size limit | Assessment |
|--------|--------|------------|------------|
| `merchant-documents` | private | 10 MB | OK — KYC |
| `make-37f42386-docs` | private | 10 MB | OK |
| `make-37f42386-vehicles` | private | was null → **set 10 MB** | Fixed in follow-up migration |
| `merchant-assets` | **public** | 5 MB | Expected for storefront images; keep MIME allowlist via upload path |

## Findings

| Finding | Severity | Status |
|---------|----------|--------|
| Vehicle bucket missing `file_size_limit` | Medium | **Fixed** (`20260806120000`) |
| Public `merchant-assets` | Info | By design for menu/logo CDN-style reads |
| Ephemeral evidence bucket (`ephemeral-evidence`) | High (latent) | Not present on prod yet; when deployed, keep private + MIME allowlist from migration |

## Remediation / verify

- Confirm Storage policies: authenticated users only write under their org/merchant path.
- KYC docs remain private; no public URL without signed URL.
- After UI upload tests: merchant asset upload still works; oversized vehicle files rejected.

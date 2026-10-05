-- Test data: wallet, device linking, and payout export are on. No soak.
UPDATE rush_money.runtime_flags
SET enabled = true,
    note = 'On for production. Rush data is test data; no soak.'
WHERE key IN ('wallet_live', 'device_linking', 'payout_export', 'risk_controls');

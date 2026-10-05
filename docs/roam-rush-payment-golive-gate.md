# Roam Rush — Payment Go-Live Gate

**Status:** Engineering items below are built. Card checkout stays in test until the human boxes are signed.  
**Payout rail:** a bank payment file. Export, mark sent, then a different person marks paid. A later bank connection replaces only the file.

## Built

- [x] One completion path. The WiPay webhook is the only way an order or a balance payment becomes paid.
- [x] Pay balance. A locked-out customer can pay what they owe and order again.
- [x] Stuck refunds are not sent again until WiPay says it has no record. If that question cannot be asked, a person handles them.
- [x] Morning books check matches the settle key.
- [x] Payout file: name, bank, branch, account number, and account type. Someone who is not ready waits until next week.
- [x] Duplicate card confirmation marks the intent superseded.
- [x] Each morning recon run is saved.
- [x] Short cash, including a free-delivery subsidy, uses the courier's real share on both books. Roam's share may be negative.
- [x] Privacy sentence says this phone or device may be matched to stop fraud.
- [x] Dispute evidence, refund timeline, payout statement, and courier appeal are on the existing screens. Finance can uphold or reverse an appeal.

## Still needs a person

- [ ] **Legal sign-off** for holding a customer balance, collecting a debt, and taking a courier deduction.
- [ ] **WiPay in writing**
  - [ ] Confirm the status-query address and the refund address.
  - [ ] Confirm WiPay honors `Idempotency-Key`.
  - Until those answers exist, set `WIPAY_REFUND_STATUS_URL` only after they are confirmed. Without it, a stuck refund waits for a person.
- [ ] **Payout rail sign-off.** The bank file is the rail until a provider is contracted. Product confirms that choice.

## Sign-off

| Role | Name | Date |
|------|------|------|
| Product owner | | |
| Legal | | |
| Engineering | | |
| Ops / finance | | |

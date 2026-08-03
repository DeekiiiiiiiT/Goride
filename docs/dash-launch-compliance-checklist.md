# Dash Launch — Compliance & Money-Transmission Checklist (Jamaica)

Legal / compliance liaison must complete before production Connect payouts.

## Entity & licensing

- [ ] Confirm whether Roam (or a partner) must hold a money-services / remittance licence to disburse merchant and courier payouts in Jamaica
- [ ] If licensing required: engage counsel; consider licensed payment facilitator / BaaS so Roam is not the money transmitter
- [ ] Document chosen model: Stripe Connect Express marketplace (Roam as platform) vs. alternate rail

## KYC / KYB

- [ ] Merchant KYB requirements mapped to Connect onboarding fields
- [ ] Courier KYC requirements mapped to Connect onboarding fields
- [ ] Retention policy for identity documents (existing storage buckets + Connect-held data)
- [ ] Sanctions / PEP screening ownership (Stripe vs Roam)

## Operational

- [ ] Weekly standard payout schedule approved (no instant payout at launch)
- [ ] Dispute / chargeback handling ownership documented
- [ ] Tax reporting obligations reviewed (if any for platform fees)

## Sign-off

- [ ] Legal counsel written approval dated: __________
- [ ] Product owner go-ahead for Connect production keys: __________
- [ ] Security sign-off on secrets handling (`STRIPE_SECRET_KEY` only on edge functions): __________

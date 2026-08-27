# Roam Rush — Payment Go-Live Gate

**Status:** Deferred until a payment gateway provider is chosen.  
**Current rail:** WiPay remains available for **testing / soft-launch only**. Do not treat card checkout as production-hardened money flow until this checklist is complete.

## Preconditions

- [ ] Choose and contract the live provider (WiPay or alternative)
- [ ] Confirm Jamaica settlement currency (JMD) and fee model
- [ ] Secrets provisioned in Supabase for live + sandbox with distinct env flags

## Engineering checklist

1. **One completion path**  
   Provider webhook (secret-verified) is the only way an order becomes `paid`. Browser return URL may poll/read an already-completed intent — it must **never** mark paid from query-string `status` alone.

2. **Pin the callback contract**  
   Document exact query/body field names from the provider. Remove multi-alias guessing (`status` / `payment_status`, etc.).

3. **Provider adapter**  
   Implement `createIntent` / `handleWebhook` / `refund` behind one module in `supabase/functions/payments` so swapping providers does not rewrite checkout.

4. **Pending confirmation UI**  
   Replace false “payment failed” on client timeout with “We’re still confirming — check Orders.” Avoid double-charge retries.

5. **Fail closed on env**  
   Live vs sandbox must be an explicit enum (`live` | `sandbox`). Missing/misspelled value refuses to start intents in production.

6. **Reconciliation job**  
   Daily compare `payments.transactions` against provider settlements; alert on mismatches.

7. **FX / multi-currency**  
   Only if the chosen provider requires a non-JMD charge currency — persist rate + assert capture amount.

8. **Ops docs**  
   Update soft-launch gate docs: card pay is live only after this checklist is signed off.

## Explicitly out of scope until then

- Deep WiPay verification theater beyond keeping the existing webhook secret path
- PayPal (permanently removed)

## Sign-off

| Role | Name | Date |
|------|------|------|
| Product owner | | |
| Engineering | | |
| Ops / finance | | |

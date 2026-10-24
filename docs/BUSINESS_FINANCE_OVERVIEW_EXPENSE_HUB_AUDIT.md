# Business Finance Overview + Expense Hub — Audit

**Rev 11 · 2026-10-24 · closed, except the bank confirmation**

Scope: Business Finance Overview, Expense Hub, and the sections that feed them. Rev 1–10 are in git history.

## 1. Where things stand

**Code and the books are done.** The live screens and the nightly job are on the new money rule.

- **Bills and payments:** an existing bill in a locked week can be paid today. A new bill in a locked week is still refused. The $113,994.65 insurance payment was only a rolled-back test.
- **Payouts check:** Oct 12 owed is $17,183.53, which equals paid.
- **Fuel ledger:** every fuel row has an organisation.
- **Uber gaps:** July and August locked differences, plus the small locked gaps for Aug 17, Aug 31 and Oct 12, are entered once in the open week of 19 Oct, on the fleet account. Sep 7, Sep 14, Sep 21, Sep 28 and Oct 5 are corrected in their own weeks. Driver settlements are not touched.
- **Aug 24 Uber fare is 74,006.18.** Aug 3 promotions are 95.76.
- **Nightly job:** revision 00010. A locked date is skipped. An open date still posts.
- **Ledger list:** a reversal shows one minus.
- **Bill book** is still 6 rows because Hub documents are empty. That is correct until those bills exist.
- No Uber row has a one-day period. The week check already says driver contribution.

## 2. Left to do

### Confirm Oct 12 bank deposit — owner action
"Bank (expected vs received)" stays **Not confirmed** until a real deposit is confirmed in Bank Deposits. Do not mark it confirmed without that deposit.

Driver Settlements still needs its own audit. It is out of this scope.

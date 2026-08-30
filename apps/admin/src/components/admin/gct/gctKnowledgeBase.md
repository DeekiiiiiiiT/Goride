# Jamaica GCT Field Guide

**Canonical home:** Dominion Accounting → GCT → Knowledge base. Edit this file in the admin app
to keep the in-product guide current. The repo `docs/JAMAICA_GCT_GUIDE.md` is an optional archive
only — deleting it does not affect this page.

A working reference to the General Consumption Tax Act — registration, tax points, credits,
invoicing, filing and penalties — mapped to the sections you would cite if challenged.

**Source text:** The General Consumption Tax Act, consolidated to L.N. 192A/2017 and L.N. 104A/2019,
updated for rate and threshold changes made under it since.

**Status:** Working reference for operators. Not legal or tax advice. Does not reproduce the
General Consumption Tax Regulations, which carry much of the detail on input tax credits and
prescribed particulars.

---

## ⚠️ Read this first — the printed Act is out of date on two numbers

The consolidated Act was printed under L.N. 192A/2017 and 104A/2019. Two of its most-quoted figures
have since moved by instruments made *under* the Act, so the printed text is now wrong on both:

- **Section 4(1)(a) says 16.5%.** The standard rate has been **15% since 1 April 2020.**
  Section 4(2) lets the Minister change the rate by order, so the Act's own number is only ever a
  snapshot. (TAJ's own website still shows 16.5% in places.)
- **Section 27 points to the Regulations for the threshold.** That figure is now
  **J$15 million** in a 12-month period, raised from J$10 million on **1 April 2025**.

Everything else in this guide cites the Act as printed. Treat rates, thresholds and monetary
penalties as the moving parts — confirm them against Tax Administration Jamaica before relying on
a number.

### Key figures at a glance

| Item | Current | Note |
|---|---|---|
| Standard rate | **15%** | Not the 16.5% printed in the Act |
| Registration threshold | **J$15,000,000** | Rolling 12 months, or J$1,250,000/month average, from 1 Apr 2025 |
| Return cycle | **Monthly** | Required even when you traded nothing |
| Record retention | **6 years** | Matches the s. 38(6) assessment window |

---

## Table of contents

1. [How the tax actually works](#1-how-the-tax-actually-works)
2. [Rates and the four classes of supply](#2-rates-and-the-four-classes-of-supply)
3. [Registration](#3-registration-who-when-and-what-happens-if-you-dont)
4. [What counts as a supply](#4-what-counts-as-a-supply)
5. [Time of supply — the cash-flow rule](#5-time-of-supply--the-cash-flow-rule)
6. [Value of supply](#6-value-of-supply--what-you-charge-tax-on)
7. [Place of supply and imported services](#7-place-of-supply-and-imported-services)
8. [Input tax credits — and where they are blocked](#8-input-tax-credits--and-where-they-are-blocked)
9. [Invoices, receipts, and what you are bound by](#9-invoices-receipts-and-what-you-are-bound-by)
10. [Returns, payment, and records](#10-returns-payment-and-records)
11. [Refunds, credits and deferment](#11-refunds-credits-and-deferment)
12. [Special regimes you may be caught by](#12-special-regimes-you-may-be-caught-by)
13. [Changes of status, cessation, and exit](#13-changes-of-status-cessation-and-exit)
14. [Penalties and offences](#14-penalties-and-offences)
15. [Objections and appeals](#15-objections-and-appeals--the-clocks-that-run-against-you)
16. [Sector notes: where classification actually bites](#16-sector-notes-where-classification-actually-bites)
17. [The monthly cycle](#17-the-monthly-cycle)
18. [Traps register](#18-traps-register)

---

## 1. How the tax actually works

GCT is a credit-invoice value added tax wearing a different name. You are not taxed on your sales;
you are taxed on the value you add, because you deduct the tax you paid on inputs from the tax you
charged on outputs and remit the difference.

**s. 3(1)** — Tax is imposed on two things: the **supply in Jamaica of goods and services by a
registered taxpayer in the course or furtherance of a taxable activity**, and the **importation
into Jamaica of goods and services**. Note the asymmetry — supply is only taxed if *you* are
registered, but importation is taxed regardless of who imports.

**s. 3(2)** — It is paid by a registered taxpayer, and by any other person who imports goods and
services. An unregistered person who imports still pays at the border.

**s. 20(1)–(2)** — For each taxable period you calculate what is payable in accordance with the
Regulations and pay it over. The amount is **total output tax less total input tax** (or such
portion of input tax as is prescribed).

```
tax payable  =  output tax  −  allowable input tax

output tax   =  tax you charged on your taxable supplies
input tax    =  tax charged to you on goods/services acquired
                wholly or mainly for making taxable supplies
```

**s. 20(3) — the two taxes never mix.** GCT input cannot be deducted from Special Consumption Tax
output, and SCT input cannot be deducted from GCT output. If you manufacture or import prescribed
goods (alcohol, tobacco, fuel, e-cigarettes) you run two separate ledgers and file two separate
returns.

> **The economic point.** GCT is a cost to you only where the chain breaks — where you make exempt
> supplies, or where the Regulations block a credit. Everywhere else you are an unpaid collector,
> holding the Crown's money between charging it and remitting it. Price and forecast accordingly:
> the GCT sitting in your bank account is never working capital.

---

## 2. Rates and the four classes of supply

Every line item you sell falls into exactly one of four buckets. Getting the bucket wrong is the
single most expensive classification error in the system, because two of the buckets look identical
to the customer and behave in opposite ways for you.

### Rates in force

| Supply | Rate | Authority |
|---|---|---|
| Standard — everything not otherwise specified | **15%** | s. 4(1)(a), as amended by order under s. 4(2). Printed Act still reads 16.5% |
| Telephone services, phone cards, prepaid vouchers, prepaid airtime, telephone instruments | **25%** | 1st Sch. Pt IV & Pt IVA |
| Tourism activities — hotel, resort cottage, camping site, other tourist accommodation, water sports, an attraction, a tour operator | **10%** | 1st Sch. Pt V |
| Second sale of a motor vehicle by a person who is *not* a registered taxpayer | flat $ | s. 3(1A); 1st Sch. Pt I Grp III. $10,000–$20,000 by class; payable by the purchaser on transfer; no tax if the vehicle is over ten years old |
| Zero-rated — exports, agricultural and fishing inputs, diplomatic supplies, residential electricity, going-concern transfers | **0%** | s. 24; 1st Sch. Pt II |
| Exempt — no tax charged, no credit recoverable | n/a | s. 25; 3rd Sch. |
| Advance GCT on commercial importation, on top of the standard rate | **+5%** | 1st Sch. Pt VII |

### Zero-rated and exempt are not the same thing

Both mean the customer pays no GCT. The difference is entirely on your side of the ledger, and it
decides whether GCT is a cost of doing business or not.

| | Zero-rated | Exempt |
|---|---|---|
| Is it a taxable supply? | **Yes — at 0%** | **No** |
| Charge tax to the customer | No | No |
| Recover input tax on related costs | **Yes, in full** | **Blocked** |
| Counts toward the registration threshold | Yes | No |
| Effect on your margin | Neutral — you may run a permanent refund position | GCT on your inputs becomes an unrecoverable cost you must price in |
| Registration | Register normally | Exempt from registration in respect of those goods and services (s. 29(1)) |

> **⚠️ The exempt-supplier trap.** If your output is exempt, every supplier's GCT sticks to you.
> A business selling exempt services at a price set as if GCT were recoverable is quietly running a
> 15% margin leak on its taxable cost base. Model your pricing on **GCT-inclusive** input costs
> whenever the output is exempt.

### Extracting tax from a tax-inclusive price

Retail prices are usually quoted inclusive. To split them, multiply the gross by the tax fraction:

```
15%  →  15/115  =  3/23   ≈ 0.130435 × gross
25%  →  25/125  =  1/5    =  0.2      × gross
10%  →  10/110  =  1/11   ≈ 0.090909 × gross
```

Round the tax at the invoice level, not the line level, and be consistent — TAJ reconciles the
return to your ledger totals, not to individual receipts.

**s. 21 — foreign currency.** Consideration in a foreign currency converts to Jamaican dollars at
the rate specified by the Bank of Jamaica **at the time the tax becomes due and payable** under
s. 5 or s. 12 — not at the invoice date, not at the settlement date, and not at your accounting
system's month-end rate.

---

## 3. Registration: who, when, and what happens if you don't

Registration is not a choice you make when you feel ready. Liability to be registered attaches by
operation of law the moment you carry on a taxable activity, and the Commissioner General can
register you retroactively and assess you for the whole intervening period.

### What is a "taxable activity" — s. 2(1)

Any activity carried on in the form of a business, service, trade, profession, vocation,
association or club — **whether or not for pecuniary profit** — that involves or is intended to
involve supplying goods and services to another person for a consideration, and is carried on
continuously or regularly.

It **excludes**:
- a private recreational pursuit or hobby;
- employment under a contract of service;
- a company directorship;
- anything in the Third Schedule.

It **includes** anything done in connection with commencing or terminating the activity — so
pre-trading and wind-down costs are in scope.

> **Employee or contractor — it matters here too.** Employment under a contract of service is
> carved out of "taxable activity". A genuinely independent contractor supplying services for a
> consideration *is* carrying one on, and once past the threshold must register and charge GCT on
> their fees. If you engage a large contractor workforce, the classification decision has GCT
> consequences on top of the payroll ones.

### The duty to apply — s. 26

Every person carrying on a taxable activity **is liable to be registered and shall apply** in the
prescribed form. Where a partnership carries it on, the application is for the partnership. The
application must be made within **21 days after commencement** of the taxable activity; the
Commissioner may extend this if satisfied circumstances warrant it.

### The threshold test — s. 27(1)

The Commissioner General registers you as a **registered taxpayer** where:

- (a) the gross value of your supplies over the month of application plus the eleven preceding
  months meets the prescribed value; or
- (b) for a shorter trading history, the average monthly gross supplies meet the prescribed monthly
  value; or
- (c) you are a **manufacturer of prescribed goods** — in which case there is no threshold at all.

Currently: **J$15,000,000 over 12 months**, or an average of **J$1,250,000 per month**, from
1 April 2025.

### Registered person vs registered taxpayer

TAJ operates two statuses under one registration process:

- **Registered person** — below the threshold. You have a TRN and a GCT record, but you do not
  charge or collect GCT and cannot claim input credits.
- **Registered taxpayer** — at or above it, per s. 2. Liable to pay tax under the Act, and entitled
  to credit. **Only this status may issue a tax invoice.**

### Compulsory registration and the backdated assessment — s. 28, s. 38(4A)

Where the Commissioner General has reason to believe a person liable to be registered is not
registered, the Commissioner **shall** register that person. The date of registration is the date
the person's gross supplies first equalled the prescribed amount — **not the date TAJ noticed**.

The Commissioner may then assess the tax deemed due on the supplies deemed taxable **for each
taxable period from that date**. You are liable for GCT you never charged your customers, on top of
the failure-to-register penalty in s. 54(1).

> **🚨 Do not charge tax you are not registered to charge.** A person who is **not** a registered
> taxpayer and who collects tax commits an offence and is liable to a fine **up to five million
> dollars** or twelve months' imprisonment, or both (s. 56(5)). Displaying a document purporting to
> be a certificate of registration when you are not registered is a separate offence (s. 55(1)).
> There is no benign version of charging GCT early.

### Related obligations once registered

**s. 30 — Partnerships.** Register in the trading name; individual partners are not separately
registered for that activity. Supplies made or received in furtherance of the partnership are
treated as the partnership's. A change of partners does not affect the business. Partners are
**jointly and severally liable** for the partnership's obligations, and a partner does not cease to
be one until the Commissioner receives written notice — the exception being a sleeping partner who
contributes capital but has no part in day-to-day operations. "Partnership" here includes a joint
venture, an unincorporated body, and trustees of a trust.

**s. 32 — Notify change or cessation within 21 days**, in writing:
- sale or transfer of the activity or any part of it (with date, and the new owner's name and address);
- change of name, address, constitution or nature;
- date of cessation;
- change of partners;
- any other change affecting registration.

A person who *acquires* a taxable activity or part of one must also notify within 21 days.

**s. 32A — Display the certificate** conspicuously at the premises — a copy at each premises if you
trade from more than one. Non-compliance draws a contravention notice, then escalating penalties of
$10,000, $20,000 and $30,000 for first, second and third contraventions.

**s. 58 — Non-resident taxpayers.** Where a registered taxpayer is not resident in Jamaica, the
resident agent or person in charge of the taxable activity must perform its obligations and
discharge its liabilities, and must **keep any tax payable in a separate account** and pay it over.
Contravening this is an offence by the agent personally.

---

## 4. What counts as a supply

"Supply" is broader than "sale". Several ordinary commercial events are deemed to be supplies and
generate output tax even though no customer paid you anything, and the residual definition catches
almost everything that is not a supply of goods.

### s. 18(1) — the base definition

Supply **includes**:
- the sale, transfer or other disposition of goods by a registered taxpayer such that the goods
  leave the assets of the taxable activity;
- the exercise of a power of sale by a non-taxpayer in satisfaction of a registered taxpayer's debt;
- the provision of services.

It **excludes**:
- using an asset of the activity as loan collateral;
- transferring an asset to a trustee on appointment;
- a free transfer of an asset worth **under $100** not forming a series of gifts to the same person;
- a sample not ordinarily available for use as a taxable supply;
- an unconditional gift of an asset or services to a charitable body approved by the Minister.

**s. 18(6) — the catch-all:** anything which is not a supply of goods but is done for a
consideration is a supply of services. There is no third category to fall into.

### Deemed supplies — output tax with no customer

**s. 18(2) with s. 7(3) — Own use of stock.** Where you take goods from the stock of your taxable
activity for yourself or for another business you carry on, and tax would have been payable had you
supplied them to someone else, that use is a taxable supply. The value is the **cost you incurred
in acquiring the supply**, not market value. Staff consumption, samples-turned-gifts, directors'
drawings and internal transfers to a non-taxable division all land here.

**s. 18(4) — Reimbursements and recoveries.** Where a registered taxpayer receives an amount by way
of reimbursement, recovery *or otherwise* in respect of goods or services it acquired for making
taxable supplies, it is **deemed to have made a taxable supply** and that amount is the
consideration. Rebilled disbursements, cost recharges to affiliates, insurance recoveries on
business assets and customer-reimbursed expenses are output-taxable unless you can show the
underlying acquisition was not for making taxable supplies.

**s. 18(3) — Forfeiture and distribution.** Where an asset used as loan collateral is forfeited to
the lender on default, or a trustee distributes the assets of an estate or a company of which the
asset forms part, that forfeiture or distribution is deemed a supply.

**s. 18(7) — Undisclosed agency.** Where an agent supplies in its own name and refuses on request
to disclose its principal, the Commissioner may treat the supply as a supply *to* and *by* the
agent — collapsing one transaction into two taxable ones, with the agent carrying both.

**s. 18(9) with 1st Sch. Pt II Grp 10 ¶8 — Selling the business.** The sale, transfer or other
disposition of a taxable activity, or a separately operable part of it, *is* a supply of goods made
in the course of the activity. It is **zero-rated** where it is a supply by one registered taxpayer
to another, as a going concern, and the Commissioner General is satisfied it was done in accordance
with regulation 28. Miss the conditions and the whole consideration attracts GCT.

### Fourth Schedule — matters that constitute the provision of services

- Producing goods as a consequence of treating or processing someone else's goods
- Supplying water (other than in a container), electricity, refrigeration, air-conditioning
- **Hiring, leasing or renting goods** — other than under a hire-purchase agreement
- Supplying, otherwise than by sale of real property, anything for a consideration that is not a
  supply of goods
- Supplying drinks or meals in a bar, canteen, club, hotel, restaurant, similar place of business,
  or a catering service — excluding a cafeteria or canteen of an approved educational institution

Consideration under a timeshare contract governed by the Timeshare Vacations Act is construed as a
sale of real property, which is outside "goods" entirely (4th Sch. ¶2).

**s. 18(5) — resolving doubt.** If you and a counterparty genuinely dispute whether something is a
supply of goods or of services, **the parties may refer the dispute to the Commissioner for
determination**. Use this rather than picking a treatment and hoping.

---

## 5. Time of supply — the cash-flow rule

GCT accrues on the earliest of three events, and issuing an invoice is one of them. You can owe the
Crown tax on a sale you have not been paid for, in a period that closes before the customer's terms
even expire.

**s. 6(1)** — A taxable supply takes place on **whichever first occurs** of:

1. an invoice for the supply is issued by the supplier;
2. payment is made for the supply;
3. the goods are made available, or the services are rendered, to the recipient.

> **⚠️ Invoice discipline is cash-flow discipline.** Invoicing on the 28th with 60-day terms puts
> the output tax in *this* period, payable by the end of *next* month — roughly a month before the
> customer pays you. Two practical controls: never raise an invoice ahead of delivery unless you
> have to, and hold the GCT element of every receipt separately so you are not funding remittances
> out of trading cash.

### Special timing rules

| Situation | Time of supply | Cite |
|---|---|---|
| Hire-purchase agreement, or an arrangement where the recipient may return the goods | When the goods are made available to the recipient — the full value, up front | s. 6(2) |
| Goods or services supplied progressively or periodically, with consideration paid from time to time on invoices | Earliest of: invoice given, payment made, or **payment becoming due** | s. 6(3) |
| Contract with retention pending satisfactory completion | On the retained portion: when that payment becomes due to, or is received by, the supplier — whichever is earlier | s. 6(4) |
| Supply appropriated for someone other than the purchaser, total consideration not yet determined | Earliest of: consideration or part becoming payable, being received, or a tax invoice being issued | s. 6(5) |
| Coin- or token-operated machine, meter or device | When the coin or token is removed from the machine by or for the registered taxpayer | s. 6(6) |
| Supply by an insurer under a contract of insurance | When payment is made to the broker or insurer. "Contract of insurance" here excludes life assurance, health insurance and re-insurance | s. 6(7)–(8) |
| Imported goods | When entered for home consumption under the Customs Act | s. 5(a) |

> **Subscriptions and retainers.** Recurring billing is the classic s. 6(3) case. Note the third
> limb — **payment becoming due** triggers the supply even if no invoice went out and nothing was
> collected. A failed card charge on a monthly plan does not defer the GCT; the tax point has
> already passed.

---

## 6. Value of supply — what you charge tax on

The taxable value is not always the price on the invoice. Five rules cover consideration in money,
in kind, in part, absent, and between connected persons.

### s. 7(1)

- **(a) Wholly money** — value is the consideration, **including duties, levies, fees, charges and
  Special Consumption Tax**, but excluding GCT itself. GCT sits on top of SCT, not beside it.
- **(b) Partly money** — value is open market value.
- **(c) Supply is not the only matter the consideration covers** — value is the part of the
  consideration applicable to the supply. This is your authority to apportion bundles, and your
  obligation to do it on a defensible basis.
- **(d) No consideration** — open market value.
- **(e) Wholly in kind** — open market value. Barter, contra deals and payment-in-services are
  taxable at market value on both sides.

### s. 7(2) with s. 2(1) — connected persons

Where the consideration is payable by a connected person (as defined in the Income Tax Act), the
value is **open market value** — the money consideration, excluding tax, that the Commissioner
General is satisfied would be payable by a non-connected person in an arm's length transaction.
Intercompany service charges, management fees and related-party rentals are re-priced to market for
GCT whatever the contract says.

### s. 2(1) "consideration" — wider than you think

Consideration includes any payment, **or any act or forbearance**, in respect of, in response to, or
for the inducement of the supply — **whether by that person or by any other person**. Third-party
funding, platform subsidies, and promotional payments made by someone other than the recipient are
still consideration for the supply.

### s. 8 — imported goods

Value is the aggregate of:
- (a) the customs value;
- (b) customs duty payable;
- (c) any additional stamp duty on inward customs warrants;
- (d) any SCT payable;
- (e) any fees, levies and other taxes payable on importation.

Where the importer is **not** a registered taxpayer, an uplift is added — a percentage determined
by the Commissioner having regard to the retail price the supply would fetch — unless the
Commissioner of Customs is satisfied the goods are for personal use and not for resale
(s. 8(2)–(3)).

### Value overrides worth knowing

| Case | Rule | Cite |
|---|---|---|
| Telephone cards, prepaid vouchers, prepaid airtime | Value is the **face value**, notwithstanding s. 7 — including amounts added on recharge, whether or not that represents the value of the services the voucher buys | 1st Sch. Pt IV ¶2 |
| Tourism services at the 10% rate | Value **excludes gratuities paid to employees**, notwithstanding s. 7 | 1st Sch. Pt V ¶2 |
| Own use of trading stock | Value is the cost the taxpayer incurred in acquiring the supply | s. 7(3) |
| Motor vehicles under Group IV of Part I | Value is open market value | s. 7(2A) |

---

## 7. Place of supply and imported services

Jamaica taxes on a residence-and-use basis, and pushes the tax on inbound services onto the
recipient. If you buy software, advertising, consulting or platform services from abroad, you may be
the one who has to account for the GCT.

**s. 19 — Place of supply.** A taxable supply is deemed to take place in Jamaica if:
- (a) the supplier is resident in Jamaica; or
- (b) the supplier is not resident and —
  - (i) in the case of goods, the goods are in Jamaica at the time of supply; or
  - (ii) in the case of services, the services are **performed or utilized** in Jamaica.

**s. 2(1) "imported services"** — non-exempt services supplied to a person resident in Jamaica by a
person who is not resident in Jamaica, or by a resident where the services are supplied by a
business carried on outside Jamaica — to the extent the services are to be utilized or consumed in
Jamaica, and to the extent the supply would be a taxable supply if performed in Jamaica by a
registered taxpayer.

Note that "taxable activity" requires continuity *except* for imported services, where being
carried on **at least once** is enough (s. 2(1)(b)).

### s. 23B(1) — reverse charge

A service importer is **deemed to be the supplier** of the services, is liable to pay the tax to the
Commissioner General, and must file a return and pay under s. 33(1). This applies whether or not the
importer is a registered taxpayer — an unregistered importer is deemed to be a registered taxpayer
for this purpose. Value is determined under s. 7 (s. 23B(2)).

### s. 23B(3) — two exclusions

- A service importer who, in the twelve months immediately before receiving the services, made
  supplies with an **aggregate value under three million dollars**, excluding the value of imported
  services received in that period.
- A service importer who is an **individual**, in respect of imported services received for private
  use.

> **In practice.** A registered business self-accounts: it declares the output tax on the imported
> service and, where the service was acquired for making taxable supplies, claims the corresponding
> input credit — usually a wash, but a wash you must actually put through the return. If your output
> is exempt, the reverse charge is a **real cost**, because the credit side is blocked. Cloud
> subscriptions, offshore development, foreign advertising spend and overseas professional fees all
> belong on this list.

> **⚠️ Coming: GCT on foreign digital services.** Revenue measures tabled 12 February 2026 propose
> extending GCT to digitally supplied services and intangibles from abroad — streaming, e-books,
> software, app-store purchases and similar — collected from the non-resident supplier rather than
> the customer, expected to take effect early in 2027 subject to enabling legislation. **Nothing is
> enacted yet.** If you sell digital services into Jamaica from offshore, or buy them at scale,
> track the draft legislation.

### s. 23A — collection agents fixed by statute

Where the taxable activity is tourist accommodation or services offered to tourists through a
tourism enterprise, **the operator** is responsible for collecting the tax and paying it over under
s. 33(1). "Operator" is the person who owns the business, and includes its manager or other
principal officer.

Where a supply is made by an insurer under a contract of insurance arranged through a broker,
**the broker and the insurer are jointly and severally liable** to collect and pay the tax
(s. 23A(1A)).

---

## 8. Input tax credits — and where they are blocked

The credit is the whole point of the system, and it is also the most heavily conditioned part of it.
The Act sets the gateway; the Regulations set the restrictions.

**s. 2(1) "input tax"** — Input tax is tax charged under s. 3(1) on supplies made to you or on your
importation of goods and services, **being goods and services required wholly or mainly for the
purpose of making taxable supplies**; plus tax charged under s. 9 on manufacture or importation of
prescribed goods acquired wholly or mainly for manufacturing prescribed goods.

"Wholly or mainly for making taxable supplies" is the test everything turns on. A cost that supports
exempt output, or no output, fails it.

### Restrictions under the Regulations

These sit in the General Consumption Tax Regulations, principally regulation 14, and are
administered as follows. **They change more often than the Act — confirm the current version before
relying on a number.**

| Category | Treatment |
|---|---|
| Entertainment | Restricted — credit limited (administered at 50%) where the expense is entertainment or services incidental to providing it |
| Private motor car | Spread over 24 months; credit limited to a percentage of cost (administered at 7%), capped by reference to a JMD equivalent of US$35,000 |
| Other motor vehicles | Spread over 24 months; full tax creditable where the rate does not exceed the standard rate, or a percentage of cost (administered at 14%) for a vehicle that is not a private motor car |
| Capital goods | Immediate credit where the item costs $100,000 or less; otherwise recovered over 24 months |
| Mixed taxable and exempt activity | Full credit only where exempt supplies do not exceed 5% of total sales or $100,000, whichever is less; otherwise apportion |
| Group health insurance premiums | Not creditable — not incurred for the purpose of making a taxable supply (TAJ Technical Note, 2017) |
| Tourism-sector expenses | Restricted, consistent with the reduced output rate |

> **⚠️ The apportionment discipline.** If you make any exempt supplies at all — bank interest
> received, residential rent, an exempt transport leg — you are a partly exempt trader and must
> apportion. Build the apportionment into the monthly close as a calculation with a documented
> basis, not as a year-end adjustment. TAJ will ask for the method, and "we claimed it all" is an
> assessment waiting to happen.

**s. 20(2)(b)** — For prescribed goods, tax payable is output tax less **such portion of the input
tax as may be prescribed** — not necessarily all of it. Read the SCT credit rules separately from
the GCT ones.

> **No invoice, no credit.** The credit is evidenced by the tax invoice your supplier is required to
> issue under s. 22(a). If your supplier is not a registered taxpayer, there is no input tax to
> claim — whatever their price list says. Verify GCT registration numbers on your significant
> suppliers, and refuse to process a "GCT" charge from an unregistered vendor: paying it buys you
> nothing and funds someone else's s. 56(5) offence.

---

## 9. Invoices, receipts, and what you are bound by

The document you issue is not just a record of the transaction — under s. 49 it creates a liability
of its own. Whatever tax you state on an invoice is recoverable from you, even if the tax was never
chargeable and even if the supply never happened.

### s. 22 — what to issue

- **To another registered taxpayer:** issue a **tax invoice** containing the prescribed particulars
  — in practice your GCT registration number, the rate, and the tax amount.
- **To anyone else:** issue a **receipt showing separately** the value of the supply and the amount
  of tax chargeable — unless those particulars are clearly displayed on the supply itself, or in
  another prescribed manner.

### s. 49 — you owe what you wrote

Where an invoice or other document states that a taxable supply has been made and tax paid on it,
and the tax shown **exceeds the tax properly payable**, the amount shown as tax is recoverable from
the person who issued it — or, if not itemised separately, so much of the total as can be taken to
represent tax.

This applies **whether or not**:
- the issuer is a registered taxpayer;
- the invoice was issued under s. 22;
- **the supply was actually made**;
- the tax shown was chargeable at all.

> **🚨 Invoice offences.** Under s. 56E it is an offence, punishable by a fine up to **one million
> dollars** or twelve months' imprisonment or both, to knowingly issue a tax invoice or represent
> that tax is chargeable where no tax is chargeable, where the amount shown exceeds what is properly
> chargeable, or where **there is no intention to make a taxable supply** — and equally to **fail to
> issue** a tax invoice under s. 22.

### System requirements this implies

- Tax must be a separate, stored field on every document — never derived at print time.
- Credit notes must reverse the tax as well as the value, and must be traceable to the original
  invoice.
- Rate must be stamped on the transaction at the tax point, so a future rate change never restates
  history.
- Exempt and zero-rated lines must be distinguishable in the data — you will need both totals for
  the return, and they behave differently for credit purposes.
- Invoice numbering must be gapless and immutable; a cancelled invoice is credited, not deleted.

---

## 10. Returns, payment, and records

**s. 33(1)** — Within the prescribed period, and **whether or not you made a taxable supply during
the taxable period**, a registered taxpayer must furnish a return in the prescribed form and pay the
tax, if any, payable for that period. **Nil returns are compulsory.**

### Filing calendar and forms

| Item | Detail |
|---|---|
| Taxable period | Monthly for most registered taxpayers |
| Return and payment due | **The last working day of the month following** the end of the taxable period — January's return is due by the last working day of February. TAJ occasionally extends by public notice; do not assume an extension |
| GCT return | Form 4A, filed online through TAJ's portal |
| Special Consumption Tax | Form 4C — separate return, separate ledger |
| Tourism activities | Form 4D |
| General insurance | Form 4E |
| Final return on ceasing to be registered | Not later than **one month** from the date of ceasing, for the last taxable period (s. 33(2)) |

**s. 33(3), s. 35** — The Commissioner may require any other information relating to the return that
is considered necessary. You may request an amendment to a filed return, and the Commissioner
**shall** amend it upon being satisfied it ought to be amended — an error found is an error to
correct, not to bury in the next period.

**s. 34 — Branches and divisions.** Where a taxable activity is carried on in more than one branch
or division, you may apply in writing for permission to file separate returns for each. The
Commissioner must be satisfied each branch:
- (a) maintains an **independent system of accounting**; and
- (b) can be separately identified by the nature of activities at its location.

Permission is revocable for breach of conditions, if the requirements stop being met, or at your
written request. An entity inside a GCT group cannot use this (s. 32D(2)).

### s. 36 — Records

Every registered taxpayer must keep the prescribed accounts, books and records; produce them to an
authorized person at the time and place specified; and produce such other information as required.
TAJ's stated retention period is **six years**, covering sales and purchase invoices, tax invoices,
credit and debit notes, and a GCT Account.

Six years is not arbitrary — it is exactly the window in which the Commissioner may raise or
increase an assessment under s. 38(6). Destroy records earlier and you disarm yourself in the only
period that matters.

**s. 53, s. 56C — Inspection.** An authorized person may enter your business premises during
business hours and take samples of any taxable supply found there, where expedient for the
protection of the revenue. Wilfully hindering or obstructing an authorized person, failing without
lawful excuse to comply with a requirement within a reasonable time, impersonating an authorized
person, or threatening one, is an offence carrying up to **$500,000** or six months' imprisonment.

### s. 38, s. 39 — Assessments

The Commissioner General **shall** assess where you fail to furnish a return, or furnish one that
appears incomplete or incorrect; and may assess what you ought to have stated where not satisfied
with your calculations or basis, stating the general basis of the assessment.

There is a specific power to assess tax on goods that no longer form part of your taxable supply and
for which no satisfactory account can be given (s. 38(4)) — **stock shrinkage is an assessment risk,
not just an inventory problem.**

- **Six-year limit** on making or increasing an assessment (s. 38(6)).
- **Except** where a taxpayer with intent to defraud failed to make full disclosure of the material
  facts, in which case the Commissioner may assess or alter **at any time** (s. 38(7)).
- Except in objection proceedings, every assessment is **deemed correct** and the liability
  determined accordingly; an assessment is valid notwithstanding any error, defect or omission
  (s. 38(9), s. 39).

### s. 48, s. 50 — Recovery

The Tax Collection Act applies. Penalty, surcharge and interest may be added to the tax and
recovered as if they were tax, and may be sued for in the Revenue Court or a Resident Magistrate's
Court as a debt due to the Government.

**Third-party recovery:** where you are in default, the Commissioner may notify any person who owes
you money or holds money on your behalf — a customer, a bank — and require them to pay it over. The
debtor is treated as acting on your authority and is indemnified for the payment; if the debtor
fails to pay, the unpaid amount is deemed to be tax owed by *them* (s. 50(4A)).

---

## 11. Refunds, credits and deferment

### s. 46 — tax paid in excess

- Prove to the Commissioner's satisfaction that you paid more than you were properly chargeable in a
  taxable period, and you are entitled to a refund of the excess.
- **Set-off:** where you have unpaid tax, the Commissioner may set the refund against it and must
  inform you.
- **Withholding:** where any return is outstanding, the Commissioner may withhold the refund until
  the return is received — after giving written notice.
- **Time limit:** apply within **six years** of the last day of the taxable period in which the
  excess was paid; but only **two years** after ceasing to be a registered taxpayer.
- **Interest to you:** where a refund is not made within **three months** of the claim being
  received, interest at **2.5% per month or part thereof** runs from the end of those three months
  to the date of refund.

### Other refund and relief routes

| Route | Who and what | Cite |
|---|---|---|
| Deferment on importation | An approved registered taxpayer may import specified goods (machinery, equipment, spare parts qualifying for customs relief under Part 5 of the Third Schedule to the Customs Tariff) without paying GCT at the port, on proof of clean filing and payment history plus security; the tax is then accounted for in the return for the period of importation | s. 42 |
| Manufacturer of exempt goods | An unregistered manufacturer of Part 1 or 1C Third Schedule goods, not entitled to input credit, may apply for a refund of GCT on inputs that would have qualified for customs relief | s. 42A |
| Registered charitable organization | Acquired a zero-rated supply for its work, nevertheless paid tax, and cannot claim input credit — apply **within two years** of payment | s. 43 |
| Non-registered exporter | Buys a taxable supply from a registered taxpayer for export or shipment as stores — apply on exportation for refund of the tax paid | s. 45 |
| Motor spirit and diesel in special circumstances | Persons within Item 2, Group 4, Part II of the First Schedule may apply for refund on purchase | s. 44 |
| Ministerial waiver | The Minister may waive, remit or refund any tax where just — but **not** for supplies to a registered charitable organization | s. 47 |

---

## 12. Special regimes you may be caught by

### Advance GCT on commercial imports — 1st Sch. Pt VII

In addition to the standard rate, a **5% Advance GCT Payment** is payable by **commercial
importers** on importation, valued under s. 8(1). A commercial importer is a registered taxpayer
who, in relation to a taxable supply, imports goods the Commissioner of Customs is satisfied are for
resale or for use in carrying on a taxable activity, and not for personal use.

The Advance payment is **allowed as a credit** in addition to input tax under regulation 14, and
your output tax remains at the s. 4(1)(a) rate — so it is a **timing cost, not a rate increase**,
provided you actually claim it.

**It does not apply to:**
- (a) petroleum products specified in the Second Schedule;
- (b) capital goods within the meaning of the Customs Act;
- (c) goods to which s. 42 (deferment) relates;
- (d) goods provided for under Parts II and IVA of the First Schedule;
- (e) goods provided for under Parts I and II of the Third Schedule;
- (f) goods imported under s. 8(2);
- (g) specified imported raw foodstuff (Items 6 and 6A of the Third Schedule, excluding imported
  apples, pears, quinces, apricots, cherries, peaches, nectarines, plums, sloes, berries, grapes and
  kiwis);
- (h) goods imported under Parts 5, 6, 7 and 8 of the Third Schedule to the Customs Tariff which are
  exempt from customs duties.

> **⚠️ Cash-flow, not cost.** An importer/reseller funds roughly 20% at the port and recovers 5
> points of it on the next return. If you import monthly and file monthly, you are permanently
> carrying about one month of Advance GCT. Budget it as working capital, and reconcile Advance GCT
> claimed against customs entries every period — it is one of the easiest credits to lose track of
> and one of the easiest for TAJ to test.

### GCT withholding on government sales (administrative regime)

Ministries, departments, agencies and designated public bodies acting as Tax Withholding Entities do
**not** pay you the GCT on your invoice. They withhold it and issue a **Withholding Tax Certificate
(Form 5)** within 30 days of receiving the invoice, then remit to TAJ directly.

You still declare the full output tax on your return, and claim the WTC amount as a credit against
it. Practical consequence: **if you do not collect the certificate, you pay the tax twice.** Treat
WTC retrieval as part of the receivables process, not the tax process, and reconcile certificates to
government invoices every month.

### GCT groups — Part VIA, ss. 32B–32M

Two or more **affiliated entities** may be approved to be treated as a **single taxpayer**. The
Commissioner General must be satisfied the treatment is not likely to prejudice collection, cause
significant revenue loss, or facilitate a tax advantage (s. 32C(1)).

**Each entity must** (s. 32D(1)):
- be affiliated with every other entity in the group;
- have a **permanent establishment in Jamaica**;
- use the **same accounting basis** (cash or accrual) as the others;
- not be in another GCT group; and
- have **no outstanding liability for revenue** under this or any other revenue law.

**Effect once approved** (s. 32G):
- Every member's taxable activity is deemed carried on by the **representative entity**, and not by
  anyone else.
- Supplies made to, and by, members are deemed made to and by the representative entity.
- **Intra-group taxable supplies are disregarded entirely** — the core benefit.
- The representative entity claims the group's input credits and receives any credit or refund due
  to a member.
- **Every entity is jointly and severally liable** for tax payable by the representative entity, and
  that liability survives leaving the group.
- Notice served on the representative entity is deemed served on every member (s. 32M).

Approval can be revoked where the main purpose or effect of the arrangements was to obtain a tax
advantage, or where the representative entity has not complied (s. 32J). The representative entity
must notify the Commissioner General of any revocation-triggering circumstance **within 30 days** of
becoming aware of it (s. 32H(6)).

Appeals under this Part go to the Commissioner of Taxpayer Appeals within 30 days, then the Revenue
Court within 30 days (s. 32L).

### Special Consumption Tax — Part III, ss. 9–17

SCT is a separate tax on the **manufacture in, or importation into, Jamaica of prescribed goods** —
alcohol, tobacco, petroleum products, electronic cigarettes and the rest of the Second Schedule. It
is payable by every registered taxpayer who manufactures prescribed goods and by any person who
imports them (s. 11). A manufacturer of prescribed goods must register for GCT **regardless of
turnover** (s. 27(1)(c)).

SCT becomes due immediately before goods are removed from the factory (or from the excise
warehouse), and, for imports, when entered for home consumption (s. 12). SCT paid forms **part of
the value** on which GCT is then charged (s. 7(1)(a)).

Relief exists for goods shipped as stores or exported, delivered for the Jamaica Defence Force, or
lost or destroyed by unavoidable accident before delivery (ss. 15–16).

---

## 13. Changes of status, cessation, and exit

**s. 31 — Cancellation.** The Commissioner General **shall** cancel registration where satisfied you
no longer qualify — but must first notify you in writing of the intention, state reasons, and offer
an opportunity to be heard. You may object under s. 40(1) to a proposed cancellation. On
cancellation you must return the certificate **forthwith**; failing to do so is an offence carrying
a fine up to $100,000 (s. 55(2)).

### s. 23 — the exit charge

Where a registered taxpayer ceases to be registered, **tax is payable on any taxable supply forming
part of the assets of the taxable activity immediately before ceasing**. Deregistering with stock,
equipment or vehicles on the books triggers output tax on them.

**It is not payable if:**
- (b) the taxable activity is carried on by someone else after the taxpayer is declared bankrupt, is
  certified otherwise incapable of carrying it on, or has died; or
- (c) the taxpayer proves to the Commissioner General's satisfaction that —
  - (i) **no credit for input tax was allowed** in respect of the supply; or
  - (ii) the supply was **not part of the assets of a taxable activity acquired from another
    registered person**.

**s. 59 — Liabilities survive.** Obligations and liabilities incurred while registered are **not
affected** by ceasing to be registered. Deregistration closes the future, not the past — and the
six-year assessment window keeps running.

---

## 14. Penalties and offences

The Act separates civil penalties, which attach automatically, from criminal offences, which require
prosecution. The heaviest exposure is around money you collected as tax and did not pay over.

### Civil penalties under s. 54

| Failure | Penalty | Cite |
|---|---|---|
| Required to be registered and failed to apply | The **greater** of $10,000, or a penalty **equal to the tax that would have been payable** had you been registered from the date you were required to apply until you apply or are registered — plus interest | s. 54(1) |
| Failed to pay the full tax due under s. 33 for a period | **10% of the amount unpaid**, plus interest | s. 54(2) |
| Failed to make a return under s. 33 | The **greater** of $10,000, or 10% of the tax due for the period, **capped at $100,000** — plus interest | s. 54(3) |
| Anything above, left unpaid | Interest at **1.5% per month or part of a month** on the total, until payment | s. 54(4) |

> **⚠️ Two penalty systems overlap.** Alongside these, TAJ administers a general late-filing penalty
> for outstanding returns (commonly cited at **$5,000 per return per month or part thereof**) and
> charges interest on outstanding balances at an administratively set annual rate. The Minister can
> amend every monetary penalty in the Act by order (s. 64), and the rates in force change. **Never
> quote a penalty figure from a printed copy of the Act without checking it.**

### Criminal offences — maximum penalties on summary conviction

| Offence | Maximum | Cite |
|---|---|---|
| Collecting tax on behalf of the revenue and **neglecting to pay it over** | $1M or 3× the tax, whichever is greater; and/or 12 months | s. 56(4) |
| **Not being a registered taxpayer and collecting tax** | $5M and/or 12 months | s. 56(5) |
| Entering an arrangement with intent to defraud the revenue / to evade tax | $1M or 3× the tax, whichever is greater; and/or 12 months | s. 56(1), (3) |
| False, incorrect or misleading declarations; knowingly furnishing false documents; falsifying a certificate; aiding and abetting | $3M and/or 12 months | s. 56B |
| Failure to keep prescribed records, or to produce records or information | $1M and/or 12 months | s. 56A |
| Hindering, obstructing, impersonating or threatening an authorized person | $500,000 and/or 6 months | s. 56C |
| Causing an excessive refund, or defaulting on a duty with that intent | $1M and/or 12 months | s. 56D |
| Invoice offences (see §9) | $1M and/or 12 months | s. 56E |
| Neglecting to inform of transfer of ownership, change of address or name, or cessation | $500,000 and/or 3 months | s. 55(3) |
| Any offence for which no penalty is otherwise provided | $1M and/or 12 months | s. 56F |

> **🚨 Directors and managers are personally exposed.** Where an offence against the Act is committed
> by a body corporate, **the managing director, manager or other officer concerned in the management
> is deemed to have committed the offence** — without prejudice to the company's own liability —
> unless at trial they prove the offence was committed without their knowledge, consent or
> connivance, *or* that they exercised all due diligence to prevent it, having regard to the nature
> of their functions and the circumstances (s. 56G).
>
> The defence is evidential and it is yours to make out. That is an argument for documented GCT
> controls, dated reviews and a named owner of the return — **the paper trail *is* the due
> diligence.**

### Anti-avoidance — s. 61, s. 61A

Where the Commissioner General is of the opinion that an **arrangement** — any agreement, scheme,
contract, plan, proposal, understanding or undertaking, express or implied, legally enforceable or
not, including all preparatory steps — has been entered into to evade tax or obtain a tax advantage
in a manner constituting a misuse of the Act, and that on its substance it was entered into for the
**sole or dominant purpose** of doing so, the Commissioner **shall treat the arrangement as void**
and may determine liability as if it had never been entered into.

Separately, any transaction that reduces tax and is **artificial or fictitious**, or where full
effect is not in fact given to a disposition, may be disregarded and the persons concerned assessed
accordingly (s. 61A). Both provisions apply expressly to GCT groups (s. 32K).

---

## 15. Objections and appeals — the clocks that run against you

Every step is time-limited, and one of them cuts both ways: if TAJ misses its own six-month
deadline, the assessment is null and void.

**1. Object to the Commissioner General — within 30 days.**
From the date of service of the notice of assessment or other decision. In writing, **stating
precisely the grounds** of objection. Applies to assessments, refusals to register, proposed
cancellations, and other decisions. *(s. 40(1))*

**2. Comply with any information requirement — or the objection dies.**
The Commissioner may require you to make a return, furnish particulars, produce books, or appear to
answer lawful questions, allowing not less than 30 days. **If you fail to comply, the notice of
objection ceases to have effect and the assessment as made is final and conclusive.**
*(s. 40(2)–(3))*

**3. The Commissioner's six-month deadline.**
Where the Commissioner **fails to hand down a decision within six months** of receiving the
objection, and the delay is not attributable to your omission or default, **the assessment is null
and void**. Diarise this date on every objection you file. *(s. 40(4)(b))*

**4. Appeal to the Commissioner of Taxpayer Appeals — within 30 days.**
From receiving the Commissioner General's decision on an assessment. Extension available where
absence from the Island, sickness or other reasonable cause prevented timely application. The
Commissioner of Taxpayer Appeals may confirm, reduce the amount, or vacate the decision.
*(s. 41(1)–(2))*

**5. Appeal to the Revenue Court — within 30 days.**
Or such longer period as rules of court permit. **The onus of proving the assessment erroneous is on
you.** The Court may, on the Commissioner General's application, order the assessed amount or part
of it to be paid, or security given, **as a condition precedent to hearing the appeal**. Grounds are
limited to those in the notice of objection unless the Court permits amendment. *(s. 41(3)–(6))*

### Two structural points

- A decision that is **not** an assessment — a registration refusal, a cancellation — goes directly
  to the Revenue Court within 30 days of receipt (s. 40(7)). GCT-group decisions have their own
  route (s. 32L).
- Note s. 39: outside objection proceedings, **no assessment may be disputed in court on the ground
  that the person assessed is not registered**, and every assessment and all its particulars are
  deemed correct. Objecting properly and on time is not a formality; it is the only door.

---

## 16. Sector notes: where classification actually bites

Most GCT disputes are classification disputes. These are the boundaries that separate near-identical
revenue lines into taxable and exempt — read them as a warning that a single business often sits on
both sides.

### Transport, delivery and mobility — 3rd Sch. Pt II ¶2, ¶2A; 4th Sch. ¶1(c)

- **Transportation of people within Jamaica is exempt** — *except* tour services rendered by tour
  operators, which are taxable (at the 10% tourism rate where the operator is licensed under the
  Tourist Board Act).
- **Tolls are exempt** — any toll, fee charge, levy due or compensation payable in relation to the
  use of a toll road or any portion of it, by vehicular or other traffic.
- **Hiring, leasing or renting goods is a taxable service.** Renting a vehicle to someone is
  taxable; carrying a passenger in one is exempt.
- The exemption is written for **people**. Moving goods — courier, freight, parcel and delivery
  services — is not within it, and is a standard-rated supply of services under s. 18(6).

> **⚠️ If you operate a platform.** A business that moves both passengers and parcels straddles the
> exempt/taxable line, which means it is a **partly exempt trader** and must apportion input tax.
> Three questions decide the treatment of each revenue line, and they should be answered in writing
> before the system is built:
>
> - **Who is supplying whom?** Is the platform supplying transport to the rider, or supplying an
>   intermediation service to the driver for a commission? A commission for facilitating a
>   transaction is not "transportation of people" — it is a standard-rated service, even where the
>   underlying ride is exempt.
> - **Are you an undisclosed agent?** Section 18(7) lets the Commissioner treat a supply by an agent
>   in its own name as a supply *to* and *by* the agent where the principal is not disclosed on
>   request. That collapses a commission model into a resale model and doubles the taxable
>   transactions.
> - **What are the fees?** Booking fees, service fees, cancellation charges, surge components,
>   subscription plans, advertising and delivery fees each need their own classification. A charge
>   that is not consideration for carrying a person is unlikely to be exempt — and recovering a cost
>   from a driver or merchant may be a deemed supply under s. 18(4).
>
> **There is no published TAJ guidance on ride-hailing or delivery platforms.** This is precisely the
> situation s. 18(5) and a written ruling request exist for — get the treatment confirmed before you
> price, not after you are assessed under s. 38(4A).

### Construction and property — 3rd Sch. Pt II ¶1, ¶4, ¶16

Construction, alteration, repair, extension, demolition or dismantling of buildings, structures and
civil works is **exempt** — including site clearance, excavation, foundations, scaffolding, site
restoration, landscaping and access works.

But four things are carved back **in** and remain taxable:
1. **installation** of heating, lighting, ventilation, power supply, drainage, sanitation, water
   supply, fire protection, air conditioning, elevators or escalators;
2. **internal cleaning** of buildings during construction, alteration, extension, repair or
   restoration;
3. **painting** internal or external surfaces;
4. **tillage operations**.

Rental of residential property used for residential purposes only is exempt. Strata corporation
services in respect of residential properties are exempt. Commercial rental is not.

### Financial services and insurance — 3rd Sch. Pt II ¶13, ¶23

A long list of financial services is exempt — money exchange, cheque payment/collection, letters of
credit, debt and equity security issuance and transfer, underwriting, provision of credit under a
credit contract, guarantees, life assurance contracts, superannuation interests, futures contracts,
and the payment of dividends and interest. Life assurance and health insurance services are exempt.

**Three things are expressly carved out and remain taxable** (¶23(1A)):
- commission earned by a life insurance salesman who is self-employed or engaged as an independent
  contractor;
- services rendered by an **accountant or attorney-at-law**;
- **fees or commission charged in respect of** the listed financial services.

The service may be exempt while the fee for arranging it is not.

### Health, education and essentials — 3rd Sch.

**Exempt:** medical, dental, nursing, optical and veterinary services and services under the
Professions Supplementary to Medicine Act; education or training at an approved institution; water
supplied to the public (excluding bottled); sewerage disposal; public postal and telegraph services;
Legal Aid Clinic services; betting, gaming and lottery services; undertaker services up to $100,000;
international travel tickets; and a long schedule of raw foodstuff, staples and medical appliances.

**Zero-rated** (Part II of the First Schedule), which is the better outcome: exports of goods and
services in prescribed circumstances; agricultural and fishing inputs; supplies to diplomats and
international organizations; goods for the Jamaica Defence Force; goods not situated in Jamaica at
the time of supply and not to be imported by the supplier; **electricity supplied to residential
customers for private and domestic use**; and going-concern transfers between registered taxpayers.

> **The one instinct to keep.** Exemption is written narrowly and is always attached to a described
> activity, never to an industry. "We're in construction" or "we're a transport company" does not
> determine the answer for any given invoice line. Classify the **supply**, line by line, against the
> Schedule text — and record the reasoning in a classification matrix your finance team maintains and
> your auditors can read.

---

## 17. The monthly cycle

A GCT close is a sequence, and the order matters — each step depends on the one before it. Run it
the same way every period and the return becomes a report rather than a project.

1. **Cut off at the tax point, not the ship date.** Pull every transaction whose s. 6 tax point falls
   in the period: invoices issued, payments received in advance, goods made available, services
   rendered, and amounts that became *due* under periodic contracts.
2. **Classify each revenue line.** Standard, telephone, tourism, zero-rated, exempt, or out of scope.
   Against the Schedules, not against habit. Anything new since last period goes to a named reviewer.
3. **Add the deemed supplies.** Own use of stock at cost (s. 18(2), s. 7(3)); reimbursements and cost
   recoveries (s. 18(4)); connected-party supplies restated to open market value (s. 7(2)); barter
   and in-kind consideration at market value.
4. **Run the reverse charge on imported services.** List every payment to a non-resident supplier for
   services utilized in Jamaica. Declare the output tax, and claim the matching credit only where the
   service supported taxable supplies.
5. **Assemble input tax from valid tax invoices only.** No invoice, or an invoice from an unregistered
   supplier, means no credit. Apply the regulation 14 restrictions — entertainment, motor vehicles,
   capital goods over $100,000 spread over 24 months.
6. **Apportion if you make any exempt supplies.** Full credit only within the de minimis. Otherwise
   apportion on your documented basis and keep the working.
7. **Bring in Advance GCT and withholding certificates.** Reconcile Advance GCT claimed to customs
   entries, and Withholding Tax Certificates to government invoices. Chase every missing Form 5
   before you file — an uncollected certificate is tax paid twice.
8. **Convert foreign currency at the s. 21 rate.** Bank of Jamaica rate at the time the tax became
   due — not the accounting rate.
9. **File and pay by the last working day of the following month.** Form 4A, even if nil. SCT goes on
   its own return. File before the deadline day itself — portal congestion is not a defence.
10. **Archive the evidence pack.** Return, computation, classification decisions, apportionment
    working, WTCs, customs entries and the invoice files. Six years, retrievable, matching the
    assessment window.

---

## 18. Traps register

The failures that produce assessments are rarely exotic. This is the short list worth auditing
yourself against once a quarter.

| Trap | Why it costs | Cite |
|---|---|---|
| Waiting to register until "the business is established" | Compulsory backdated registration plus an assessment for tax you never charged, plus a penalty equal to that tax | ss. 28, 38(4A), 54(1) |
| Treating exempt as if it were zero-rated | Input credits claimed that were never available; assessment plus 10% plus interest | ss. 24, 25, 2 |
| Accounting for GCT when the customer pays | The tax point was the invoice; the liability arose a period earlier | s. 6(1) |
| Rebilling costs to customers or affiliates without GCT | Reimbursements and recoveries are deemed taxable supplies | s. 18(4) |
| Intercompany charges at cost or at an agreed internal rate | Connected-person supplies are valued at open market value | s. 7(2) |
| Directors' or staff use of trading stock | Deemed supply at cost, output tax due | ss. 18(2), 7(3) |
| Skipping nil returns in a quiet month | Failure to file penalty, the greater of $10,000 or 10% of tax due | ss. 33(1), 54(3) |
| Buying from a non-resident and paying no GCT | Reverse charge output tax was yours to declare | s. 23B |
| Claiming Advance GCT irregularly, or not at all | 5% of import value silently written off | 1st Sch. Pt VII |
| Not collecting Withholding Tax Certificates from government customers | You declare output tax with no credit to set against it — the same tax paid twice | Administrative |
| Showing tax on an invoice for a supply that was cancelled | Recoverable from you regardless, unless properly credited | s. 49 |
| Unexplained inventory shrinkage | The Commissioner may assess tax on goods no longer part of your taxable supply | s. 38(4) |
| Deregistering with assets on the balance sheet | Exit charge on assets held immediately before cessation | s. 23 |
| Purging records at five years | The assessment window is six — indefinite where fraud is alleged | ss. 36, 38(6)–(7) |
| Letting an objection sit unanswered | Non-compliance with an information requirement makes the assessment final and conclusive | s. 40(3) |
| Not diarising the six-month objection deadline | A missed TAJ decision makes the assessment null and void — but only if you notice | s. 40(4)(b) |
| Charging "GCT" before registration is granted | Offence carrying up to $5 million | s. 56(5) |
| Collecting tax and using it as working capital | Offence carrying $1M or 3× the tax, and 12 months — with directors personally deemed liable | ss. 56(4), 56G |

### Five things to have in place

1. A **classification matrix** — every revenue line mapped to standard, telephone, tourism,
   zero-rated or exempt, with the Schedule reference and the date of the decision.
2. A **separate GCT bank position**, so collected tax is never confused with cash you own.
3. A **named owner** of the return, with a dated review by a second person — this is your s. 56G due
   diligence record.
4. A **supplier registration check** at onboarding, so you never pay GCT to someone who cannot charge
   it.
5. A **ruling request** for anything genuinely novel, before you launch it — s. 18(5) exists for
   exactly this, and a wrong answer compounds monthly.

---

## Scope, status and sources

This guide summarises the General Consumption Tax Act as consolidated to L.N. 192A/2017 and
L.N. 104A/2019, updated for the rate and threshold changes made under it since. It is a working
reference for operators, **not legal or tax advice**, and it does not reproduce the Regulations,
which carry much of the detail on input tax credits and prescribed particulars.

Rates, thresholds and monetary penalties are set by order and change — verify every figure against
Tax Administration Jamaica before relying on it, and take professional advice on any classification
that carries real money.

**Sources**

- [The General Consumption Tax Act — Laws of Jamaica](https://laws.moj.gov.jm/library/statute/the-general-consumption-tax-act)
- [Tax Administration Jamaica — General Consumption Tax](https://www.jamaicatax.gov.jm/general-consumption-tax1)
- [PwC Worldwide Tax Summaries — Jamaica, Other taxes](https://taxsummaries.pwc.com/jamaica/corporate/other-taxes)
- [Rate reduction to 15%, effective 1 April 2020](https://www.vatcalc.com/jamaica/jamaica-cuts-gct-rate-to-15-1-april-2020/)
- [Registration threshold raised to J$15M, effective 1 April 2025](https://www.vatupdate.com/2025/03/13/jamaica-raises-gct-registration-threshold-in-2025-26-budget/)
- [JIS — new filing due date for monthly GCT returns](https://jis.gov.jm/new-filing-due-date-monthly-gct-returns-now-effect/)
- [EY — Jamaica proposes extending GCT to digitally supplied services from abroad](https://www.ey.com/en_gl/technical/tax-alerts/jamaica-proposes-extending-general-consumption-tax-to-digitally-supplied-services-and-intangibles-from-abroad)
- [TAJ — GCT on Government Purchases](https://www.jamaicatax.gov.jm/gct-on-govt-purchases)

**In product:** Dominion Accounting → GCT → Knowledge base (this document).

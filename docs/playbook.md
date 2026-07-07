# The UAE Solana Payments Playbook

**Developer documentation, not legal advice.** This maps the UAE's payment
token rules onto a Solana stack so you know which questions to ask. Verify
anything you ship against the primary sources linked below and with UAE
counsel. Last reviewed: July 2026.

## TL;DR — what can I build?

| You want to… | UAE mainland answer |
| --- | --- |
| Accept crypto for coffee / rent / SaaS | Only **dirham payment tokens** from a CBUAE-licensed issuer. Not USDC, not USDT, not SOL. |
| Accept USDC | Only as payment **for virtual assets or their derivatives** (e.g. an NFT checkout), and only tokens from a CBUAE-**registered** foreign issuer. Or operate from a financial free zone (DIFC/ADGM) under its own rules. |
| Issue an AED stablecoin | CBUAE Payment Token Issuance licence. UAE-incorporated entity, AED 15M initial capital + 0.5% of outstanding tokens, 100% reserves, redemption at par by next business day. Not a grant-sized project. |
| Build a custodial wallet / payment app that holds users' payment tokens | Payment Token Custody and Transfer licence (or Non-Objection Registration if you already hold a VARA/SCA VASP licence). |
| Write open-source payment software, SDKs, reference tokens on devnet | Software itself is not a "Payment Token Service"; the entity *operating* it for UAE customers is what gets licensed. Stay non-custodial and devnet/test-only and you are building tooling, not performing a regulated service. **Confirm your exact model with counsel** — Fils sits deliberately in this lane. |
| Algorithmic stablecoin, privacy token payments | Prohibited outright. |

## The regulators, in one map

- **CBUAE** (Central Bank) — payments in the UAE. The
  [Payment Token Services Regulation](https://rulebook.centralbank.ae/en/rulebook/payment-token-services-regulation)
  (PTSR, effective June 2024; transition ended 14 June 2025) governs
  stablecoin issuance, conversion, custody & transfer across the UAE
  **except** the two financial free zones.
- **VARA** — Dubai's Virtual Assets Regulatory Authority; licenses virtual
  asset activities in Dubai (exchanges, brokers, custodians). VARA licensees
  performing *payment-token* services additionally need a CBUAE
  Non-Objection Registration.
- **SCA** — federal Securities & Commodities Authority; virtual asset
  activities outside Dubai's VARA perimeter.
- **ADGM (FSRA)** and **DIFC (DFSA)** — financial free zones with their own
  regimes, *excluded* from the PTSR. This is why USDC and RLUSD operate
  through ADGM FSRA recognition while mainland payments stay dirham-only.

## PTSR rules that shape a payments product

1. **Dirham-only for real-world payments.** A merchant in mainland UAE may
   accept crypto for goods/services only if it is a Dirham Payment Token
   issued by a CBUAE-licensed issuer (Art. 2). Foreign payment tokens
   (USD-denominated stablecoins) may only be *sold for use* or used as
   payment **for virtual assets**, and only if their issuer is
   CBUAE-registered.
2. **Licensing is by function**: Issuance / Conversion / Custody & Transfer.
   Banks and exchange houses can register for conversion; VARA/SCA-licensed
   custodians can register for custody & transfer of foreign tokens.
3. **Issuer obligations**: 1:1 reserves in segregated accounts, monthly
   attestations, redemption at par without delay (next business day),
   dirham tokens sold only to UAE-resident persons at issuance.
4. **Hard prohibitions**: issuing/promoting algorithmic stablecoins and
   privacy tokens; interest payments to tokenholders; lending client tokens.
5. **Federal Decree-Law 6/2025** widens the Central Bank's net to virtual
   assets infrastructure broadly — DeFi protocols, stablecoins, tokenized
   RWAs, wallets, bridges — with a **September 2026** compliance deadline.
   Expect the "non-custodial software is out of scope" line to keep
   narrowing; design so your regulated surface is small and explicit.

## Mapping this onto Solana

The PTSR reads like a Token-2022 configuration sheet:

| PTSR requirement (issuer) | Token-2022 mechanism |
| --- | --- |
| Control of distribution (KYC'd holders) | TransferHook extension → allowlist program ([`daed-hook`](../programs/daed-hook)) |
| Act on unlawful use / law-enforcement response | Freeze authority on the mint; `set_allowed(wallet, false)` |
| Redemption at par, burn on redemption | Mint/burn authority against reserve ops |
| AED denomination, fils precision | 2-decimal mint — raw integer amounts **are** fils |
| Auditable issuance | Mint supply is on-chain; attestations reference it |
| Optional privacy *without* being a privacy token | Confidential transfer extension keeps amounts private while identities/allowlists stay enforceable (regulatory posture differs from a privacy *token* — flag to counsel) |

Actors in a Solana Pay flow, and who is regulated:

- **Issuer** of the AED token — licensed (the heavy lane).
- **Merchant** accepting a licensed AED token — a tokenholder using a lawful
  means of payment; the acceptance itself is not a Payment Token Service.
  Their VAT/e-invoicing obligations are unchanged (receipts in
  [`@fils/core`](../packages/core) carry TRN + 5% VAT breakdown for this
  reason).
- **Non-custodial software** (this toolkit, a checkout page where funds move
  wallet-to-wallet) — not holding or transmitting tokens; keep it that way.
  The moment you take custody, batch, or convert, you are in licence
  territory.
- **Conversion providers** (AED token ↔ fiat/USDC ramps) — licensed or
  registered conversion service.

## The AED stablecoin landscape (July 2026)

| Token | Issuer | Chain(s) | Status |
| --- | --- | --- | --- |
| AE Coin | AED Stablecoin LLC | private/permissioned | first CBUAE-licensed (Dec 2024); Dubai Finance pilot |
| **AEDZ (Zand AED)** | Zand Bank | **multiple public chains** (EVM; XRPL under evaluation) | first regulated multi-chain AED on public blockchains (Nov 2025) |
| DDSC | IHC / Sirius / FAB | ADI Chain | live institutionally; VARA-exchange NOC (Jul 2026) |
| USDU | Universal Digital | — | USD-pegged, ADGM FSRA |
| RAKBank instrument | RAKBank | — | in-principle approval |

**None of these are on Solana yet.** That is the gap Fils exists to close:
the day an issuer deploys (or a registered foreign AED token lists), it is a
[registry entry](../packages/core/src/registry.ts) — the SDK, checkout, and
receipts already work.

## Practical guidance for builders

- **Develop against dAED on devnet.** It is shaped like the real thing
  (2 decimals, metadata, freeze, optional allowlist hook) and costs nothing.
- **Denominate in fils, integer math only.** `@fils/core` refuses sub-fils
  amounts for a reason: the on-chain unit must equal the legal unit.
- **Keep the regulated surface out of your codebase.** Let licensed
  issuers/ramps do issuance and conversion; your app should touch only
  payment requests, verification, and receipts.
- **Design receipts for the e-invoicing mandate.** UAE e-invoicing is
  phasing in from 2026–2027 (Peppol-based). A crypto payment does not exempt
  you; it just changes the settlement evidence.
- **Free-zone products are a different game.** If your model needs USD
  stablecoins for payments, build it from DIFC/ADGM under their regimes and
  do not point it at mainland persons.

## Primary sources

- CBUAE Payment Token Services Regulation — <https://rulebook.centralbank.ae/en/rulebook/payment-token-services-regulation>
- CBUAE licensing (Retail Payment Services & Card Schemes, PTSR guidance) — <https://www.centralbank.ae/>
- VARA rulebooks — <https://rulebooks.vara.ae/>
- ADGM FSRA virtual asset framework — <https://www.adgm.com/operating-in-adgm/fsra>
- Federal Decree-Law No. 6 of 2025 (Central Bank law amendments) — official gazette; summaries by UAE counsel
- Zand AED announcement — <https://www.zand.ae/en/news/zand-launches-uaes-first-aed-backed-stablecoin-on-public-blockchain>
- SPL transfer hook interface — <https://spl.solana.com/transfer-hook-interface>
- Solana Pay spec — <https://docs.solanapay.com/spec>

*Roadmap M3 puts this document through review by a UAE virtual-assets law
firm; wording will be corrected where counsel disagrees.*

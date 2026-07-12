# Grant Application: Solana Foundation UAE Grants (Superteam UAE)

## Project

**Fils: the dirham layer for Solana payments**
Open-source (Apache-2.0): <https://github.com/plutohan/fils>

One-liner: *An open-source reference integration and SDK for accepting UAE
dirham (AED) payments on Solana (a regulation-shaped Token-2022 reference
token, a payments SDK, a merchant checkout, and a counsel-reviewable
compliance playbook) so that when a licensed AED stablecoin evaluates Solana,
the integration path, the merchant tooling, and the UAE rules are already
mapped and public.*

## The problem (why now, why UAE)

Under the CBUAE Payment Token Services Regulation (PTSR, in full enforcement
since the one-year transition ended 16 June 2026), **UAE mainland merchants
may accept only licensed dirham payment tokens for goods and services**; other
crypto is excluded from domestic retail payments (financial free zones
excepted, with a narrow carve-out letting foreign tokens buy virtual assets).

The licensed-issuer landscape, as a dated finding (mid-2026):

| Token / issuer | Status | Chain |
| --- | --- | --- |
| AE Coin — AED StableCoin LLC | CBUAE-licensed | Own bank / payment rails |
| Zand AED — Zand Trust | CBUAE-licensed; marketed multi-chain | XRP Ledger (Ripple, Feb 2026) |
| AEDC — AEDC Stable Coin LLC | CBUAE-licensed (Feb 2026 register) | Not public |
| DDSC — IHC / FAB / Sirius | Operational approval Jul 2026 | ADI Chain |
| RAKBank token | In-principle approval only | n/a |
| Tether AED | Live | TON |

The CBUAE's February 2026 register lists three licensed dirham-token issuers
(AED StableCoin, Zand Trust, AEDC). USDU, sometimes grouped with these, is
USD-backed, not a dirham token.

**No licensed AED token is confirmed live on Solana as of July 2026.** This is
a dated finding, not a permanent fact: Zand markets Zand AED as multi-chain and
could add Solana at any time. Either way the same gap stands: an issuer or
developer evaluating Solana for dirham payments finds no AED reference token,
no worked example of how an issuer's compliance controls map onto Token-2022,
no AED-aware merchant tooling, and no developer-readable account of the UAE
rules. Fils fills that gap, and stays useful after a real licensed AED lands.

## Regulatory scope (honest framing)

Fils is a reference implementation and developer documentation, not legal
advice or a payment-token service. Two things we state plainly rather than
overclaim:

- The PTSR governs issuance to residents and providers' AML/KYC duties; it does
  **not** itself mandate an on-chain positive allowlist for every holder. Fils's
  on-chain controls (freeze, default-frozen accounts, a transfer-hook allowlist,
  a Token-ACL / SAS gate) are **design options** an issuer may use to meet those
  obligations. We demonstrate them as options, not as an architecture the
  regulation dictates.
- Federal Decree-Law 6/2025 (in force since Sept 2025) extends CBUAE reach to
  technology that facilitates regulated financial activities (Article 62), so
  whether a given piece of infrastructure is in scope is a legal question we
  flag, not one we resolve.

## What is already built (before this grant)

The MVP is public, tested, and deployed to devnet. This is proof of execution,
not work the grant pays for again.

**Core (the load-bearing deliverables):**

1. **@fils/core SDK + Fils Café checkout** (Next.js, Arabic RTL + English): AED
   token registry, fils-precise amounts with ar-AE / en-AE formatting, Solana
   Pay requests, reference-based on-chain payment verification (finalized
   commitment, on-chain decimals validated), and receipts carrying TRN + 5% VAT.
   The checkout runs cart → QR → confirmation → receipt end to end.
2. **daed-gate program** (Anchor): a Token-ACL (sRFC37) reference for an issuer
   control architecture. Accounts default-frozen; thaw permissionless but
   KYC-gated, verified on-chain against real Solana Attestation Service
   attestations. One possible issuer-control design, not the required one.
3. **UAE Solana Payments Playbook**: PTSR, Decree-Law 6/2025, VARA and free-zone
   carve-outs mapped to the Solana stack, with primary sources. This grant funds
   counsel review of it.

**Supporting reference implementations (secondary to the core story):**

- **dAED**: an unbacked Token-2022 reference/test token (2 decimals = fils,
  metadata, freeze authority; optional default-frozen and confidential-transfer
  variants). It is the fixture the demos and gate run against, not a stablecoin.
- **daed-hook**: a transfer-hook allowlist variant, for comparison with the gate.
- **@fils/einvoice**: a PINT AE (Peppol) invoice-XML exporter from a Fils
  receipt. The UAE e-invoicing mandate is real (pilot 1 July 2026; waves from
  2027), but field-complete validation is an accredited service provider's job.
  This is a structurally faithful draft, not an operational integration.
- **@fils/agent402**: an x402-style AED paywall, a roadmap item rather than part
  of the core grant story.

## Public good

Everything is Apache-2.0 and built to be forked: an issuer takes the token
shape and gate; a developer takes the SDK and checkout; everyone takes the
playbook. No token, no equity, no commercial wrapper. Fils builds **on top of**
existing Foundation tooling (Solana Pay, Token-2022, kit) rather than
duplicating it.

## Why Solana

- Retail QR payments need sub-second finality and sub-cent fees; a 1.50 AED
  karak cannot carry correspondent-banking economics or L1 gas.
- Token-2022 exposes issuer controls (freeze, default account state, transfer
  hooks, confidential transfer) as first-class extensions: a clean toolkit for
  building an issuer's compliance architecture.
- The payments last mile already exists on Solana (Solana Pay, commerce-kit,
  x402, a large installed wallet base); Fils adds the dirham / UAE layer instead
  of rebuilding rails.

## Theory of change (who actually uses this)

Fils is an **issuer-onboarding reference** for Solana. Its first users are not
merchants (a merchant cannot settle lawful payments in an unbacked reference
token). They are a Solana Foundation / Superteam solutions engineer or a
licensed issuer's integration team evaluating Solana, and developers
prototyping before a real AED token launches. The win condition: a licensed
issuer's Solana evaluation starts from a tested, public reference instead of a
blank page.

## Milestones (9 weeks, $10k)

Already delivered (pre-application, not funded here): dAED + both programs on
devnet, the SDK, the checkout, on-chain e2e.

| # | Weeks | Outcome | Amount |
| --- | --- | --- | --- |
| M1 | 1-3 | Playbook reviewed by UAE virtual-assets counsel (regulatory claims corrected); an architecture note reviewed by at least one licensed issuer or issuer-adjacent party, with their documented acceptance criteria | $3,500 |
| M2 | 4-6 | @fils/core v0.1 on npm; hosted devnet demo (AR/EN) + faucet; 3-minute video; an issuer-style sandbox integration guide | $3,000 |
| M3 | 7-9 | **One licensed issuer completes a documented Solana technical evaluation** against the reference; ≥2 independent developer integrations; hands-on workshop at a Superteam UAE / SEZ Dubai event | $3,500 |

Primary KPI: **one licensed AED issuer completing a documented Solana technical
evaluation** using this reference. Secondary: SDK on npm with a live demo; ≥2
independent developer integrations; counsel-reviewed playbook published as the
UAE reference.

Beyond the grant ([ROADMAP.md](ROADMAP.md)): full PINT AE e-invoicing with an
accredited service provider, AED agentic payments on x402 / pay-kit, and a
confidential-balances dAED variant with a regulator auditor key.

## Budget (approximate allocation)

| Item | Amount |
| --- | --- |
| UAE virtual-assets counsel: fixed-fee playbook review | $2,000 |
| Engineering: hardening, npm release, sandbox integration guide | $3,500 |
| Infra: devnet / RPC, demo + faucet hosting (9 weeks) | $1,000 |
| Workshop + distribution (SEZ Dubai / Superteam UAE) | $1,500 |
| Contingency / issuer-evaluation support | $2,000 |

No token, no equity, no paid marketing. Without a committed issuer evaluation,
we would scope the request to **$5,000–$7,500** (counsel review + SDK/demo
hardening + distribution); the full $10,000 is warranted once a licensed issuer
commits to the M3 evaluation.

## Sustainability & long-term vision

Fils stays a public good. The external win condition: a regulated AED token
evaluated on (or informed by) this reference, with UAE merchants accepting
dirhams over Solana Pay. If that happens, the UAE→India / Pakistan / Philippines
remittance corridors (the largest AED flows that exist) gain a public, sub-cent
settlement reference. Post-grant, maintenance moves to community and issuer
partners; further work (corridor tooling, full e-invoicing) can stand on its own
applications.

## Team

*(fill before submitting)*
- Name, Superteam Earn profile, UAE residency
- Proof of work: this repository and its commit history (the MVP was built and
  verified before applying)
- Continuity: this is an unaudited reference; we are seeking a technical adviser
  or second maintainer for the compliance-sensitive parts

## Links

- Repository: <https://github.com/plutohan/fils>
- Deployed on **devnet** (verifiable now):
  - dAED mint `59YMGgi9UwUMJt7dMbhumQKno3rdyf9paNyArutxybr1`
  - `daed-gate` `HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG`
  - `daed-hook` `WVoJTCXkkLWip4rSP3ho3N9bAoZdcAsoHJEGtjmqkU1`
  - [Solana Explorer (devnet)](https://explorer.solana.com/address/59YMGgi9UwUMJt7dMbhumQKno3rdyf9paNyArutxybr1?cluster=devnet)
- Demo video: *(M2)*
- Playbook: `docs/playbook.md`
- Hosted demo: *(devnet URL, M2)*

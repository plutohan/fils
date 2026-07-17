# Issuer brief: a regulated AED token on Solana

*Audience: teams operating or building a CBUAE-licensed dirham payment token
(Zand/AEDZ, the first multi-chain AED on public blockchains, is the
natural first reader; the brief applies equally to AE Coin, RAKBank's
instrument, or a new applicant). Everything referenced below runs today in
the open-source Fils repository.*

## The one-paragraph case

Your token is multi-chain by strategy; the question is which chain earns the
next deployment. Solana is where retail-grade payments actually clear:
~400 ms finality, fees measured in fractions of a fils, an installed wallet
base, Solana Pay QR flows, and the fastest-growing agentic-commerce rails
(x402/MPP). Its token standard (Token-2022) exposes issuer controls — freeze,
default account state, transfer hooks, confidential transfer — as first-class
extensions, so much of your compliance architecture becomes **configuration**.
Fils exists so your integration starts from a working reference instead of a
blank page.

## Issuer needs → Token-2022 design options (all demonstrated in Fils)

The PTSR states your obligations (AML/KYC, enforcement, redemption); how they
translate on-chain is your design choice. One worked decomposition:

| Issuer need | Design option | Working reference |
| --- | --- | --- |
| Distribution perimeter (KYC'd holders, if chosen) | `DefaultAccountState=Frozen` + gate program: accounts are born frozen, thaw is permissionless **but attestation-gated** (sRFC37 / Token ACL pattern: transfers stay standard, DeFi-composable) | `programs/daed-gate` + on-chain e2e (`pnpm e2e:gate`) |
| KYC once, reusable | Attestor role separated from issuer; swap-in point for Solana Attestation Service credentials (Sumsub/Civic/RNS.ID issue on mainnet today) | `daed-gate` attestor design |
| Suspension / enforcement | `revoke` (stops future thaws) + `freeze_wallet_account` (stops an existing account) as separate compliance acts; freeze authority held by a program PDA, not a laptop key | `daed-gate` |
| Strict per-transfer control (if your counsel insists) | Transfer-hook allowlist variant | `programs/daed-hook` |
| AED denomination at legal precision | 2-decimal mint: raw integer amounts **are** fils | `@fils/daed createDaedMint` |
| Amount privacy without being a privacy token | Confidential-transfer extension with a **global auditor key**: public sees transfers, your compliance (or a supervisor) decrypts amounts | `docs/confidential.md`, `--confidential` flag |
| Merchant acceptance | Solana Pay AED requests, on-chain verification by reference, VAT receipts | `@fils/core` + Fils Café demo |
| E-invoicing mandate (Jan 2027 wave 1) | Receipt → PINT AE XML with the settlement signature as payment evidence | `@fils/einvoice` |
| Machine-to-machine / AI payments (your own announcements name this) | AED-denominated HTTP 402 paywall + agent client | `@fils/agent402` |

## What integration actually costs

The day your mint exists on Solana (or a registered representation of it),
the generic merchant stack is designed to be a **registry entry**:
`@fils/core`'s token registry, checkout, verification, receipts and
e-invoices are built to carry over, subject to your integration requirements
(decimals, custody, transfer controls, wallet coverage). The
compliance perimeter is a deployment of `daed-gate` (or the audited Token
ACL program with the same logic as a Gate Program) plus your KYC provider
writing attestations. Fils is Apache-2.0: fork it, or point your vendor at
it.

## Corridor context (why this compounds)

The UAE's state rails are interlinking with the largest remittance markets:
Aani↔UPI (India), Buna↔Raast (Pakistan), Aani↔InstaPay MoU (Philippines).
Those rails move bank money; a public-chain AED token is the programmable
leg those corridors don't cover: merchant e-commerce, streaming/agentic
payments, tokenized-asset settlement (your own real-estate tokenization
banking relationships are the obvious first case), and 24/7 treasury
between regulated venues. Solana is where that programmable leg already has
users, liquidity infrastructure, and sub-fils economics. Licensed off-ramp
partners (e.g. Fuze-class UAE-regulated infrastructure) supply the fiat
edges.

## Suggested pilot (4-6 weeks, devnet → limited mainnet)

1. **Week 1-2**: deploy your token shape on devnet from the Fils reference
   (default-frozen + gate; confidential variant if desired); your KYC
   provider issues test attestations.
2. **Week 3-4**: merchant pilot with the Fils checkout at a controlled venue
   (an SEZ event café is the natural stage); e-invoices generated per sale.
3. **Week 5-6**: review with counsel/CBUAE engagement; decide the mainnet
   perimeter (Token ACL program + audited gate).

Contact: via Superteam UAE, or open an issue on the repository.

*This brief is developer documentation, not legal advice; the regulatory
mapping is detailed (with primary sources) in [the playbook](playbook.md).*

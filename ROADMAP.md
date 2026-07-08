# Fils Roadmap: beyond the MVP

Research-driven development plan (July 2026). Each item names the signal that
motivates it. Tiers are ordered by expected impact per unit of effort.

## Tier 1: Compliance architecture v2 (align with where the ecosystem moved)

### 1. Token ACL (sRFC37) as the recommended perimeter

The Foundation's current guidance for permissioned tokens is **Token ACL**
(freeze-authority delegation + Gate Programs + `DefaultAccountState=frozen`),
not per-transfer hooks: transfers stay standard (no extra CUs/accounts), DeFi
composability is preserved, and wallets auto-thaw via `@solana/token-helpers`
when the mint's metadata carries a `token_acl` field. Transfer hooks remain
the right tool only when logic must run on *every* transfer.

- [x] Add a Token ACL configuration path for dAED (`DefaultAccountState=frozen`
      via `createDaedMint({ defaultFrozen: true })`); `daed-hook` kept as the
      strict per-transfer variant with the trade-off table in its README.
- [x] Ship a **gate program** that thaws an account iff the wallet holds a
      valid KYC attestation: `programs/daed-gate`, with attestor/issuer role
      separation and an on-chain e2e (`pnpm e2e:gate`) covering the negative
      paths. *(v1 uses its own attestation registry; SAS verification below
      is the v2.)*

### 2. Solana Attestation Service (SAS) for KYC

SAS is live on mainnet (Foundation-backed, Solana Identity Group) with real
KYC issuers already attesting: Sumsub, Civic, RNS.ID. A real AED issuer would
not maintain a bespoke allowlist; it would trust attestations from approved
IDV providers.

- [x] Gate verifies **real SAS attestations** (`thaw_account_with_sas`):
      trusted credential+schema policy on GateConfig, nonce-to-owner subject
      binding, expiry check; e2e against the mainnet-dumped SAS program
      (`pnpm e2e:gate:sas`), incl. mismatched-subject negative.
- [ ] Devnet demo with a public mock-IDV credential + jurisdiction field in
      the schema (field-level policy).

### 3. Confidential balances with a regulator auditor key

Token-2022 confidential transfers support an optional **global auditor
ElGamal key** on the mint: amounts hidden from the public, decryptable by the
auditor. That is exactly the shape a CBUAE-supervised token wants (and
distinct from prohibited "privacy tokens"; flag to counsel). Agave v4.2's
transaction format v1 is expected to make confidential transfers single-tx.

- [x] dAED confidential variant: `daed:create -- --confidential [auditor]`
      (ConfidentialTransferMint extension, auto-approve, optional auditor
      key), verified on a local validator; see docs/confidential.md.
- [ ] Payroll/B2B demo where the public sees a transfer but only the auditor
      sees AED amounts (waiting on the Agave v4.2 single-tx flow for a clean
      demo).

## Tier 2: Ride the two waves that just started

### 4. PINT AE e-invoice export (`@fils/einvoice`)

UAE e-invoicing is phasing in **now**: voluntary pilot opened 1 July 2026;
mandatory for revenue ≥ AED 50M on 1 Jan 2027, < AED 50M on 1 Jul 2027, B2G
on 1 Oct 2027 (Peppol 5-corner model, PINT AE XML, 51 mandatory fields,
Dh5,000/month penalties). Nobody connects crypto payments to this yet.

- [x] Map `FilsReceipt` → PINT AE fields; `receiptToPintAeXml()` exporter
      (`@fils/einvoice`) with exact line-net reconciliation, plus the demo's
      `GET /api/invoice/[reference]`.
- [ ] Field-completeness validation against the Ministry's data dictionary
      (with an ASP), and a playbook deep-dive chapter.

### 5. AED agentic payments (x402 / MPP)

Agentic 402 payments crossed 100M transactions on Base in three quarters;
Solana is a first-class settlement rail in both x402 (Coinbase/Cloudflare)
and MPP (Stripe/Tempo, Solana supported at launch), with the Foundation's
`pay-kit` shipping server/client SDKs in nine languages. Even the UAE's own
DDSC announcement names "machine-to-machine and AI" as a target use case,
but nobody demos agents paying in **dirhams**.

- [x] `@fils/agent402`: an AED-denominated 402 paywall + agent client
      (x402-style verification mode), e2e incl. replay protection and an
      agent budget guard.
- [ ] Full x402 "exact" facilitator settlement via pay-kit; list the demo
      endpoint in the pay-skills catalog.
- [ ] Position at SEZ: "the dirham layer for agentic commerce"
      (docs/workshop.md is the session).

## Tier 3: Distribution & adoption

### 6. Issuer brief aimed at Zand (AEDZ)

AEDZ is explicitly multi-chain (EVM live, XRPL under evaluation) and Zand
banks PRYPCO Mint (Dubai real-estate tokenization). The brief: Token ACL +
SAS + confidential-auditor architecture on Solana, plus Solana settlement for
property-sale flows. Deliver through Superteam UAE channels.

### 7. Events pipeline

- Solana Economic Zone: Dubai (twice yearly, Superteam UAE), workshop +
  live Fils Café demo with real wallets.
- Institutional-stablecoin hackathons (StableHacks-class, Colosseum):
  Fils as base infrastructure; MVP requirement already satisfied.

### 8. Corridor positioning (research-informed, not a build item yet)

The UAE is wiring **state-level** instant-payment corridors: Aani↔UPI
(India, world's #2 corridor), Buna↔Raast (Pakistan), Aani↔InstaPay MoU
(Philippines, Apr 2026). Fils does not compete with state rails; the open
niche is merchant/e-commerce and agentic AED payments, plus AED-token legs
where regulated off-ramp partners (e.g. Fuze, UAE-licensed, already settling
AED→USDC→INR/PKR/PHP) provide the fiat edges.

## Known risks (from the same research)

- **Transfer-hook composability**: some DeFi protocols blacklist hooked
  tokens; Jupiter multi-hop routes can fail. Mitigated by #1 (Token ACL as
  the default path).
- **Wallet coverage**: ~80% of wallets handle Token-2022 well (Phantom,
  Solflare, Backpack); hooks and confidential transfers are the rough edges.
  Demo wallets must be chosen accordingly.
- **Confidential transfer UX**: multi-transaction until Agave v4.2 lands.
- **Regulatory drift**: Federal Decree-Law 6/2025 compliance deadline
  (Sept 2026) may narrow the non-custodial-software lane; playbook must be
  re-reviewed then (already an M3 item).

# Fils Roadmap — beyond the MVP

Research-driven development plan (July 2026). Each item names the signal that
motivates it. Tiers are ordered by expected impact per unit of effort.

## Tier 1 — Compliance architecture v2 (align with where the ecosystem moved)

### 1. Token ACL (sRFC37) as the recommended perimeter

The Foundation's current guidance for permissioned tokens is **Token ACL**
(freeze-authority delegation + Gate Programs + `DefaultAccountState=frozen`),
not per-transfer hooks: transfers stay standard (no extra CUs/accounts), DeFi
composability is preserved, and wallets auto-thaw via `@solana/token-helpers`
when the mint's metadata carries a `token_acl` field. Transfer hooks remain
the right tool only when logic must run on *every* transfer.

- [ ] Add a Token ACL configuration path for dAED (`DefaultAccountState=frozen`
      + MintConfig PDA); keep `daed-hook` as the strict per-transfer variant
      and document the trade-off table.
- [ ] Ship a **custom Gate Program** that thaws an account iff the wallet
      holds a valid KYC attestation (see #2) — the "licensed-holder perimeter"
      with self-service onboarding.

### 2. Solana Attestation Service (SAS) for KYC

SAS is live on mainnet (Foundation-backed, Solana Identity Group) with real
KYC issuers already attesting: Sumsub, Civic, RNS.ID. A real AED issuer would
not maintain a bespoke allowlist — it would trust attestations from approved
IDV providers.

- [ ] Gate Program verifies an SAS attestation (approved issuer set,
      schema = KYC-passed + jurisdiction, expiry/revocation checked).
- [ ] Devnet demo: mock KYC issuer credential → user receives attestation →
      self-thaws their dAED account. One verification, reusable everywhere.

### 3. Confidential balances with a regulator auditor key

Token-2022 confidential transfers support an optional **global auditor
ElGamal key** on the mint: amounts hidden from the public, decryptable by the
auditor. That is exactly the shape a CBUAE-supervised token wants (and
distinct from prohibited "privacy tokens" — flag to counsel). Agave v4.2's
transaction format v1 is expected to make confidential transfers single-tx.

- [ ] dAED confidential variant: `--enable-confidential-transfers auto` +
      auditor pubkey; payroll/B2B demo where the public sees a transfer but
      only the auditor sees AED amounts.

## Tier 2 — Ride the two waves that just started

### 4. PINT AE e-invoice export (`@fils/einvoice`)

UAE e-invoicing is phasing in **now**: voluntary pilot opened 1 July 2026;
mandatory for revenue ≥ AED 50M on 1 Jan 2027, < AED 50M on 1 Jul 2027, B2G
on 1 Oct 2027 (Peppol 5-corner model, PINT AE XML, 51 mandatory fields,
Dh5,000/month penalties). Nobody connects crypto payments to this yet.

- [ ] Map `FilsReceipt` → PINT AE mandatory fields; `toPintAeXml()` exporter
      so a merchant's ASP can ingest a Solana-settled sale like any other.
- [ ] Playbook chapter: "a stablecoin payment still needs an e-invoice."

### 5. AED agentic payments (x402 / MPP)

Agentic 402 payments crossed 100M transactions on Base in three quarters;
Solana is a first-class settlement rail in both x402 (Coinbase/Cloudflare)
and MPP (Stripe/Tempo, Solana supported at launch), with the Foundation's
`pay-kit` shipping server/client SDKs in nine languages. Even the UAE's own
DDSC announcement names "machine-to-machine and AI" as a target use case —
but nobody demos agents paying in **dirhams**.

- [ ] `fils-402`: an AED-denominated paid endpoint on pay-kit (dAED on
      devnet); `pay curl` demo where an AI agent settles in fils.
- [ ] Position at SEZ: "the dirham layer for agentic commerce."

## Tier 3 — Distribution & adoption

### 6. Issuer brief aimed at Zand (AEDZ)

AEDZ is explicitly multi-chain (EVM live, XRPL under evaluation) and Zand
banks PRYPCO Mint (Dubai real-estate tokenization). The brief: Token ACL +
SAS + confidential-auditor architecture on Solana, plus Solana settlement for
property-sale flows. Deliver through Superteam UAE channels.

### 7. Events pipeline

- Solana Economic Zone: Dubai (twice yearly, Superteam UAE) — workshop +
  live Fils Café demo with real wallets.
- Institutional-stablecoin hackathons (StableHacks-class, Colosseum) —
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

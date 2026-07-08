# Thesis check: core hypotheses & product-market fit (re-verified 2026-07-07)

An honest scoreboard. Each hypothesis states what would falsify it and what
the latest evidence says. Re-run this check before major effort or fundraise.

## H1. Regulatory moat: UAE mainland payments = licensed AED tokens only

**Status: HOLDS.** CBUAE PTSR (fully effective June 2025) still restricts
mainland goods/services payments to licensed Dirham Payment Tokens; USD
stablecoins remain excluded from domestic payments (free zones aside).
Federal Decree-Law 6/2025 widens supervision (Sept 2026 deadline); the
compliance-shaped design becomes *more* valuable, not less.

## H2. The gap: no AED-denominated payment token on Solana

**Status: HOLDS, with an important nuance.** New finding: **PUSD** (~$2.3B,
Shariah-compliant, backed by SAR+AED reserves) is live on Solana, but it is
**dollar-anchored and not a CBUAE-licensed dirham payment token**, so it
neither settles mainland payments in AED nor closes the gap. Meanwhile the
regulated AED cohort keeps shipping **elsewhere**: DDSC live and expanding
on ADI Chain (VARA-exchange NOC July 2026), e& × Al Maryah piloting a
consumer dirham stablecoin, RAKBank in-principle. Every quarter the gap
stays open, dirham network effects accrue to non-Solana rails. The window
argument is *strengthening*, not weakening.

## H3. Solana is the right settlement layer for retail/agentic AED

**Status: HOLDS.** Payments momentum unchanged (Solana first-class in x402
and MPP; pay-kit shipping; institutional treasury deployments live in APAC).
PUSD choosing Solana among its chains is additional evidence that Gulf-
adjacent issuers treat Solana as core distribution.

## H4. Demand: who actually uses Fils before a licensed issuer arrives?

**Status: PARTIAL, the honest weak point.** End-market PMF (merchants
accepting real AED on Solana) is gated on an issuer deployment we do not
control. Fils' near-term users are therefore:

1. **Grant evaluators / Superteam UAE**: funding fit is strong (public
   good, regional, only-possible-on-Solana) and is itself a validated
   "customer" for this artifact class.
2. **Developers**: hackathon/workshop builders who need AED-shaped rails
   today (dAED, checkout, e-invoice, 402 paywall all runnable in minutes).
3. **Issuers' technical teams**: the brief + working perimeter reduce a
   Solana deployment evaluation from months to a pilot.

Mitigation for the gating risk: keep integration cost at "a registry entry"
(done), make the compliance perimeter Foundation-current (Token ACL + SAS,
in progress), and convert the strongest lead (Zand: multi-chain by strategy)
via Superteam channels. Kill-signal to watch: an AED issuer publicly
committing to a *competing* public chain as exclusive (as DDSC/ADI has) with
Zand following. That would cap the upside to the developer/agentic niches.

## H5. Positioning: extend, don't duplicate

**Status: HOLDS.** Still no competing AED-on-Solana toolkit found
(StableHacks-class projects are generic institutional stablecoin infra;
the Palm USD × Superteam UAE hackathon orbit produced USD-anchored
remittance *apps*, not dirham infrastructure: full breakdown in
[competitive-landscape.md](competitive-landscape.md)).
Foundation tooling (commerce-kit, pay-kit, Token ACL, SAS) keeps absorbing
the generic layers: exactly why Fils stays the thin dirham-specific layer
on top and tracks Foundation guidance (hook → Token ACL migration already
made).

## Verdict

The thesis survives falsification with one honest downgrade: **PMF today is
public-good/developer fit, not merchant fit**; merchant fit has a binary
dependency on an issuer landing. The portfolio answer is already in the
roadmap: (a) win the grant on public-good merit, (b) make issuer conversion
frictionless (SAS-verified perimeter, issuer brief, pilot plan), (c) keep
the developer/agentic surfaces (402, e-invoice) independently useful so the
project has users even in the no-issuer world.

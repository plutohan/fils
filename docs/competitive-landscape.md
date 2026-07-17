# Competitive landscape (verified July 2026)

Who else is near this territory, on which axis they compete, and what it
means for Fils. Companion to [thesis.md](thesis.md); re-run the searches
before major decisions.

## The one-line answer

**No one builds AED-denominated payment infrastructure on Solana.** The
crowded neighborhoods are (a) USD-stablecoin merchant tooling on Solana,
(b) PUSD-based remittance *apps* in the Superteam UAE orbit, and (c) the
regulated AED tokens compounding on **non-Solana** rails, which is the
competition that actually matters.

## Axis 1. Direct: AED infrastructure on Solana

| Player | What they do | Verdict |
| --- | --- | --- |
| None | *(none found: GitHub, hackathon archives, news [July 2026])* | The gap Fils fills is still open |

## Axis 2. Solana payment tooling (USD-centric)

| Player | What they do | Overlap with Fils |
| --- | --- | --- |
| **Helio / MoonPay Commerce** | Dominant Solana merchant processor (acquired by MoonPay 1/2025); official Shopify Solana Pay app; SOL/USDC/SPL, 0% protocol fee | None on AED. **Structurally blocked from UAE mainland**: PTSR forbids USD stables for domestic goods/services. Natural *distribution partner* the day an AED token exists |
| **Sphere** | Developer payment API (0.3%/tx), webhooks, KYC/KYB tooling, USDC settlement | Same as above: USD-centric; compliance tooling is generic, not PTSR-shaped |
| **TipLink / Stripe crypto / PayPal PYUSD** | Links & custodial on-ramps; USDC/PYUSD | Non-competing; useful last-mile pieces |
| **Solana Foundation kits** (Solana Pay, commerce-kit, pay-kit, Token ACL, SAS) | The base layers | **Complements by design**: Fils deliberately builds on them (this is the moat against "Foundation ships it themselves": they absorb generic layers, not country-specific regulatory ones) |

Takeaway: the USD incumbents cannot enter UAE mainland payments without
exactly the dirham layer Fils provides. They are channel, not competition.

## Axis 3. The Superteam UAE / PUSD orbit (closest for evaluator attention)

PUSD ("Palm USD", ~$2.3B, SAR+AED reserves, Shariah-compliant, **live on
Solana**) ran a *Palm USD × Superteam UAE* Frontier Hackathon track
(winners May 2026). Projects it produced:

| Project | What it is | Overlap |
| --- | --- | --- |
| palm-remit | PUSD remittance claim-links (UAE→South Asia corridors) | App layer, USD-anchored, remittance: not AED, not infra |
| zakflow | Zakat-enabled PUSD remittance | Same |
| Limer's "Send Juice" | UAE↔Caribbean PUSD remittance + savings vaults | Same |

These compete for **the same evaluators' attention** with a UAE×Solana
story, but all are *applications on a dollar-anchored token*. None touch
the regulatory core (CBUAE dirham payment tokens, mainland acceptance,
e-invoicing). Positioning line: *"remittance apps move dollars out of the
UAE; Fils makes the dirham itself work on Solana."* PUSD itself is a
potential ally (Gulf-reserve issuer already on Solana) but is not an AED
payment token and does not enter the registry.

## Axis 4. The real competition: where AED programmability lives

The regulated dirham cohort is compounding on other rails. This is a
chain-vs-chain race, and Solana is currently losing it:

| Player | Rail | Momentum |
| --- | --- | --- |
| **DDSC** (IHC/FAB/Sirius) | **ADI Chain** (own institutional L2), exclusive | AED 150M+ transacted; VARA-exchange NOC (7/2026) → retail reach; M-Pesa/Africa corridor roadmap; PUSD also deployed on ADI |
| **AEDZ** (Zand) | EVM chains live; **Ripple partnership toward XRPL** (2/2026) | The only multi-chain-by-strategy issuer → the most convertible target; banks PRYPCO Mint (real-estate tokenization) |
| **AE Coin** | Private/permissioned | Dubai Finance pilot |
| **e& × Al Maryah CB** | TBD (pilot 12/2025) | Consumer payments distribution via telecom |
| **RAKBank** | TBD (in-principle) | SME/retail corridors |

Every quarter without an AED token on Solana, integrations, corridors and
habits accrue to ADI Chain and EVM/XRPL. Fils' whole purpose is lowering
the cost of a Solana deployment to "a pilot, not a program" before this
compounding closes the window.

## Axis 5. UAE payment infrastructure companies

| Player | What they do | Relationship |
| --- | --- | --- |
| **Xweave** | Non-custodial treasury settlement **on Solana**, AED-denominated flows supported, UAE expansion announced (6/2026) | **Closest Solana+AED player**, but institutional treasury (B2B FX/liquidity), not merchant/agentic/token infra. Prime ally: their corridors + our token layer. Watch item: they may pull an AED token onto Solana themselves, which would *fulfill* our thesis, not defeat it |
| **Fuze** | UAE-regulated stablecoin infra; AED→USDC→INR/PKR/PHP remittance rails, 65-country payouts | Off-ramp/licensed edge partner, not a toolkit competitor |
| **Aani / Buna state rails** | CBUAE instant-payment interlinks (UPI, Raast, InstaPay) | Non-competing by design: bank money vs programmable leg (see [issuer-brief](issuer-brief.md)) |

## What defends Fils

1. **Regulatory specificity**: PTSR/e-invoicing/VAT/fils-precision/Arabic
   are exactly the layers generic tooling never builds and the Foundation
   won't country-localize.
2. **Foundation-current architecture**: Token ACL + real SAS verification
   already working; competitors entering later start behind.
3. **Public-good economics**: Apache-2.0 with no token/fee removes the
   reason for a competing toolkit to exist; forks are wins.
4. **Speed to credibility**: working perimeter + issuer brief + pilot plan
   turns any issuer conversation into an integration checklist.

## Watchlist (signals that change this document)

- An AED-denominated token announcing Solana deployment (anyone) → pivot
  Fils to integration mode immediately (registry entry + joint demo).
- Zand committing exclusively to XRPL → downgrade issuer-conversion odds;
  weight shifts to agentic/e-invoice surfaces (see thesis H4 kill-signal).
- Xweave launching UAE with a dirham token partner → approach as ally
  within the week.
- MoonPay Commerce / Sphere announcing MENA compliance products → the
  distribution channel is warming up; ship the registry to them.

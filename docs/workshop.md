# Workshop runbook: "Dirhams on Solana" (SEZ / Superteam UAE, 60-75 min)

A hands-on session for ~25 developers. Every attendee leaves having accepted
an AED payment, generated a UAE e-invoice, and (optionally) gated a token
behind a KYC attestation. Everything runs on a local validator: no funds,
no waiting on devnet faucets.

## Prerequisites (send with the invite)

- Node ≥ 20, pnpm ≥ 9, Solana CLI ≥ 2.x (`solana-test-validator` available)
- `git clone <repo> && pnpm install && anchor build` *(anchor optional: only
  for the gate segment; ship the prebuilt `daed_gate.so` for those without
  the toolchain)*

## Timeline

| Min | Segment | Beat |
| --- | --- | --- |
| 0-10 | **Why dirhams, why here** | PTSR one-slide: mainland payments = licensed AED tokens only; three CBUAE-licensed dirham issuers (plus DDSC's launch approval), none announcing Solana as of July 2026; the gap is the opportunity. (Source: [playbook](playbook.md)) |
| 10-20 | **The 90-second payment** | Live: `solana-test-validator` → `daed:create` → `pnpm e2e`. Narrate the receipt JSON: fils integers, VAT split, on-chain proof. |
| 20-35 | **Hands-on 1: Fils Café** | Attendees run `daed:create` + demo (`pnpm --filter demo dev`), order karak, hit "simulate wallet", flip to العربية. Payment confirmed < 1 s. Then `GET /api/invoice/<ref>`: "this XML is shaped for the 2027 mandate (PINT AE) — an accredited service provider validates the final fields, but you just produced the draft from a blockchain payment." |
| 35-50 | **Hands-on 2: the compliance perimeter** | `daed:create -- --default-frozen`, deploy gate, run `pnpm e2e:gate` and read the PASS lines aloud: frozen by default → attest → permissionless thaw → payment → revoke → frozen. Frame: "this is the sRFC37 pattern — one issuer-control design the Foundation's Token ACL guidance describes, expressed as configuration rather than custom infrastructure." |
| 50-60 | **Demo: agents pay in fils** | `pnpm e2e:402`: 402 challenge → agent pays AED 0.25 on-chain → data. One slide on x402/MPP momentum and why an AED-denominated paid API is unclaimed territory. |
| 60-75 | **Build prompts + Q&A** | Ideas board below. Superteam UAE grant/hackathon pointers. |

## Build prompts for attendees

- Wire a real Solana Pay wallet against the demo QR on devnet.
- Replace the demo menu with your own shop; ship it as a template.
- Extend the SAS schema with a jurisdiction field and enforce it in
  `thaw_account_with_sas` (field-level policy, a great first PR; the
  SAS verification path itself already works: `pnpm e2e:gate:sas`).
- AED paywall for your own API (`@fils/agent402` is ~200 lines; read it).
- PINT AE field-completeness checker against the Ministry's data dictionary.

## Demo-day checklist (presenter)

- [ ] validator running, `daed_gate.so` deployed, plain dAED created
- [ ] demo served on :3000, one order pre-paid (backup screenshot of receipt)
- [ ] terminals pre-arranged: e2e / e2e:gate / e2e:402
- [ ] offline fallback: recorded runs of all three suites
- [ ] AR/EN toggle rehearsed (RTL wow-moment reliably lands)

## Talking points that landed in research (keep them honest)

- Foundation guidance moved from transfer hooks to **Token ACL** for holder
  gating; we show both and say why.
- Confidential transfers are amounts-only privacy **with an auditor key**,
  distinct from prohibited privacy tokens; multi-tx today, single-tx with
  Agave v4.2.
- E-invoicing wave 1 is **January 2027** with Dh5,000/month penalties;
  every merchant in the room has a deadline, crypto or not.

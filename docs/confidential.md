# Confidential dAED — private amounts, auditable by design

Token-2022's ConfidentialTransfer extension hides **transfer amounts and
balances** (ElGamal-encrypted, ZK-proof-verified) while account addresses
stay public. For a regulated AED payment token this is the interesting shape:

- **Not a privacy token.** The CBUAE prohibits privacy *tokens*; here
  identities, the mint, freeze controls, and the gate perimeter all remain
  fully enforceable — only amounts are shielded from the public.
- **Auditable.** The mint can carry a **global auditor ElGamal key**: every
  confidential transfer must additionally encrypt its amount under that key,
  so the auditor (issuer compliance, or a supervisor) can decrypt any amount
  while the public cannot. Confirm the exact posture with counsel before
  production use.
- Use cases: payroll in AED (salaries not public), B2B settlement (supplier
  pricing not leaked to competitors), treasury flows.

## Creating a confidential dAED

```bash
# amounts hidden, no auditor
pnpm --filter @fils/scripts daed:create -- --confidential

# amounts hidden, auditor can decrypt (base58 ElGamal pubkey)
pnpm --filter @fils/scripts daed:create -- --confidential <AUDITOR_ELGAMAL_PUBKEY>

# combine with the Token ACL perimeter (see programs/daed-gate)
pnpm --filter @fils/scripts daed:create -- --confidential --default-frozen
```

Verified on a local validator (`spl-token display <mint>`):

```
Extensions
  Default state: Frozen
  Confidential transfer:
    Account approve policy: auto
    Audit key: …
```

`autoApproveNewAccounts` is set to `true` (any holder can configure their
account for confidential use). An issuer wanting to gate confidential usage
separately from holding can flip this to manual approval — that is a
one-line change in `createDaedMint`.

## Using it (today's flow)

Confidential transfers need client-side zero-knowledge proofs (equality,
ciphertext validity, range). The `spl-token` CLI does all of it:

```bash
spl-token configure-confidential-transfer-account --address <YOUR_ATA>
spl-token deposit-confidential-tokens <MINT> <AMOUNT> --address <YOUR_ATA>
spl-token apply-pending-balance --address <YOUR_ATA>
spl-token transfer <MINT> <AMOUNT> <RECIPIENT> --confidential
spl-token withdraw-confidential-tokens <MINT> <AMOUNT>
```

JS/Rust integrations use the proof helpers in `@solana-program/token-2022`
and `spl-token-client`; ElGamal/AES keys are derived from a wallet signature
so nothing extra needs storing.

## Current constraints (July 2026)

- A confidential transfer spans several dependent transactions because the
  proofs exceed the current transaction size limit. **Transaction format v1
  (Agave v4.2)** is expected to make it single-transaction.
- Wallet support is the rough edge of Token-2022; target `spl-token` CLI and
  custom clients for demos, not retail wallets, for now.
- Cross-chain bridges generally reject confidential-extension tokens.

Roadmap: a scripted payroll demo (issuer pays three salaries; public
explorer shows transfers without amounts; auditor script decrypts them) once
the single-transaction flow lands.

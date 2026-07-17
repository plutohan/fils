# @fils/core

AED (UAE dirham) payments SDK for Solana: token registry, fils-precise
amounts with ar-AE / en-AE formatting, Solana Pay-compatible payment
requests, reference-based on-chain payment verification (finalized
commitment), and UAE-style receipts (TRN + 5% VAT).

Part of [Fils](https://github.com/plutohan/fils), the open-source dirham
layer for Solana payments. Apache-2.0.

```ts
import { createPaymentRequest, findPayment, parseAed } from '@fils/core';

const request = createPaymentRequest({
    recipient, // merchant address
    amountFils: parseAed('12.50'),
    token, // an AedTokenInfo registry entry
    label: 'Fils Café',
});
// show request.url as a QR; then verify on-chain by reference:
const verification = await findPayment({ rpc, request });
```

See the [repository](https://github.com/plutohan/fils) for the full
toolkit: reference token, compliance-perimeter programs, merchant demo,
e-invoicing, and the UAE Solana Payments Playbook.

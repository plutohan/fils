# @fils/einvoice

UAE **PINT AE** (Peppol UBL) e-invoice XML from
[Fils](https://github.com/plutohan/fils) receipts, carrying the Solana
settlement signature as payment evidence, with exact VAT and line-net
reconciliation (tampered or non-reconciling receipts are rejected).

Scope honesty: this produces a structurally faithful draft (UBL 2.1,
PINT AE customization, AED, 5% VAT category S). Field-complete validation
against the Ministry of Finance data dictionary is your accredited service
provider's job; always validate with your ASP before relying on it.

```ts
import { receiptToPintAeXml } from '@fils/einvoice';

const xml = receiptToPintAeXml({ receipt, supplier });
```

Apache-2.0.

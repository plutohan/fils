import { describe, expect, it } from 'vitest';
import { address, type Signature } from '@solana/kit';
import { FilsError, buildReceipt, type FilsReceipt } from '@fils/core';

import { receiptToPintAeXml, type PintAeParty } from '../src/index.js';

const MERCHANT = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const MINT = address('So11111111111111111111111111111111111111112');
const REFERENCE = address('SysvarC1ock11111111111111111111111111111111');
const SIGNATURE = 'x'.repeat(87) as Signature;

const SUPPLIER: PintAeParty = {
    name: 'Fils Café LLC',
    trn: '100123456700003',
    address: { streetName: 'Al Wasl Road', cityName: 'Dubai', emirate: 'Dubai' },
};

function receiptWith(lines: { description: string; quantity: number; unitFils: bigint }[]): FilsReceipt {
    const amountFils = lines.reduce((total, line) => total + line.unitFils * BigInt(line.quantity), 0n);
    return buildReceipt({
        receiptNumber: 'FILS-0042',
        issuedAt: new Date('2026-07-07T12:00:00Z'),
        seller: { name: SUPPLIER.name, trn: SUPPLIER.trn ?? '' },
        lines,
        payment: {
            cluster: 'localnet',
            mint: MINT,
            recipient: MERCHANT,
            reference: REFERENCE,
            signature: SIGNATURE,
            amountFils,
            slot: 99n,
            blockTime: 1780000000n,
        },
    });
}

function amounts(xml: string, tag: string): string[] {
    return [...xml.matchAll(new RegExp(`<${tag} currencyID="AED">([-0-9.]+)</${tag}>`, 'g'))].map(
        match => match[1] ?? '',
    );
}

describe('receiptToPintAeXml', () => {
    it('produces the PINT AE skeleton with AED amounts and TIN endpoint', () => {
        const xml = receiptToPintAeXml({
            receipt: receiptWith([
                { description: 'Karak chai', quantity: 3, unitFils: 150n },
                { description: 'Luqaimat', quantity: 1, unitFils: 800n },
            ]),
            supplier: SUPPLIER,
        });
        expect(xml).toContain('urn:peppol:pint:billing-1@ae-1');
        expect(xml).toContain('<cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>');
        expect(xml).toContain('<cbc:EndpointID schemeID="0235">1001234567</cbc:EndpointID>');
        expect(xml).toContain('<cbc:CompanyID>100123456700003</cbc:CompanyID>');
        expect(xml).toContain(`<cbc:PaymentID>${SIGNATURE}</cbc:PaymentID>`);
        // AED 12.50 gross → 11.90 net + 0.60 VAT (fils-exact from the receipt)
        expect(amounts(xml, 'cbc:TaxInclusiveAmount')).toEqual(['12.50']);
        expect(amounts(xml, 'cbc:TaxExclusiveAmount')).toEqual(['11.90']);
        expect(amounts(xml, 'cbc:TaxAmount')).toEqual(['0.60', '0.60']);
        expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    });

    it('reconciles per-line nets exactly to the document net (adversarial rounding)', () => {
        // 7 lines of 1 fils each: per-line net rounds to 1, but the document
        // net of 7 fils gross is 7 too — try nastier: lines of 10 fils.
        const lines = Array.from({ length: 7 }, (_, i) => ({
            description: `Sticker ${i}`,
            quantity: 1,
            unitFils: 10n,
        }));
        const xml = receiptToPintAeXml({ receipt: receiptWith(lines), supplier: SUPPLIER });
        const lineNets = amounts(xml, 'cbc:LineExtensionAmount');
        // First LineExtensionAmount is the document total, rest are lines.
        const [documentNet, ...perLine] = lineNets;
        const toFils = (amount: string): bigint => {
            const [whole = '0', fraction = ''] = amount.split('.');
            return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        };
        const sum = perLine.reduce((total, amount) => total + toFils(amount), 0n);
        expect(sum).toBe(toFils(documentNet ?? '0'));
        expect(perLine).toHaveLength(7);
    });

    it('escapes XML metacharacters in item names and party fields', () => {
        const xml = receiptToPintAeXml({
            receipt: receiptWith([{ description: 'Chai <spécial> & "hot"', quantity: 1, unitFils: 500n }]),
            supplier: { ...SUPPLIER, name: 'Fils & Sons <LLC>' },
        });
        expect(xml).toContain('Chai &lt;spécial&gt; &amp; &quot;hot&quot;');
        expect(xml).toContain('Fils &amp; Sons &lt;LLC&gt;');
    });

    it('rejects non-standard VAT rates', () => {
        const receipt = { ...receiptWith([{ description: 'X', quantity: 1, unitFils: 100n }]) };
        const tampered = { ...receipt, totals: { ...receipt.totals, vatBps: 0 } };
        expect(() => receiptToPintAeXml({ receipt: tampered, supplier: SUPPLIER })).toThrowError(FilsError);
    });

    it('rejects a receipt whose gross total does not match its lines', () => {
        const receipt = receiptWith([{ description: 'Karak chai', quantity: 3, unitFils: 150n }]);
        const tampered: FilsReceipt = { ...receipt, totals: { ...receipt.totals, grossFils: '9999' } };
        expect(() => receiptToPintAeXml({ receipt: tampered, supplier: SUPPLIER })).toThrowError(FilsError);
    });

    it('rejects a receipt with a tampered (negative) line total', () => {
        const receipt = receiptWith([{ description: 'Karak chai', quantity: 3, unitFils: 150n }]);
        const tampered: FilsReceipt = {
            ...receipt,
            lines: [{ description: 'Karak chai', quantity: 3, unitFils: '150', totalFils: '-450' }],
        };
        expect(() => receiptToPintAeXml({ receipt: tampered, supplier: SUPPLIER })).toThrowError(FilsError);
    });

    it('rejects a receipt whose VAT split does not reconcile with gross', () => {
        const receipt = receiptWith([{ description: 'Karak chai', quantity: 3, unitFils: 150n }]);
        const tampered: FilsReceipt = { ...receipt, totals: { ...receipt.totals, netFils: '999' } };
        expect(() => receiptToPintAeXml({ receipt: tampered, supplier: SUPPLIER })).toThrowError(FilsError);
    });

    it('never produces a negative invoice line from positive receipt lines (rounding)', () => {
        // 100 lines of 1 fils each: the document net (95) sits far below the
        // naive per-line rounding sum, so dumping the whole remainder on one
        // line would drive it negative. Largest-remainder apportionment keeps
        // every line at or above its floor.
        const lines = Array.from({ length: 100 }, (_, i) => ({
            description: `Sticker ${i}`,
            quantity: 1,
            unitFils: 1n,
        }));
        const xml = receiptToPintAeXml({ receipt: receiptWith(lines), supplier: SUPPLIER });
        const lineNets = amounts(xml, 'cbc:LineExtensionAmount');
        const [documentNet, ...perLine] = lineNets;
        expect(perLine).toHaveLength(100);
        expect(perLine.some(amount => amount.startsWith('-'))).toBe(false);
        expect(amounts(xml, 'cbc:PriceAmount').some(amount => amount.startsWith('-'))).toBe(false);
        // Per-line nets still sum exactly to the document net.
        const toFils = (amount: string): bigint => {
            const [whole = '0', fraction = ''] = amount.split('.');
            return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        };
        const sum = perLine.reduce((total, amount) => total + toFils(amount), 0n);
        expect(sum).toBe(toFils(documentNet ?? '0'));
    });

    it('rejects a receipt whose embedded payment underpays the gross', () => {
        // buildReceipt binds payment.amountFils >= gross, but a hand-crafted
        // receipt object can violate it; the converter must not emit a
        // "Settled on Solana" invoice against an underpaying signature.
        const receipt = receiptWith([{ description: 'Karak chai', quantity: 3, unitFils: 150n }]);
        const tampered: FilsReceipt = { ...receipt, payment: { ...receipt.payment, amountFils: '1' } };
        expect(() => receiptToPintAeXml({ receipt: tampered, supplier: SUPPLIER })).toThrowError(FilsError);
    });
});

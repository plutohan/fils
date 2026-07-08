import type { Signature } from '@solana/kit';
import { address } from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { FilsError, buildReceipt } from '../src/index.js';

const MERCHANT = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const MINT = address('So11111111111111111111111111111111111111112');
const REFERENCE = address('SysvarC1ock11111111111111111111111111111111');
const SIGNATURE = 'x'.repeat(87) as Signature;

function paymentStub() {
    return {
        cluster: 'localnet' as const,
        mint: MINT,
        recipient: MERCHANT,
        reference: REFERENCE,
        signature: SIGNATURE,
        slot: 1234n,
        blockTime: 1750000000n,
    };
}

describe('buildReceipt', () => {
    it('totals lines and breaks out UAE VAT from the gross amount', () => {
        const receipt = buildReceipt({
            receiptNumber: 'FILS-0001',
            issuedAt: new Date('2026-07-07T12:00:00Z'),
            seller: { name: 'Fils Café', trn: '100000000000003' },
            lines: [
                { description: 'Karak chai', quantity: 3, unitFils: 150n },
                { description: 'Luqaimat', quantity: 1, unitFils: 1050n },
            ],
            payment: paymentStub(),
        });
        expect(receipt.totals.grossFils).toBe('1500'); // 4.50 + 10.50 = AED 15.00
        expect(BigInt(receipt.totals.netFils) + BigInt(receipt.totals.vatFils)).toBe(1500n);
        expect(receipt.totals.vatBps).toBe(500);
        expect(receipt.lines).toHaveLength(2);
        expect(receipt.lines[0]?.totalFils).toBe('450');
        expect(receipt.payment.slot).toBe('1234');
        expect(receipt.currency).toBe('AED');
    });

    it('is JSON-serializable without bigint leakage', () => {
        const receipt = buildReceipt({
            receiptNumber: 'FILS-0002',
            issuedAt: new Date(),
            seller: { name: 'Fils Café' },
            lines: [{ description: 'Espresso', quantity: 1, unitFils: 1200n }],
            payment: paymentStub(),
        });
        const roundTripped: unknown = JSON.parse(JSON.stringify(receipt));
        expect(roundTripped).toEqual(receipt);
    });

    it('rejects empty receipts and fractional quantities', () => {
        expect(() =>
            buildReceipt({
                receiptNumber: 'FILS-0003',
                issuedAt: new Date(),
                seller: { name: 'Fils Café' },
                lines: [],
                payment: paymentStub(),
            }),
        ).toThrowError(FilsError);
        expect(() =>
            buildReceipt({
                receiptNumber: 'FILS-0004',
                issuedAt: new Date(),
                seller: { name: 'Fils Café' },
                lines: [{ description: 'Half chai', quantity: 0.5, unitFils: 100n }],
                payment: paymentStub(),
            }),
        ).toThrowError(FilsError);
    });

    it('rejects negative unit prices', () => {
        expect(() =>
            buildReceipt({
                receiptNumber: 'FILS-0005',
                issuedAt: new Date(),
                seller: { name: 'Fils Café' },
                lines: [{ description: 'Refund hack', quantity: 1, unitFils: -500n }],
                payment: paymentStub(),
            }),
        ).toThrowError(FilsError);
    });
});

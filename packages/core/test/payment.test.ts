import { describe, expect, it } from 'vitest';

import {
    FilsError,
    createPaymentRequest,
    describeDaedMint,
    generateReference,
    parseSolanaPayUrl,
} from '../src/index.js';

// Arbitrary valid base58 addresses for tests.
const MERCHANT = 'J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj';
const MINT = 'So11111111111111111111111111111111111111112';

const token = describeDaedMint(MINT, 'localnet');

describe('createPaymentRequest', () => {
    it('builds a Solana Pay transfer request URL with all fields', () => {
        const request = createPaymentRequest({
            recipient: MERCHANT,
            amountFils: 1250n,
            token,
            label: 'Fils Café',
            message: 'Order #42 — shukran!',
            memo: 'order-42',
        });
        expect(request.url).toContain(`solana:${MERCHANT}?`);
        expect(request.url).toContain('amount=12.5');
        expect(request.url).toContain(`spl-token=${MINT}`);
        expect(request.url).toContain(`reference=${request.reference}`);
        expect(request.url).toContain('label=Fils+Caf');
    });

    it('generates a fresh reference per request', () => {
        const a = createPaymentRequest({ recipient: MERCHANT, amountFils: 100n, token });
        const b = createPaymentRequest({ recipient: MERCHANT, amountFils: 100n, token });
        expect(a.reference).not.toBe(b.reference);
    });

    it('rejects non-positive amounts and bad addresses', () => {
        expect(() => createPaymentRequest({ recipient: MERCHANT, amountFils: 0n, token })).toThrowError(FilsError);
        expect(() => createPaymentRequest({ recipient: 'not-an-address', amountFils: 1n, token })).toThrowError(
            FilsError,
        );
    });

    it('rejects a token that is not 2-decimal (fils) precision', () => {
        const sixDecimals = { ...token, decimals: 6 };
        expect(() => createPaymentRequest({ recipient: MERCHANT, amountFils: 1250n, token: sixDecimals })).toThrowError(
            FilsError,
        );
    });
});

describe('parseSolanaPayUrl', () => {
    it('round-trips a request built by createPaymentRequest', () => {
        const request = createPaymentRequest({
            recipient: MERCHANT,
            amountFils: 725n,
            token,
            label: 'Fils Café',
            message: 'Order #7',
        });
        const parsed = parseSolanaPayUrl(request.url);
        expect(parsed.recipient).toBe(MERCHANT);
        expect(parsed.amountFils).toBe(725n);
        expect(parsed.splToken).toBe(MINT);
        expect(parsed.references).toEqual([request.reference]);
        expect(parsed.label).toBe('Fils Café');
        expect(parsed.message).toBe('Order #7');
    });

    it('rejects non-solana URLs', () => {
        expect(() => parseSolanaPayUrl('https://example.com')).toThrowError(FilsError);
        expect(() => parseSolanaPayUrl('solana:')).toThrowError(FilsError);
    });
});

describe('generateReference', () => {
    it('produces distinct valid addresses', () => {
        const seen = new Set(Array.from({ length: 50 }, () => generateReference()));
        expect(seen.size).toBe(50);
    });
});

import { address } from '@solana/kit';
import { describeDaedMint } from '@fils/core';
import { describe, expect, it } from 'vitest';

import { createAgent402Server, type Agent402Rpc, type PaymentChallenge } from '../src/server.js';

const SELLER = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const MINT = address('So11111111111111111111111111111111111111112');
const token = describeDaedMint(MINT, 'localnet');

// An RPC where no payment is ever on-chain: getSlot answers, but the
// reference has no signatures, so findPayment returns not-found.
const rpc = {
    getSlot: () => ({ send: () => Promise.resolve(1n) }),
    getSignaturesForAddress: () => ({ send: () => Promise.resolve([]) }),
    getTransaction: () => ({ send: () => Promise.resolve(null) }),
} as unknown as Agent402Rpc;

async function withServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
    const server = createAgent402Server({ rpc, token, seller: SELLER, priceFils: 25n });
    await new Promise<void>(resolve => server.listen(0, resolve));
    try {
        const info = server.address();
        if (info === null || typeof info === 'string') throw new Error('no ephemeral port');
        return await fn(`http://127.0.0.1:${info.port}/api/oracle/aed-usd`);
    } finally {
        server.close();
    }
}

describe('createAgent402Server', () => {
    it('returns a full challenge body when a claimed payment is not yet on-chain', async () => {
        await withServer(async url => {
            const unpaid = await fetch(url);
            expect(unpaid.status).toBe(402);
            const challenge = (await unpaid.json()) as PaymentChallenge;
            const reference = challenge.accepts[0]?.reference;
            expect(reference).toBeDefined();

            // Retry presenting a proof whose payment is not on-chain. The
            // verification-failed branch must still answer with a well-formed
            // challenge (regression: issueChallenge is async and must be
            // awaited, not spread as a Promise).
            const proof = Buffer.from(JSON.stringify({ reference })).toString('base64');
            const retry = await fetch(url, { headers: { 'X-PAYMENT': proof } });
            expect(retry.status).toBe(402);
            const body = (await retry.json()) as PaymentChallenge;
            expect(body.accepts?.[0]?.paymentUrl?.startsWith('solana:')).toBe(true);
            expect(body.error).toContain('Payment not found');
        });
    });
});

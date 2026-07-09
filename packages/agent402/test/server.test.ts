import { address, generateKeyPairSigner } from '@solana/kit';
import { describeDaedMint } from '@fils/core';
import { describe, expect, it, vi } from 'vitest';

import { createAgent402Server, payAndFetch, type Agent402Rpc, type PaymentChallenge } from '../src/server.js';

const SELLER = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const MINT = address('So11111111111111111111111111111111111111112');
const token = describeDaedMint(MINT, 'localnet');

// No payment is ever on-chain: getSlot answers, but the reference has no
// signatures, so findPayment returns not-found.
const notFoundRpc = {
    getSlot: () => ({ send: () => Promise.resolve(1n) }),
    getSignaturesForAddress: () => ({ send: () => Promise.resolve([]) }),
    getTransaction: () => ({ send: () => Promise.resolve(null) }),
} as unknown as Agent402Rpc;

// A single confirming signature satisfies any reference queried (as if one
// transfer had been tagged with several reference keys).
const oneSignatureRpc = {
    getSlot: () => ({ send: () => Promise.resolve(1n) }),
    getSignaturesForAddress: () => ({
        send: () =>
            Promise.resolve([
                { signature: 'PAID', slot: 5n, err: null, memo: null, blockTime: null, confirmationStatus: 'finalized' },
            ]),
    }),
    getTransaction: () => ({
        send: () =>
            Promise.resolve({
                slot: 5n,
                blockTime: null,
                meta: {
                    err: null,
                    preTokenBalances: [],
                    postTokenBalances: [{ mint: MINT, owner: SELLER, uiTokenAmount: { amount: '25' } }],
                },
            }),
    }),
} as unknown as Agent402Rpc;

async function withServer<T>(rpc: Agent402Rpc, fn: (url: string) => Promise<T>): Promise<T> {
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

const proofFor = (reference: string): string => Buffer.from(JSON.stringify({ reference })).toString('base64');

async function newReference(url: string): Promise<string> {
    const challenge = (await (await fetch(url)).json()) as PaymentChallenge;
    const reference = challenge.accepts[0]?.reference;
    if (reference === undefined) throw new Error('no reference in challenge');
    return reference;
}

describe('createAgent402Server', () => {
    it('returns a full challenge body when a claimed payment is not yet on-chain', async () => {
        await withServer(notFoundRpc, async url => {
            const reference = await newReference(url);
            // Retry presenting a proof whose payment is not on-chain. The
            // verification-failed branch must still answer with a well-formed
            // challenge (regression: issueChallenge is async and must be
            // awaited, not spread as a Promise).
            const retry = await fetch(url, { headers: { 'X-PAYMENT': proofFor(reference) } });
            expect(retry.status).toBe(402);
            const body = (await retry.json()) as PaymentChallenge;
            expect(body.accepts?.[0]?.paymentUrl?.startsWith('solana:')).toBe(true);
            expect(body.error).toContain('Payment not found');
        });
    });

    it('refuses (agent side) a challenge whose fields do not match its payment URL', async () => {
        const wallet = await generateKeyPairSigner();
        const reference = 'SysvarC1ock11111111111111111111111111111111';
        const badChallenge: PaymentChallenge = {
            x402Version: 1,
            error: 'Payment required',
            accepts: [
                {
                    scheme: 'solana-aed-reference',
                    network: 'localnet',
                    asset: MINT,
                    // payTo differs from the payment URL's recipient (SELLER).
                    payTo: address('Vote111111111111111111111111111111111111111'),
                    maxAmountRequired: '0.25',
                    reference: address(reference),
                    paymentUrl: `solana:${SELLER}?amount=0.25&spl-token=${MINT}&reference=${reference}`,
                    description: 'AED/USD oracle read',
                    maxTimeoutSeconds: 300,
                },
            ],
        };
        vi.stubGlobal('fetch', () =>
            Promise.resolve(
                new Response(JSON.stringify(badChallenge), {
                    status: 402,
                    headers: { 'content-type': 'application/json' },
                }),
            ),
        );
        try {
            await expect(
                payAndFetch('http://unused.test/', wallet, {} as Agent402Rpc, { maxPriceFils: 100n }),
            ).rejects.toThrow(/payTo/);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('serves one resource per signature even if it is tagged with several references', async () => {
        await withServer(oneSignatureRpc, async url => {
            const refA = await newReference(url);
            const refB = await newReference(url);
            expect(refA).not.toBe(refB);

            const first = await fetch(url, { headers: { 'X-PAYMENT': proofFor(refA) } });
            expect(first.status).toBe(200);

            // The same on-chain signature must not buy a second resource.
            const second = await fetch(url, { headers: { 'X-PAYMENT': proofFor(refB) } });
            expect(second.status).toBe(402);
            const body = (await second.json()) as { error?: string };
            expect(body.error).toContain('already applied');
        });
    });
});

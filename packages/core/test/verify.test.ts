import { address } from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { findPayment, type PaymentVerificationRpc } from '../src/index.js';

const MERCHANT = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const MINT = address('So11111111111111111111111111111111111111112');
const REFERENCE = address('SysvarC1ock11111111111111111111111111111111');

interface Entry {
    signature: string;
    slot: bigint;
    err: unknown;
    /** Fils credited to MERCHANT for MINT in this transaction. */
    delta: bigint;
}

/** A fake RPC over a fixed, newest-first list of reference-tagged signatures. */
function mockRpc(entries: Entry[]): PaymentVerificationRpc {
    const bySig = new Map(entries.map(entry => [entry.signature, entry]));
    const rpc = {
        getSignaturesForAddress(_reference: unknown, options?: { limit?: number; before?: string }) {
            return {
                send: () => {
                    let list = entries;
                    if (options?.before !== undefined) {
                        const index = entries.findIndex(entry => entry.signature === options.before);
                        list = index >= 0 ? entries.slice(index + 1) : [];
                    }
                    return Promise.resolve(
                        list.slice(0, options?.limit ?? entries.length).map(entry => ({
                            signature: entry.signature,
                            slot: entry.slot,
                            err: entry.err,
                            memo: null,
                            blockTime: null,
                            confirmationStatus: 'finalized' as const,
                        })),
                    );
                },
            };
        },
        getTransaction(signature: string) {
            return {
                send: () => {
                    const entry = bySig.get(String(signature));
                    if (entry === undefined || entry.err !== null) return Promise.resolve(null);
                    return Promise.resolve({
                        slot: entry.slot,
                        blockTime: 1_780_000_000n,
                        meta: {
                            err: null,
                            preTokenBalances: [],
                            postTokenBalances:
                                entry.delta === 0n
                                    ? []
                                    : [{ mint: MINT, owner: MERCHANT, uiTokenAmount: { amount: entry.delta.toString() } }],
                        },
                    });
                },
            };
        },
    };
    return rpc as unknown as PaymentVerificationRpc;
}

const request = { recipient: MERCHANT, amountFils: 1250n, reference: REFERENCE, token: { mint: MINT } };

describe('findPayment', () => {
    it('paginates past decoys so a real payment is not buried (reference-spam DoS)', async () => {
        // 14 successful decoys that pay nothing, then the real payment: it sits
        // well beyond a single 10-signature page, yet must still be found.
        const entries: Entry[] = [];
        for (let i = 0; i < 14; i += 1) {
            entries.push({ signature: `decoy-${i}`, slot: BigInt(200 - i), err: null, delta: 0n });
        }
        entries.push({ signature: 'real-payment', slot: 180n, err: null, delta: 1250n });

        const result = await findPayment({ rpc: mockRpc(entries), request, pageSize: 5 });
        expect(result.status).toBe('confirmed');
        if (result.status === 'confirmed') {
            expect(result.signature).toBe('real-payment');
            expect(result.amountFils).toBe(1250n);
        }
    });

    it('ignores a payment older than minSlot (replay boundary)', async () => {
        // Nothing eligible in the window (only failed txns), and one valid
        // payment that predates the order — it must NOT satisfy the order.
        const entries: Entry[] = [
            { signature: 'failed-recent', slot: 150n, err: { InstructionError: [0, 'X'] }, delta: 0n },
            { signature: 'old-payment', slot: 50n, err: null, delta: 1250n },
        ];

        const gated = await findPayment({ rpc: mockRpc(entries), request, minSlot: 100n });
        expect(gated.status).toBe('not-found');

        // Control: without the floor, the same old payment is accepted.
        const ungated = await findPayment({ rpc: mockRpc(entries), request });
        expect(ungated.status).toBe('confirmed');
    });

    it('reports indeterminate when the scan cap is hit before the window is exhausted', async () => {
        // More non-paying decoys than the cap, and no minSlot floor: the scan
        // stops at the cap without proving the payment absent, so it must not
        // claim not-found.
        const entries: Entry[] = Array.from({ length: 6 }, (_, i) => ({
            signature: `decoy-${i}`,
            slot: BigInt(200 - i),
            err: null,
            delta: 0n,
        }));
        const result = await findPayment({ rpc: mockRpc(entries), request, maxSignatures: 3, pageSize: 3 });
        expect(result.status).toBe('indeterminate');
    });
});

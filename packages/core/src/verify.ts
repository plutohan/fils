import type {
    Address,
    GetSignaturesForAddressApi,
    GetTransactionApi,
    Rpc,
    Signature,
} from '@solana/kit';

import type { AedPaymentRequest } from './payment.js';

/** The RPC surface `findPayment` needs — any `createSolanaRpc(...)` satisfies it. */
export type PaymentVerificationRpc = Rpc<GetSignaturesForAddressApi & GetTransactionApi>;

export type PaymentVerification =
    | {
          status: 'confirmed';
          signature: Signature;
          slot: bigint;
          blockTime: bigint | null;
          /** Amount actually received by the recipient, in fils. */
          amountFils: bigint;
      }
    | { status: 'not-found' }
    | {
          /** A transaction referenced this payment but paid the wrong amount/token. */
          status: 'amount-mismatch';
          signature: Signature;
          amountFils: bigint;
      };

export interface FindPaymentInput {
    rpc: PaymentVerificationRpc;
    request: Pick<AedPaymentRequest, 'recipient' | 'amountFils' | 'reference'> & {
        token: { mint: Address };
    };
    /**
     * Only accept transactions at or after this slot. Set it to the slot at
     * which the order (or 402 challenge) was created: it stops an *older*
     * payment for the same recipient/mint/amount from satisfying a new order
     * (replay), and bounds how far back the scan reaches. Strongly recommended
     * for server integrations; combine with single-use references.
     */
    minSlot?: bigint;
    /**
     * Hard cap on how many reference-tagged signatures to scan across pages.
     * Guards against reference-spam: an attacker who sees the (public)
     * reference cannot bury the real payment behind cheap decoys, because the
     * scan paginates through the whole eligible window rather than a single
     * short page. Default 1000.
     */
    maxSignatures?: number;
    /** Signatures fetched per `getSignaturesForAddress` page (RPC max 1000). Default 1000. */
    pageSize?: number;
}

/**
 * Find and verify a payment on-chain by its reference key.
 *
 * Trust model: we do NOT trust the payer or any instruction layout. We look
 * up transactions that mention the reference address, then check the
 * recipient's **token balance delta** for the expected mint in transaction
 * metadata — robust against exotic instruction shapes, CPI wrapping, and
 * multi-transfer transactions.
 */
export async function findPayment(input: FindPaymentInput): Promise<PaymentVerification> {
    const { rpc, request } = input;
    const minSlot = input.minSlot;
    const maxSignatures = Math.max(1, input.maxSignatures ?? 1000);
    const pageSize = Math.min(Math.max(1, input.pageSize ?? 1000), 1000);

    let mismatch: Extract<PaymentVerification, { status: 'amount-mismatch' }> | undefined;
    let before: Signature | undefined;
    let scanned = 0;

    // Paginate newest-first through every reference-tagged signature in the
    // eligible window, not just the first page: a confirmed payment is
    // returned as soon as it is found, so decoy transactions cannot hide it.
    while (scanned < maxSignatures) {
        const limit = Math.min(pageSize, maxSignatures - scanned);
        const page = await rpc
            .getSignaturesForAddress(request.reference, {
                limit,
                ...(before !== undefined ? { before } : {}),
            })
            .send();
        if (page.length === 0) break;

        for (const entry of page) {
            scanned += 1;
            before = entry.signature;
            // Signatures are newest-first; once one predates the eligible
            // window, every remaining (older) one does too — stop here.
            if (minSlot !== undefined && entry.slot < minSlot) {
                return mismatch ?? { status: 'not-found' };
            }
            if (entry.err !== null) continue;
            const transaction = await rpc
                .getTransaction(entry.signature, {
                    encoding: 'jsonParsed',
                    maxSupportedTransactionVersion: 0,
                })
                .send();
            if (transaction === null || transaction.meta === null || transaction.meta.err !== null) continue;

            const received = recipientDeltaFils(transaction.meta, request.recipient, request.token.mint);
            if (received >= request.amountFils) {
                return {
                    status: 'confirmed',
                    signature: entry.signature,
                    slot: transaction.slot,
                    blockTime: transaction.blockTime,
                    amountFils: received,
                };
            }
            mismatch ??= { status: 'amount-mismatch', signature: entry.signature, amountFils: received };
        }

        if (page.length < limit) break;
    }

    return mismatch ?? { status: 'not-found' };
}

interface TokenBalance {
    readonly mint: string;
    readonly owner?: string;
    readonly uiTokenAmount: { readonly amount: string };
}

interface TransactionTokenMeta {
    readonly preTokenBalances?: readonly TokenBalance[] | null;
    readonly postTokenBalances?: readonly TokenBalance[] | null;
}

/** Sum the recipient-owned balance change for `mint` across the transaction. */
function recipientDeltaFils(meta: TransactionTokenMeta, recipient: Address, mint: Address): bigint {
    const sum = (balances: readonly TokenBalance[] | null | undefined): bigint =>
        (balances ?? [])
            .filter(balance => balance.owner === recipient && balance.mint === mint)
            .reduce((total, balance) => total + BigInt(balance.uiTokenAmount.amount), 0n);
    return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
}

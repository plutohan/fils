import type {
    Address,
    GetSignaturesForAddressApi,
    GetTransactionApi,
    Rpc,
    Signature,
} from '@solana/kit';

import { AED_DECIMALS } from './amount.js';
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
      }
    | {
          /**
           * The scan hit `maxSignatures` before the eligible window was
           * exhausted, so the payment can be neither confirmed nor definitively
           * ruled out (e.g. reference spam pushed it past the cap). Not a
           * definitive "unpaid": retry, raise `maxSignatures`, or supply
           * `minSlot`.
           */
          status: 'indeterminate';
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
    /**
     * Commitment both RPC reads run at. Defaults to `'finalized'`: irreversible
     * fulfillment (serving a paid resource, issuing a receipt) must not act on a
     * merely-confirmed payment that a dropped fork could still roll back. Pass
     * `'confirmed'` only for fast, reversible UX where that risk is acceptable.
     * (`'processed'` is intentionally not offered: it is never safe for
     * settlement and the signature RPC rejects it.)
     */
    commitment?: 'confirmed' | 'finalized';
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
    const commitment = input.commitment ?? 'finalized';

    let mismatch: Extract<PaymentVerification, { status: 'amount-mismatch' }> | undefined;
    let before: Signature | undefined;
    let scanned = 0;

    // Paginate newest-first through every reference-tagged signature in the
    // eligible window, not just the first page: a confirmed payment is
    // returned as soon as it is found, so decoy transactions cannot hide it.
    // "not-found" is only returned once the window is fully scanned (an older
    // signature seen, or signatures exhausted); hitting the cap first is
    // reported as `indeterminate`, never a definitive "unpaid".
    while (scanned < maxSignatures) {
        const limit = Math.min(pageSize, maxSignatures - scanned);
        const page = await rpc
            .getSignaturesForAddress(request.reference, {
                limit,
                commitment,
                ...(before !== undefined ? { before } : {}),
            })
            .send();
        // No (more) signatures reference this payment: definitively not found.
        if (page.length === 0) return mismatch ?? { status: 'not-found' };

        for (const entry of page) {
            scanned += 1;
            before = entry.signature;
            // Signatures are newest-first; once one predates the eligible
            // window, every remaining (older) one does too, so the window is
            // fully scanned — this is definitive.
            if (minSlot !== undefined && entry.slot < minSlot) {
                return mismatch ?? { status: 'not-found' };
            }
            if (entry.err !== null) continue;
            const transaction = await rpc
                .getTransaction(entry.signature, {
                    encoding: 'jsonParsed',
                    commitment,
                    maxSupportedTransactionVersion: 0,
                })
                .send();
            if (transaction === null || transaction.meta === null || transaction.meta.err !== null) continue;

            const received = recipientDeltaFils(transaction.meta, request.recipient, request.token.mint);
            // A mint whose on-chain decimals are not fils (2) cannot satisfy an
            // AED request: its raw units are not a fils count. Fail closed.
            if (received === null) continue;
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

        // A short page means the reference has no more signatures: definitive.
        if (page.length < limit) return mismatch ?? { status: 'not-found' };
    }

    // Reached the scan cap without exhausting the window. The payment may be
    // buried beyond the cap (reference spam), so do not claim it is unpaid.
    return { status: 'indeterminate' };
}

interface TokenBalance {
    readonly mint: string;
    readonly owner?: string;
    readonly uiTokenAmount: { readonly amount: string; readonly decimals: number };
}

interface TransactionTokenMeta {
    readonly preTokenBalances?: readonly TokenBalance[] | null;
    readonly postTokenBalances?: readonly TokenBalance[] | null;
}

/**
 * Sum the recipient-owned balance change for `mint`, in fils. Returns `null`
 * when any of the recipient's balances for this mint is not 2-decimal: raw
 * token units only equal fils at `AED_DECIMALS`, so a mint with other decimals
 * (e.g. a 6-decimal token registered as AED) must fail closed rather than have
 * its raw amount misread as a fils total.
 */
function recipientDeltaFils(meta: TransactionTokenMeta, recipient: Address, mint: Address): bigint | null {
    const matching = (balances: readonly TokenBalance[] | null | undefined): readonly TokenBalance[] =>
        (balances ?? []).filter(balance => balance.owner === recipient && balance.mint === mint);
    const involved = [...matching(meta.preTokenBalances), ...matching(meta.postTokenBalances)];
    if (involved.some(balance => balance.uiTokenAmount.decimals !== AED_DECIMALS)) return null;
    const sum = (balances: readonly TokenBalance[] | null | undefined): bigint =>
        matching(balances).reduce((total, balance) => total + BigInt(balance.uiTokenAmount.amount), 0n);
    return sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
}

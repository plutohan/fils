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
    /** How many recent reference-tagged signatures to inspect. Default 10. */
    signatureLimit?: number;
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
    const signatures = await rpc
        .getSignaturesForAddress(request.reference, {
            limit: input.signatureLimit ?? 10,
        })
        .send();

    let mismatch: Extract<PaymentVerification, { status: 'amount-mismatch' }> | undefined;

    for (const entry of signatures) {
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

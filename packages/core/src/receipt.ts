import type { Address, Signature } from '@solana/kit';

import { UAE_VAT_BPS, vatBreakdownFromGross } from './amount.js';
import { FilsError } from './errors.js';
import type { SolanaCluster } from './registry.js';

/**
 * A payment receipt aligned with the fields UAE invoices carry (seller TRN,
 * VAT breakdown at the standard rate, line items) plus the on-chain proof of
 * payment. Amounts are serialized as decimal strings of fils so the JSON is
 * lossless and language-agnostic.
 *
 * This is a receipt data model, not a Peppol PINT AE e-invoice — it is
 * deliberately shaped so a merchant backend can lift the fields straight into
 * one when the UAE e-invoicing mandate reaches them.
 */
export interface FilsReceipt {
    readonly schema: 'fils/receipt@0.1';
    readonly receiptNumber: string;
    /** ISO-8601 timestamp of issuance. */
    readonly issuedAt: string;
    readonly seller: {
        readonly name: string;
        /** UAE Tax Registration Number, when the seller is VAT-registered. */
        readonly trn?: string;
    };
    readonly lines: readonly FilsReceiptLine[];
    readonly currency: 'AED';
    readonly totals: {
        readonly grossFils: string;
        readonly netFils: string;
        readonly vatFils: string;
        readonly vatBps: number;
    };
    readonly payment: {
        readonly network: 'solana';
        readonly cluster: SolanaCluster;
        readonly mint: Address;
        readonly recipient: Address;
        readonly reference: Address;
        readonly signature: Signature;
        /** Amount actually received on-chain for this signature, in fils. */
        readonly amountFils: string;
        readonly slot: string;
        readonly blockTime: string | null;
    };
}

export interface FilsReceiptLine {
    readonly description: string;
    readonly quantity: number;
    /** Unit price in fils, VAT-inclusive (UAE retail prices include VAT). */
    readonly unitFils: string;
    readonly totalFils: string;
}

export interface BuildReceiptInput {
    receiptNumber: string;
    issuedAt: Date;
    seller: { name: string; trn?: string };
    lines: { description: string; quantity: number; unitFils: bigint }[];
    payment: {
        cluster: SolanaCluster;
        mint: Address;
        recipient: Address;
        reference: Address;
        signature: Signature;
        /** Amount the payment was verified to have delivered on-chain, in fils. */
        amountFils: bigint;
        slot: bigint;
        blockTime: bigint | null;
    };
    vatBps?: bigint;
}

export function buildReceipt(input: BuildReceiptInput): FilsReceipt {
    if (input.lines.length === 0) {
        throw new FilsError('INVALID_AMOUNT', 'a receipt needs at least one line');
    }
    const lines: FilsReceiptLine[] = input.lines.map(line => {
        if (line.quantity <= 0 || !Number.isSafeInteger(line.quantity)) {
            throw new FilsError('INVALID_AMOUNT', `invalid quantity ${line.quantity} for "${line.description}"`);
        }
        if (line.unitFils < 0n) {
            throw new FilsError(
                'INVALID_AMOUNT',
                `unit price cannot be negative (${line.unitFils} fils) for "${line.description}"`,
            );
        }
        const totalFils = line.unitFils * BigInt(line.quantity);
        return {
            description: line.description,
            quantity: line.quantity,
            unitFils: line.unitFils.toString(),
            totalFils: totalFils.toString(),
        };
    });
    const grossFils = lines.reduce((total, line) => total + BigInt(line.totalFils), 0n);
    // Bind the receipt to its on-chain proof: the verified payment must cover
    // the receipt total, so a signature that paid AED 1 cannot back an AED 100
    // receipt. (A larger amount is accepted as an overpayment / tip.)
    if (input.payment.amountFils < grossFils) {
        throw new FilsError(
            'INCONSISTENT_INPUT',
            `verified payment of ${input.payment.amountFils} fils does not cover the receipt total of ${grossFils} fils`,
        );
    }
    const vat = vatBreakdownFromGross(grossFils, input.vatBps ?? UAE_VAT_BPS);

    return {
        schema: 'fils/receipt@0.1',
        receiptNumber: input.receiptNumber,
        issuedAt: input.issuedAt.toISOString(),
        seller: { name: input.seller.name, ...(input.seller.trn !== undefined ? { trn: input.seller.trn } : {}) },
        lines,
        currency: 'AED',
        totals: {
            grossFils: vat.grossFils.toString(),
            netFils: vat.netFils.toString(),
            vatFils: vat.vatFils.toString(),
            vatBps: Number(vat.vatBps),
        },
        payment: {
            network: 'solana',
            cluster: input.payment.cluster,
            mint: input.payment.mint,
            recipient: input.payment.recipient,
            reference: input.payment.reference,
            signature: input.payment.signature,
            amountFils: input.payment.amountFils.toString(),
            slot: input.payment.slot.toString(),
            blockTime: input.payment.blockTime === null ? null : input.payment.blockTime.toString(),
        },
    };
}

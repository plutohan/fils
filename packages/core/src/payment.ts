import { address, getAddressDecoder, type Address } from '@solana/kit';

import { AED_DECIMALS, filsToDecimalString, parseAed } from './amount.js';
import { FilsError } from './errors.js';
import type { AedTokenInfo } from './registry.js';

/**
 * An AED-denominated Solana Pay transfer request
 * (https://docs.solanapay.com/spec#specification-transfer-request).
 *
 * The `reference` is a random pubkey attached to the payment transaction as
 * an account key; it is how the merchant later finds and verifies the payment
 * on-chain without knowing the buyer's wallet in advance.
 */
export interface AedPaymentRequest {
    readonly recipient: Address;
    readonly amountFils: bigint;
    readonly token: AedTokenInfo;
    readonly reference: Address;
    /** `solana:` URL to encode as a QR / deep link. */
    readonly url: string;
    readonly label?: string;
    readonly message?: string;
    readonly memo?: string;
}

export interface CreatePaymentRequestInput {
    /** Merchant wallet (owner address, not a token account). */
    recipient: Address | string;
    amountFils: bigint;
    token: AedTokenInfo;
    label?: string;
    message?: string;
    memo?: string;
    /**
     * Resume an existing reference; omitted → a fresh single-use one.
     * References MUST be single-use: reusing one across orders lets an older
     * on-chain payment of the same recipient/mint/amount satisfy a new order
     * (pair verification with `findPayment`'s `minSlot`). Only pass this to
     * keep verifying one specific in-flight request.
     */
    reference?: Address | string;
}

/**
 * Generate a unique, single-use payment reference (random 32 bytes as a
 * base58 address). A fresh reference per payment is what makes reference-based
 * on-chain verification unambiguous; never reuse one across orders.
 */
export function generateReference(): Address {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return getAddressDecoder().decode(bytes);
}

export function createPaymentRequest(input: CreatePaymentRequestInput): AedPaymentRequest {
    if (input.amountFils <= 0n) {
        throw new FilsError('INVALID_AMOUNT', 'payment amount must be positive');
    }
    // The whole SDK treats raw token units as fils, so the amount and its
    // on-chain verification are only correct for a 2-decimal token. Reject
    // anything else here rather than silently encoding a wrong amount.
    if (input.token.decimals !== AED_DECIMALS) {
        throw new FilsError(
            'INVALID_TOKEN',
            `${input.token.symbol} must be a 2-decimal (fils) AED token; got ${input.token.decimals} decimals`,
        );
    }
    const recipient = toAddress(input.recipient, 'recipient');
    const reference = input.reference === undefined ? generateReference() : toAddress(input.reference, 'reference');

    const params = new URLSearchParams();
    params.set('amount', filsToDecimalString(input.amountFils));
    params.set('spl-token', input.token.mint);
    params.set('reference', reference);
    if (input.label !== undefined) params.set('label', input.label);
    if (input.message !== undefined) params.set('message', input.message);
    if (input.memo !== undefined) params.set('memo', input.memo);

    const request: AedPaymentRequest = {
        recipient,
        amountFils: input.amountFils,
        token: input.token,
        reference,
        url: `solana:${recipient}?${params.toString()}`,
    };
    return withOptionalText(request, input);
}

export interface ParsedSolanaPayUrl {
    readonly recipient: Address;
    readonly amountFils?: bigint;
    readonly splToken?: Address;
    readonly references: Address[];
    readonly label?: string;
    readonly message?: string;
    readonly memo?: string;
}

/**
 * Parse a `solana:` transfer request URL (the wallet side of the handshake).
 * Amounts are returned in fils and therefore only valid for 2-decimal tokens.
 */
export function parseSolanaPayUrl(url: string): ParsedSolanaPayUrl {
    const withoutScheme = url.startsWith('solana:') ? url.slice('solana:'.length) : undefined;
    if (withoutScheme === undefined || withoutScheme.length === 0) {
        throw new FilsError('INVALID_URL', `not a solana: URL: "${url}"`);
    }
    const [recipientPart = '', queryPart] = splitOnce(withoutScheme, '?');
    const recipient = toAddress(decodeURIComponent(recipientPart), 'recipient');
    const params = new URLSearchParams(queryPart ?? '');

    const amountRaw = params.get('amount');
    const splTokenRaw = params.get('spl-token');
    const parsed: ParsedSolanaPayUrl = {
        recipient,
        references: params.getAll('reference').map(ref => toAddress(ref, 'reference')),
        ...(amountRaw !== null ? { amountFils: parseAed(amountRaw) } : {}),
        ...(splTokenRaw !== null ? { splToken: toAddress(splTokenRaw, 'spl-token') } : {}),
        ...optionalParam(params, 'label'),
        ...optionalParam(params, 'message'),
        ...optionalParam(params, 'memo'),
    };
    return parsed;
}

function withOptionalText(request: AedPaymentRequest, input: CreatePaymentRequestInput): AedPaymentRequest {
    return {
        ...request,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.message !== undefined ? { message: input.message } : {}),
        ...(input.memo !== undefined ? { memo: input.memo } : {}),
    };
}

function optionalParam(params: URLSearchParams, key: 'label' | 'message' | 'memo'): Partial<ParsedSolanaPayUrl> {
    const value = params.get(key);
    return value !== null ? { [key]: value } : {};
}

function splitOnce(value: string, separator: string): [string, string?] {
    const index = value.indexOf(separator);
    if (index === -1) return [value];
    return [value.slice(0, index), value.slice(index + separator.length)];
}

function toAddress(value: Address | string, field: string): Address {
    try {
        return address(value.toString());
    } catch {
        throw new FilsError('INVALID_ADDRESS', `${field} is not a valid Solana address: "${value}"`);
    }
}

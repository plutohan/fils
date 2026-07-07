/**
 * An x402-style HTTP 402 paywall settled in dirhams on Solana.
 *
 * Protocol shape (x402's challenge → pay → replay loop, verification mode):
 *   1. GET a paid route without payment → 402 + JSON challenge listing one
 *      accepted payment: fixed fils amount of an AED token to the seller,
 *      tagged with a single-use reference key.
 *   2. The agent pays on-chain (a standard Solana Pay-tagged transfer) and
 *      replays the request with `X-PAYMENT: base64(JSON{reference})`.
 *   3. The server verifies the payment by reference (mint, amount, seller)
 *      straight from the chain, burns the reference, and serves the data
 *      with an `X-PAYMENT-RESPONSE` settlement header.
 *
 * Divergences from full x402 "exact" (documented, deliberate): no
 * facilitator — the payer submits the transfer and the seller self-verifies
 * on-chain; the header carries a reference proof instead of a signed
 * transaction. Full pay-kit facilitator integration is a roadmap item.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { Address, KeyPairSigner } from '@solana/kit';
import {
    createPaymentRequest,
    describeDaedMint,
    filsToDecimalString,
    findPayment,
    formatAed,
    parseSolanaPayUrl,
    type AedPaymentRequest,
    type AedTokenInfo,
    type PaymentVerificationRpc,
} from '@fils/core';
import { payAedRequest, type DaedRpc } from '@fils/daed';

/** Needs both the payment-sending and the payment-verifying RPC surfaces. */
export type Agent402Rpc = DaedRpc & PaymentVerificationRpc;

export interface Agent402Config {
    rpc: Agent402Rpc;
    token: AedTokenInfo;
    /** Seller wallet receiving the AED. */
    seller: Address;
    /** Price per request, in fils. */
    priceFils: bigint;
    /** Challenge validity window in ms (default 5 minutes). */
    challengeTtlMs?: number;
}

export interface PaymentChallenge {
    x402Version: 1;
    error: string;
    accepts: [
        {
            scheme: 'solana-aed-reference';
            network: string;
            asset: Address;
            payTo: Address;
            maxAmountRequired: string;
            reference: Address;
            /** Solana Pay URL for the same payment — wallets and agents alike can pay it. */
            paymentUrl: string;
            description: string;
            maxTimeoutSeconds: number;
        },
    ];
}

interface PendingChallenge {
    request: AedPaymentRequest;
    expiresAt: number;
    settled: boolean;
}

/** The paid resource: a toy AED/USD oracle. The paywall is the point. */
function paidResource(): unknown {
    return {
        pair: 'AED/USD',
        // The dirham is pegged at 3.6725 AED per USD since 1997.
        rate: 0.27229,
        inverseRate: 3.6725,
        source: 'CBUAE peg (static demo data)',
        retrievedAt: new Date().toISOString(),
    };
}

export function createAgent402Server(config: Agent402Config): Server {
    const challenges = new Map<string, PendingChallenge>();
    const ttl = config.challengeTtlMs ?? 5 * 60_000;

    const issueChallenge = (): PaymentChallenge => {
        const request = createPaymentRequest({
            recipient: config.seller,
            amountFils: config.priceFils,
            token: config.token,
            label: 'Fils oracle',
            message: 'AED/USD rate query',
        });
        challenges.set(request.reference, {
            request,
            expiresAt: Date.now() + ttl,
            settled: false,
        });
        return {
            x402Version: 1,
            error: 'Payment required',
            accepts: [
                {
                    scheme: 'solana-aed-reference',
                    network: config.token.cluster,
                    asset: config.token.mint,
                    payTo: config.seller,
                    maxAmountRequired: filsToDecimalString(config.priceFils),
                    reference: request.reference,
                    paymentUrl: request.url,
                    description: `AED/USD oracle read — ${formatAed(config.priceFils)}`,
                    maxTimeoutSeconds: Math.floor(ttl / 1000),
                },
            ],
        };
    };

    return createServer((request, response) => {
        void handle(request, response).catch(error => {
            respondJson(response, 500, { error: String(error) });
        });
    });

    async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.method !== 'GET' || request.url?.split('?')[0] !== '/api/oracle/aed-usd') {
            respondJson(response, 404, { error: 'not-found' });
            return;
        }

        const proof = decodePaymentHeader(request.headers['x-payment']);
        if (proof === undefined) {
            respondJson(response, 402, issueChallenge());
            return;
        }

        const pending = challenges.get(proof.reference);
        if (!pending || Date.now() > pending.expiresAt) {
            respondJson(response, 402, { ...issueChallenge(), error: 'Unknown or expired reference' });
            return;
        }
        if (pending.settled) {
            respondJson(response, 402, { ...issueChallenge(), error: 'Payment proof already used' });
            return;
        }

        const verification = await findPayment({ rpc: config.rpc, request: pending.request });
        if (verification.status !== 'confirmed') {
            respondJson(response, 402, {
                ...issueChallenge(),
                error: `Payment not found on-chain (${verification.status})`,
            });
            return;
        }

        pending.settled = true;
        response.setHeader(
            'X-PAYMENT-RESPONSE',
            Buffer.from(
                JSON.stringify({
                    success: true,
                    network: config.token.cluster,
                    transaction: verification.signature,
                    payer: null,
                }),
            ).toString('base64'),
        );
        respondJson(response, 200, paidResource());
    }
}

function decodePaymentHeader(header: string | string[] | undefined): { reference: string } | undefined {
    if (typeof header !== 'string' || header.length === 0) return undefined;
    try {
        const decoded: unknown = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
        if (typeof decoded === 'object' && decoded !== null && 'reference' in decoded) {
            const reference = (decoded as { reference: unknown }).reference;
            if (typeof reference === 'string') return { reference };
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body, null, 2));
}

/** The agent side: fetch a paid URL, settling the 402 in AED when asked. */
export async function payAndFetch(
    url: string,
    wallet: KeyPairSigner,
    rpc: Agent402Rpc,
    options: { maxPriceFils: bigint },
): Promise<{ status: number; body: unknown; paidSignature?: string }> {
    const first = await fetch(url);
    if (first.status !== 402) {
        return { status: first.status, body: await first.json() };
    }

    const challenge = (await first.json()) as PaymentChallenge;
    const accept = challenge.accepts[0];
    const parsed = parseSolanaPayUrl(accept.paymentUrl);
    if (parsed.amountFils === undefined || parsed.amountFils > options.maxPriceFils) {
        throw new Error(`price ${parsed.amountFils} exceeds the agent's budget ${options.maxPriceFils}`);
    }

    const signature = await payAedRequest(rpc, wallet, {
        recipient: accept.payTo,
        amountFils: parsed.amountFils,
        token: describeDaedMint(accept.asset, accept.network as AedTokenInfo['cluster']),
        reference: accept.reference,
        url: accept.paymentUrl,
    });

    const proof = Buffer.from(JSON.stringify({ reference: accept.reference })).toString('base64');
    const retry = await fetch(url, { headers: { 'X-PAYMENT': proof } });
    return { status: retry.status, body: await retry.json(), paidSignature: signature };
}

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

import type { Address, GetSlotApi, KeyPairSigner, Rpc } from '@solana/kit';
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

/** Needs the payment-sending, payment-verifying, and current-slot RPC surfaces. */
export type Agent402Rpc = DaedRpc & PaymentVerificationRpc & Rpc<GetSlotApi>;

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
    /** Slot at which the challenge was issued; the payment must be at or after it. */
    minSlot: bigint;
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
    // Signatures already spent on a resource. One on-chain payment settles
    // exactly one challenge, even if the payer tagged the transfer with
    // several references.
    const consumedSignatures = new Set<string>();
    const ttl = config.challengeTtlMs ?? 5 * 60_000;

    const issueChallenge = async (): Promise<PaymentChallenge> => {
        // Sweep expired challenges so unpaid probes cannot grow the map forever.
        const now = Date.now();
        for (const [reference, pending] of challenges) {
            if (now > pending.expiresAt) challenges.delete(reference);
        }
        // The payment must land at or after the challenge is issued, so record
        // the current slot as the verification floor (blocks replaying an
        // earlier payment for the same seller/amount).
        const minSlot = await config.rpc.getSlot().send();
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
            minSlot,
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
            respondJson(response, 402, await issueChallenge());
            return;
        }

        const pending = challenges.get(proof.reference);
        if (!pending || Date.now() > pending.expiresAt) {
            respondJson(response, 402, { ...(await issueChallenge()), error: 'Unknown or expired reference' });
            return;
        }
        if (pending.settled) {
            respondJson(response, 402, { ...(await issueChallenge()), error: 'Payment proof already used' });
            return;
        }
        // Mark BEFORE the async verification: two concurrent requests with the
        // same proof must not both pass the check while one awaits the RPC
        // (classic check-then-act race). Un-mark if verification fails so an
        // honest client can retry once its payment lands.
        pending.settled = true;

        const verification = await findPayment({
            rpc: config.rpc,
            request: pending.request,
            minSlot: pending.minSlot,
        });
        if (verification.status !== 'confirmed') {
            pending.settled = false;
            respondJson(response, 402, {
                ...(await issueChallenge()),
                error: `Payment not found on-chain (${verification.status})`,
            });
            return;
        }
        // A given signature can satisfy only one challenge: a single transfer
        // may carry multiple reference keys, and each would otherwise verify
        // against the same signature and buy a separate resource.
        if (consumedSignatures.has(verification.signature)) {
            respondJson(response, 402, {
                ...(await issueChallenge()),
                error: 'Payment already applied to another request',
            });
            return;
        }
        consumedSignatures.add(verification.signature);

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
): Promise<{ status: number; body: unknown; paidSignature?: string; paidReference?: string }> {
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
    // The paymentUrl is what a wallet would actually pay, so bind the machine
    // fields to it: a challenge must not budget-check with one URL while
    // steering payment to a different recipient, token, or reference.
    if (parsed.recipient !== accept.payTo) {
        throw new Error("challenge payTo does not match its payment URL's recipient");
    }
    if (parsed.splToken !== accept.asset) {
        throw new Error("challenge asset does not match its payment URL's token");
    }
    if (!parsed.references.includes(accept.reference)) {
        throw new Error('challenge reference is not present in its payment URL');
    }

    const signature = await payAedRequest(rpc, wallet, {
        recipient: parsed.recipient,
        amountFils: parsed.amountFils,
        token: describeDaedMint(parsed.splToken, accept.network as AedTokenInfo['cluster']),
        reference: accept.reference,
        url: accept.paymentUrl,
    });

    const proof = Buffer.from(JSON.stringify({ reference: accept.reference })).toString('base64');
    const retry = await fetch(url, { headers: { 'X-PAYMENT': proof } });
    return {
        status: retry.status,
        body: await retry.json(),
        paidSignature: signature,
        paidReference: accept.reference,
    };
}

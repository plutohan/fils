import {
    createSolanaRpc,
    type KeyPairSigner,
    type Rpc,
    type SolanaRpcApi,
} from '@solana/kit';
import {
    describeDaedMint,
    guessClusterFromUrl,
    type AedPaymentRequest,
    type AedTokenInfo,
    type SolanaCluster,
} from '@fils/core';
import { loadDaedMintState, loadOrCreateSigner } from '@fils/daed/node';

export interface DemoOrder {
    readonly orderNumber: string;
    readonly request: AedPaymentRequest;
    readonly lines: { description: string; quantity: number; unitFils: bigint }[];
    readonly createdAt: Date;
}

export interface DemoServerState {
    /** Test-cluster RPC type: the demo targets the local validator or devnet. */
    readonly rpc: Rpc<SolanaRpcApi>;
    readonly rpcUrl: string;
    readonly cluster: SolanaCluster;
    readonly merchant: KeyPairSigner;
    /** Undefined until `daed:create` has been run against this cluster. */
    readonly token: AedTokenInfo | undefined;
    readonly orders: Map<string, DemoOrder>;
    nextOrderNumber: number;
}

// Stashed on globalThis so the state (and in-memory orders) survive Next.js
// dev-server module reloads.
const globalState = globalThis as { __filsDemoState?: Promise<DemoServerState> };

export function getServerState(): Promise<DemoServerState> {
    globalState.__filsDemoState ??= initState();
    return globalState.__filsDemoState;
}

async function initState(): Promise<DemoServerState> {
    const rpcUrl = process.env['RPC_URL'] ?? 'http://127.0.0.1:8899';
    const cluster = guessClusterFromUrl(rpcUrl);
    const merchant = await loadOrCreateSigner('merchant');
    const daedState = await loadDaedMintState();
    const token =
        daedState !== undefined && daedState.cluster === cluster
            ? describeDaedMint(daedState.mint, cluster)
            : undefined;
    return {
        rpc: createSolanaRpc(rpcUrl) as Rpc<SolanaRpcApi>,
        rpcUrl,
        cluster,
        merchant,
        token,
        orders: new Map(),
        nextOrderNumber: 1,
    };
}

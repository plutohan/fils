import type { Signature } from '@solana/kit';

import type { SolanaCluster } from './registry.js';

/** Best-effort cluster guess from an RPC URL (dev tooling convenience). */
export function guessClusterFromUrl(rpcUrl: string): SolanaCluster {
    if (rpcUrl.includes('devnet')) return 'devnet';
    if (rpcUrl.includes('testnet')) return 'testnet';
    if (rpcUrl.includes('mainnet')) return 'mainnet-beta';
    return 'localnet';
}

/** Solana Explorer link for a transaction, on any cluster including a local validator. */
export function explorerTxUrl(signature: Signature | string, cluster: SolanaCluster, rpcUrl?: string): string {
    const base = `https://explorer.solana.com/tx/${signature}`;
    switch (cluster) {
        case 'mainnet-beta':
            return base;
        case 'devnet':
        case 'testnet':
            return `${base}?cluster=${cluster}`;
        case 'localnet': {
            const customUrl = encodeURIComponent(rpcUrl ?? 'http://127.0.0.1:8899');
            return `${base}?cluster=custom&customUrl=${customUrl}`;
        }
    }
}

import { address, type Address } from '@solana/kit';

import { FilsError } from './errors.js';

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';

export const TOKEN_2022_PROGRAM_ADDRESS = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const TOKEN_PROGRAM_ADDRESS = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * A dirham-denominated payment token this SDK knows how to charge in.
 *
 * `regulatoryStatus` is honest labeling, not legal certification:
 * - `reference`      — unbacked developer reference token (e.g. dAED on devnet)
 * - `cbuae-licensed` — a token whose issuer holds a CBUAE Payment Token
 *                      Issuance licence (none exist on Solana yet; the day one
 *                      does, it is a registry entry away)
 */
export interface AedTokenInfo {
    readonly mint: Address;
    readonly symbol: string;
    readonly name: string;
    /** AED payment tokens use 2 decimals: the raw amount is a fils count. */
    readonly decimals: number;
    readonly cluster: SolanaCluster;
    readonly tokenProgram: Address;
    readonly issuer: string;
    readonly regulatoryStatus: 'reference' | 'cbuae-licensed';
    readonly website?: string;
}

/**
 * Cluster-scoped registry of AED payment tokens. Ships with the tokens this
 * repo maintains (dAED); real issuers' mints are added as they deploy —
 * integrating a newly licensed AED token is a config change, not a code
 * change.
 */
export class AedTokenRegistry {
    private readonly byMintMap = new Map<Address, AedTokenInfo>();

    register(token: AedTokenInfo): AedTokenInfo {
        if (token.decimals !== 2) {
            throw new FilsError(
                'INVALID_TOKEN',
                `${token.symbol}: AED payment tokens must use 2 decimals (fils); got ${token.decimals}`,
            );
        }
        this.byMintMap.set(token.mint, token);
        return token;
    }

    byMint(mint: Address | string): AedTokenInfo | undefined {
        return this.byMintMap.get(address(mint.toString()));
    }

    forCluster(cluster: SolanaCluster): AedTokenInfo[] {
        return [...this.byMintMap.values()].filter(token => token.cluster === cluster);
    }

    all(): AedTokenInfo[] {
        return [...this.byMintMap.values()];
    }
}

/**
 * The dAED reference mint this repo maintains on devnet, created by
 * `@fils/scripts` create-daed. Unbacked; for building and testing only.
 */
export const DAED_DEVNET_MINT = address('59YMGgi9UwUMJt7dMbhumQKno3rdyf9paNyArutxybr1');

/**
 * Registry pre-loaded with the built-in tokens (the devnet dAED reference
 * mint). Pass extra entries for locally-created mints (see `@fils/scripts`
 * create-daed).
 */
export function createAedTokenRegistry(extra: AedTokenInfo[] = []): AedTokenRegistry {
    const registry = new AedTokenRegistry();
    registry.register(describeDaedMint(DAED_DEVNET_MINT, 'devnet'));
    for (const token of extra) {
        registry.register(token);
    }
    return registry;
}

/**
 * Describe a freshly created dAED mint (local validator or devnet) as a
 * registry entry.
 */
export function describeDaedMint(mint: Address | string, cluster: SolanaCluster): AedTokenInfo {
    return {
        mint: address(mint.toString()),
        symbol: 'dAED',
        name: 'Devnet AED (reference)',
        decimals: 2,
        cluster,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        issuer: 'Fils project (unbacked reference token)',
        regulatoryStatus: 'reference',
        website: 'https://github.com/plutohan/fils',
    };
}

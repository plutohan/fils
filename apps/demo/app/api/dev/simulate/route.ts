import { NextResponse } from 'next/server';
import { lamports, address } from '@solana/kit';
import { mintDaedTo, payAedRequest } from '@fils/daed';
import { loadDaedMintState, loadOrCreateSigner } from '@fils/daed/node';

import { getServerState } from '@/lib/server/state';

/**
 * Dev-only stand-in for a customer wallet: funds a persisted demo-buyer
 * wallet (SOL airdrop + dAED faucet) and pays the order's payment request,
 * exactly as a Solana Pay wallet would — transfer tagged with the reference.
 * Refuses to exist on mainnet.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const state = await getServerState();
    if (state.cluster === 'mainnet-beta') {
        return NextResponse.json({ error: 'not-on-mainnet' }, { status: 403 });
    }
    const { reference } = (await request.json()) as { reference?: string };
    const order = reference !== undefined ? state.orders.get(reference) : undefined;
    if (!order) {
        return NextResponse.json({ error: 'unknown-reference' }, { status: 404 });
    }
    const daedState = await loadDaedMintState();
    if (!daedState) {
        return NextResponse.json({ error: 'no-daed-mint' }, { status: 503 });
    }

    const buyer = await loadOrCreateSigner('demo-buyer');
    const issuer = await loadOrCreateSigner('issuer');

    // Fee lamports for the buyer (airdrop only exists off-mainnet).
    const { value: balance } = await state.rpc.getBalance(buyer.address).send();
    if (balance < 50_000_000n) {
        await state.rpc.requestAirdrop(buyer.address, lamports(1_000_000_000n), { commitment: 'confirmed' }).send();
        await waitFor(async () => (await state.rpc.getBalance(buyer.address).send()).value > balance);
    }

    // Faucet the exact amount, then pay the request like a wallet would.
    await mintDaedTo(state.rpc, issuer, address(daedState.mint), buyer.address, order.request.amountFils);
    const signature = await payAedRequest(state.rpc, buyer, order.request);
    return NextResponse.json({ signature });
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('timed out waiting for balance change');
}

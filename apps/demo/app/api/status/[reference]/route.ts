import { NextResponse } from 'next/server';
import { buildReceipt, explorerTxUrl, findPayment } from '@fils/core';

import { getServerState } from '@/lib/server/state';

export async function GET(
    _request: Request,
    context: { params: Promise<{ reference: string }> },
): Promise<NextResponse> {
    const { reference } = await context.params;
    const state = await getServerState();
    const order = state.orders.get(reference);
    if (!order) {
        return NextResponse.json({ error: 'unknown-reference' }, { status: 404 });
    }

    const verification = await findPayment({ rpc: state.rpc, request: order.request });
    if (verification.status !== 'confirmed') {
        return NextResponse.json({ status: verification.status });
    }

    const receipt = buildReceipt({
        receiptNumber: order.orderNumber,
        issuedAt: new Date(),
        seller: { name: 'Fils Café (demo)', trn: '100000000000003' },
        lines: order.lines,
        payment: {
            cluster: state.cluster,
            mint: order.request.token.mint,
            recipient: order.request.recipient,
            reference: order.request.reference,
            signature: verification.signature,
            slot: verification.slot,
            blockTime: verification.blockTime,
        },
    });
    return NextResponse.json({
        status: 'confirmed',
        receipt,
        explorerUrl: explorerTxUrl(verification.signature, state.cluster, state.rpcUrl),
    });
}

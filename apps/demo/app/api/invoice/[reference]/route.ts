import { NextResponse } from 'next/server';
import { buildReceipt, findPayment } from '@fils/core';
import { receiptToPintAeXml } from '@fils/einvoice';

import { getServerState } from '@/lib/server/state';

/** PINT AE e-invoice XML for a confirmed order — what a merchant's ASP would ingest. */
export async function GET(
    _request: Request,
    context: { params: Promise<{ reference: string }> },
): Promise<Response> {
    const { reference } = await context.params;
    const state = await getServerState();
    const order = state.orders.get(reference);
    if (!order) {
        return NextResponse.json({ error: 'unknown-reference' }, { status: 404 });
    }
    const verification = await findPayment({ rpc: state.rpc, request: order.request });
    if (verification.status !== 'confirmed') {
        return NextResponse.json({ error: 'not-paid', status: verification.status }, { status: 409 });
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
    const xml = receiptToPintAeXml({
        receipt,
        supplier: {
            name: 'Fils Café (demo)',
            trn: '100000000000003',
            address: { streetName: 'Al Wasl Road', cityName: 'Dubai', emirate: 'Dubai' },
        },
        note: 'Demo invoice — validate PINT AE field completeness with your ASP.',
    });
    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="${order.orderNumber}.xml"`,
        },
    });
}

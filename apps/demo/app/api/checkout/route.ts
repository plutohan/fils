import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createPaymentRequest } from '@fils/core';

import { menuItem } from '@/lib/menu';
import { getServerState } from '@/lib/server/state';

interface CheckoutBody {
    items: { id: string; quantity: number }[];
}

export async function POST(request: Request): Promise<NextResponse> {
    const state = await getServerState();
    if (state.token === undefined) {
        return NextResponse.json(
            { error: 'no-daed-mint', hint: 'pnpm --filter @fils/scripts daed:create' },
            { status: 503 },
        );
    }

    const body = (await request.json()) as CheckoutBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
        return NextResponse.json({ error: 'empty-order' }, { status: 400 });
    }

    // Prices come from the server-side menu — client amounts are never trusted.
    const lines: { description: string; quantity: number; unitFils: bigint }[] = [];
    for (const { id, quantity } of body.items) {
        const item = menuItem(id);
        if (!item || !Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
            return NextResponse.json({ error: 'invalid-item', id }, { status: 400 });
        }
        lines.push({ description: item.nameEn, quantity, unitFils: item.unitFils });
    }
    const amountFils = lines.reduce((total, line) => total + line.unitFils * BigInt(line.quantity), 0n);

    const orderNumber = `FILS-${String(state.nextOrderNumber++).padStart(4, '0')}`;
    const paymentRequest = createPaymentRequest({
        recipient: state.merchant.address,
        amountFils,
        token: state.token,
        label: 'Fils Café',
        message: `Order ${orderNumber}`,
        memo: orderNumber,
    });
    state.orders.set(paymentRequest.reference, {
        orderNumber,
        request: paymentRequest,
        lines,
        createdAt: new Date(),
    });

    const qrDataUrl = await QRCode.toDataURL(paymentRequest.url, { width: 320, margin: 2 });
    return NextResponse.json({
        reference: paymentRequest.reference,
        url: paymentRequest.url,
        qrDataUrl,
        amountFils: amountFils.toString(),
        orderNumber,
        cluster: state.cluster,
    });
}

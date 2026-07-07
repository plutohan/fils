'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatAed, type FilsReceipt } from '@fils/core';

import { t, type Locale } from '@/lib/i18n';
import { MENU } from '@/lib/menu';

interface CheckoutResponse {
    reference: string;
    url: string;
    qrDataUrl: string;
    amountFils: string;
    orderNumber: string;
    error?: string;
    hint?: string;
}

interface StatusResponse {
    status: 'confirmed' | 'not-found' | 'amount-mismatch';
    receipt?: FilsReceipt;
    explorerUrl?: string;
}

type Phase = { kind: 'menu' } | { kind: 'paying'; checkout: CheckoutResponse } | { kind: 'paid'; status: StatusResponse };

export default function CafePage() {
    const [locale, setLocale] = useState<Locale>('en');
    const [cart, setCart] = useState<Record<string, number>>({});
    const [phase, setPhase] = useState<Phase>({ kind: 'menu' });
    const [error, setError] = useState<{ message: string; hint?: string } | undefined>();
    const [simulating, setSimulating] = useState(false);

    const totalFils = useMemo(
        () =>
            Object.entries(cart).reduce((total, [id, quantity]) => {
                const item = MENU.find(entry => entry.id === id);
                return item ? total + item.unitFils * BigInt(quantity) : total;
            }, 0n),
        [cart],
    );

    const addToCart = (id: string) => setCart(current => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    const adjust = (id: string, delta: number) =>
        setCart(current => {
            const next = { ...current };
            const quantity = (next[id] ?? 0) + delta;
            if (quantity <= 0) delete next[id];
            else next[id] = quantity;
            return next;
        });

    const checkout = useCallback(async () => {
        setError(undefined);
        const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items }),
        });
        const data = (await response.json()) as CheckoutResponse;
        if (!response.ok) {
            setError({ message: data.error ?? 'checkout failed', ...(data.hint ? { hint: data.hint } : {}) });
            return;
        }
        setPhase({ kind: 'paying', checkout: data });
    }, [cart]);

    // Poll the payment status while a QR is on screen.
    useEffect(() => {
        if (phase.kind !== 'paying') return;
        const reference = phase.checkout.reference;
        const timer = setInterval(() => {
            void (async () => {
                const response = await fetch(`/api/status/${reference}`);
                if (!response.ok) return;
                const data = (await response.json()) as StatusResponse;
                if (data.status === 'confirmed') {
                    setPhase({ kind: 'paid', status: data });
                    setCart({});
                }
            })();
        }, 2000);
        return () => clearInterval(timer);
    }, [phase]);

    const simulatePayment = useCallback(async () => {
        if (phase.kind !== 'paying') return;
        setSimulating(true);
        setError(undefined);
        try {
            const response = await fetch('/api/dev/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: phase.checkout.reference }),
            });
            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                setError({ message: data.error ?? 'simulation failed' });
            }
        } finally {
            setSimulating(false);
        }
    }, [phase]);

    const dir = locale === 'ar' ? 'rtl' : 'ltr';

    return (
        <div className="shell" dir={dir} lang={locale}>
            <header className="masthead">
                <div>
                    <h1>☕ {t('title', locale)}</h1>
                    <p className="tagline">{t('tagline', locale)}</p>
                </div>
                <button className="lang-toggle" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}>
                    {locale === 'en' ? 'العربية' : 'English'}
                </button>
            </header>

            <div className="layout">
                <section>
                    <h2 className="section-title">{t('menu', locale)}</h2>
                    <div className="menu-grid">
                        {MENU.map(item => (
                            <article className="menu-card" key={item.id}>
                                <span className="emoji" aria-hidden>
                                    {item.emoji}
                                </span>
                                <span className="name">{locale === 'ar' ? item.nameAr : item.nameEn}</span>
                                <span className="price">{formatAed(item.unitFils, locale)}</span>
                                <button onClick={() => addToCart(item.id)}>{t('add', locale)}</button>
                            </article>
                        ))}
                    </div>
                </section>

                <aside className="panel">
                    {phase.kind === 'menu' && (
                        <>
                            <h2 className="section-title">{t('order', locale)}</h2>
                            {totalFils === 0n ? (
                                <p className="muted">{t('emptyCart', locale)}</p>
                            ) : (
                                Object.entries(cart).map(([id, quantity]) => {
                                    const item = MENU.find(entry => entry.id === id);
                                    if (!item) return null;
                                    return (
                                        <div className="cart-line" key={id}>
                                            <span>{locale === 'ar' ? item.nameAr : item.nameEn}</span>
                                            <span className="qty-controls">
                                                <button onClick={() => adjust(id, -1)}>−</button>
                                                {quantity}
                                                <button onClick={() => adjust(id, 1)}>+</button>
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                            <div className="total-row">
                                <span>
                                    {t('total', locale)} <span className="vat-note">{t('vatIncluded', locale)}</span>
                                </span>
                                <span>{formatAed(totalFils, locale)}</span>
                            </div>
                            <button className="pay-button" disabled={totalFils === 0n} onClick={() => void checkout()}>
                                {t('pay', locale)}
                            </button>
                        </>
                    )}

                    {phase.kind === 'paying' && (
                        <div className="qr-panel">
                            <h2 className="section-title">
                                {phase.checkout.orderNumber} · {formatAed(BigInt(phase.checkout.amountFils), locale)}
                            </h2>
                            {/* Self-generated QR data URL — no external assets. */}
                            <img src={phase.checkout.qrDataUrl} alt={t('scan', locale)} />
                            <p className="muted">{t('scan', locale)}</p>
                            <div className="spinner-row">
                                <span className="spinner" aria-hidden />
                                {t('waiting', locale)}
                            </div>
                            <button className="ghost-button" disabled={simulating} onClick={() => void simulatePayment()}>
                                {simulating ? t('simulating', locale) : t('simulate', locale)}
                            </button>
                            <button className="link-button" onClick={() => setPhase({ kind: 'menu' })}>
                                {t('cancel', locale)}
                            </button>
                        </div>
                    )}

                    {phase.kind === 'paid' && phase.status.receipt && (
                        <div>
                            <div className="paid-banner">✓ {t('paid', locale)}</div>
                            <div className="receipt">
                                <div className="receipt-head">
                                    <span>
                                        {t('receiptNo', locale)} {phase.status.receipt.receiptNumber}
                                    </span>
                                    <span>{new Date(phase.status.receipt.issuedAt).toLocaleString(locale)}</span>
                                </div>
                                <div className="receipt-head">
                                    <span>
                                        {t('seller', locale)}: {phase.status.receipt.seller.name}
                                    </span>
                                    {phase.status.receipt.seller.trn && (
                                        <span>
                                            {t('trn', locale)}: {phase.status.receipt.seller.trn}
                                        </span>
                                    )}
                                </div>
                                {phase.status.receipt.lines.map(line => (
                                    <div className="cart-line" key={line.description}>
                                        <span>
                                            {line.quantity} × {line.description}
                                        </span>
                                        <span>{formatAed(BigInt(line.totalFils), locale)}</span>
                                    </div>
                                ))}
                                <div className="totals">
                                    <div>
                                        <span className="muted">{t('net', locale)}</span>
                                        <span>{formatAed(BigInt(phase.status.receipt.totals.netFils), locale)}</span>
                                    </div>
                                    <div>
                                        <span className="muted">{t('vat', locale)}</span>
                                        <span>{formatAed(BigInt(phase.status.receipt.totals.vatFils), locale)}</span>
                                    </div>
                                    <div className="grand">
                                        <span>{t('total', locale)}</span>
                                        <span>{formatAed(BigInt(phase.status.receipt.totals.grossFils), locale)}</span>
                                    </div>
                                </div>
                            </div>
                            {phase.status.explorerUrl && (
                                <a
                                    className="explorer-link"
                                    href={phase.status.explorerUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {t('viewOnExplorer', locale)} ↗
                                </a>
                            )}
                            <button className="pay-button" onClick={() => setPhase({ kind: 'menu' })}>
                                {t('newOrder', locale)}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="error-box">
                            {t('error', locale)}: {error.message}
                            {error.hint && <code>{error.hint}</code>}
                        </div>
                    )}
                </aside>
            </div>

            <p className="footnote">
                dAED is an unbacked devnet reference token — not a real dirham. Built with @fils/core · Solana Pay ·
                Token-2022.
            </p>
        </div>
    );
}

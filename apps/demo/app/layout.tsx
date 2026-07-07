import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
    title: 'Fils Café — AED payments on Solana',
    description: 'Merchant checkout demo: dirham-denominated Solana Pay with the dAED reference token',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

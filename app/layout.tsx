import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HL Candles',
  description: 'Hyperliquid candles & charts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app">{children}</body>
    </html>
  );
}

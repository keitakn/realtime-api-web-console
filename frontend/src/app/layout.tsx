import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/_components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'realtime-api-web-console',
  description: 'AIとのリアルタイムなやり取りを行う為の実験用サービス',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

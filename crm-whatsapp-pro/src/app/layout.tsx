import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CRM - Sistema de Gestão',
  description: 'CRM WhatsApp SaaS - Sistema de Gestão Profissional',
  icons: { icon: '/V.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

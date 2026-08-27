import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

export const metadata: Metadata = { title: 'VedaAI — Question & Answer Mapping', description: 'Upload question papers and answer sheets, then review AI-mapped answers.' };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className={bricolage.variable}>{children}</body></html>}

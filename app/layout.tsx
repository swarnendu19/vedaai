import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'VedaAI — Question & Answer Mapping', description: 'Upload question papers and answer sheets, then review AI-mapped answers.' };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}

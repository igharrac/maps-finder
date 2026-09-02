import type { Metadata } from 'next';
import { Schibsted_Grotesk, Instrument_Serif } from 'next/font/google';
import './globals.css';

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-schibsted',
  display: 'swap',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Maps Finder',
  description: 'Lokale bedrijven vinden, beoordelen en benaderen.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${schibsted.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}

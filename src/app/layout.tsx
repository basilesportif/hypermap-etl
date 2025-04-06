import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HyperMap ETL',
  description: 'Read events from Base blockchain and store in MongoDB',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-gray-800 text-white p-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="font-bold text-xl">HyperMap ETL</div>
            <div className="space-x-4">
              <Link href="/" className="hover:text-gray-300">Home</Link>
              <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
              <Link href="/explorer" className="hover:text-gray-300">Explorer</Link>
            </div>
          </div>
        </nav>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}

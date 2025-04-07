import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
// Removed Link import as it's no longer used
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HyperMap ETL',
  description: 'Read events from Base blockchain and store in MongoDB',
};

/**
 * @component RootLayout
 * @description The root layout component for the Next.js application.
 * Sets up the basic HTML structure, includes global styles, and applies the Inter font.
 * The navigation bar has been removed to simplify the UI.
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to be rendered within the layout.
 * @returns {JSX.Element} The root layout structure.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Navigation bar removed as per user request for UI cleanup */}
        <main>
          {/* The main content of the application pages will be rendered here */}
          {children}
        </main>
      </body>
    </html>
  );
}
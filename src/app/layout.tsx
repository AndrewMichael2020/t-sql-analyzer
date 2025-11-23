import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SQL → Mermaid Flowchart',
  description: 'Visualize T-SQL queries as Mermaid diagrams',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

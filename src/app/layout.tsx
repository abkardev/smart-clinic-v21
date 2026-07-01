import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartClinic — Intelligent Clinic Management',
  description: 'Smart clinic booking and management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=Cairo:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}

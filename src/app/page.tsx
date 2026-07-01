'use client';
export const dynamic = 'force-dynamic';

import dynamic_import from 'next/dynamic';

// Disable SSR for the full SPA (uses localStorage, browser APIs, React context)
const App = dynamic_import(() => import('@/components/App'), { ssr: false });

export default function RootPage() {
  return <App />;
}

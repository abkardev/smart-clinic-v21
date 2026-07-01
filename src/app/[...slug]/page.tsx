'use client';
export const dynamic = 'force-dynamic';

import dynamic_import from 'next/dynamic';

const App = dynamic_import(() => import('@/components/App'), { ssr: false });

export default function CatchAllPage() {
  return <App />;
}

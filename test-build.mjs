// Simulate Next.js "Collecting page data" by importing route modules
const routes = [
  './src/app/api/instagram/webhook/route.ts',
  './src/app/api/whatsapp/webhook/route.ts',
  './src/app/api/whatsapp/reminder/[id]/route.ts',
  './src/app/api/google/webhook/route.ts',
  './src/app/api/health/route.ts',
  './src/app/api/bookings/route.ts',
  './src/app/api/auth/login/route.ts',
];

async function main() {
  for (const route of routes) {
    try {
      const mod = await import(route);
      const keys = Object.keys(mod).filter(k => !k.startsWith('_'));
      console.log(`✓ ${route.split('/').pop()}: ${keys.join(', ')}`);
    } catch (e) {
      console.error(`✗ ${route}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log('\nAll routes loaded successfully — no env var evaluation at module scope.');
}

main();

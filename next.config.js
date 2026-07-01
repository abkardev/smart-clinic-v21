/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Force all pages to be dynamic (no static prerender) ───────────────────
  // This is a SPA — all pages require auth context, no static content.
  output: undefined,

  // ── Compiler ──────────────────────────────────────────────────────────────
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // ── Headers ───────────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-XSS-Protection',       value: '1; mode=block' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // ── Webpack ───────────────────────────────────────────────────────────────
  webpack(config, { isServer }) {
    config.ignoreWarnings = [{ module: /node_modules\/googleapis/ }];

    if (!isServer) {
      config.output = {
        ...config.output,
        chunkLoadTimeout: 300_000,
      };

      config.optimization.splitChunks = {
        chunks: 'all',
        maxInitialRequests: 30,
        maxAsyncRequests: 30,
        minSize: 20_000,
        cacheGroups: {
          muiIcons: {
            test: /[\\/]node_modules[\\/]@mui[\\/]icons-material[\\/]/,
            name: 'vendor-mui-icons',
            chunks: 'all',
            priority: 60,
            enforce: true,
          },
          mui: {
            test: /[\\/]node_modules[\\/]@mui[\\/](?!icons-material)/,
            name: 'vendor-mui',
            chunks: 'all',
            priority: 50,
            enforce: true,
          },
          fullcalendar: {
            test: /[\\/]node_modules[\\/]@fullcalendar[\\/]/,
            name: 'vendor-fullcalendar',
            chunks: 'all',
            priority: 50,
            enforce: true,
          },
          recharts: {
            test: /[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|robust-predicates)[\\/]/,
            name: 'vendor-recharts',
            chunks: 'all',
            priority: 50,
            enforce: true,
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            name: 'vendor-react',
            chunks: 'all',
            priority: 40,
            enforce: true,
          },
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              const pkg = module.context?.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)?.[1] ?? 'misc';
              return `vendor-${pkg.replace('@', '').replace('/', '-')}`;
            },
            chunks: 'all',
            priority: 10,
            minChunks: 2,
          },
        },
      };
    }

    return config;
  },
};

module.exports = nextConfig;

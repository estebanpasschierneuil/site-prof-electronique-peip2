import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  // PGlite embarque du WASM : on le laisse hors du bundle serveur.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Les migrations SQL sont lues au démarrage : elles doivent suivre le serveur autonome.
  outputFileTracingIncludes: { '/*': ['./drizzle/**/*'] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Treat Prisma + pino as external on the server (don't bundle them).
  // The Next.js client compiler will then refuse to import them, which is
  // exactly what we want — they're server-only modules.
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'pino'],
  // Allow Next to transpile the workspace shared package.
  transpilePackages: ['@flight-hunter/shared'],
};

export default nextConfig;

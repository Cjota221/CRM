/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone para Docker (inclui node_modules necessários)
  output: 'standalone',

  // Permitir imagens de qualquer domínio
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['@whiskeysockets/baileys'],
  },
};

module.exports = nextConfig;

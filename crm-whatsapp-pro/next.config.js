/** @type {import('next').NextConfig} */
const nextConfig = {
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

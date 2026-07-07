import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // All assets are self-hosted; no external origins at runtime.
    reactStrictMode: true,
};

export default nextConfig;

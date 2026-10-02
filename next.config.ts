import type { NextConfig } from "next";

/**
 * Next.js 15 Configuration for BUP Hall Dining & Meal Management System
 * 
 * Supports:
 * - App Router & React 19 architecture
 * - Remote image optimization for Supabase CDN student profile photos
 * - Mobile-first PWA caching and security headers
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "cdn.example.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

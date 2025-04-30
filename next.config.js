/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Configure for Cloudflare Workers
  output: "export", // Static HTML export
  distDir: "dist", // Output to the dist directory instead of .next
  images: {
    unoptimized: true, // Cloudflare Workers doesn't support Next.js Image Optimization
  },
};

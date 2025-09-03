/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    domains: []
  },
  // Disable automatic font optimization to avoid cssnano invoking caniuse-lite
  optimizeFonts: false,
};

// Removing autoprefixer completely to avoid caniuse-lite errors on Render
module.exports = {
  plugins: {
    // Only use tailwindcss, no autoprefixer
    tailwindcss: {},
  },
};

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      // Specify browser support directly to avoid using caniuse-lite features database
      // which may have compatibility issues on Render
      overrideBrowserslist: [
        'last 2 Chrome versions',
        'last 2 Firefox versions',
        'last 2 Safari versions',
        'last 2 Edge versions',
        'not dead',
      ],
      // Disable features that might cause issues
      ignoreUnknownVersions: true,
    },
  },
};

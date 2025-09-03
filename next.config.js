/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    domains: []
  },
  // Disable CSS features that are causing caniuse-lite issues
  webpack: (config) => {
    // Find the CSS rule
    const cssRule = config.module.rules.find(
      (rule) => rule.oneOf && Array.isArray(rule.oneOf)
    );

    if (cssRule) {
      // Add CSS modules options to disable problematic features
      cssRule.oneOf.forEach((rule) => {
        if (rule.use && Array.isArray(rule.use)) {
          rule.use.forEach((loader) => {
            if (loader.loader && loader.loader.includes('postcss-loader')) {
              if (!loader.options) {
                loader.options = {};
              }
              if (!loader.options.postcssOptions) {
                loader.options.postcssOptions = {};
              }
              if (!loader.options.postcssOptions.config) {
                loader.options.postcssOptions.config = false;
              }
              if (!loader.options.postcssOptions.plugins) {
                loader.options.postcssOptions.plugins = [];
              }
              
              // Use minimal autoprefixer config to avoid caniuse-lite issues
              loader.options.postcssOptions.plugins = [
                'tailwindcss',
                ['autoprefixer', {
                  overrideBrowserslist: ['> 1%', 'not dead'],
                  ignoreUnknownVersions: true,
                  flexbox: 'no-2009',
                  remove: false,
                  // Disable problematic features
                  features: {
                    'cross-document-view-transitions': false
                  }
                }]
              ];
            }
          });
        }
      });
    }

    return config;
  },
};

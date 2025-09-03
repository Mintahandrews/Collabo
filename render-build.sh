#!/bin/bash
set -euo pipefail

# Script for building the application on Render with CSS workarounds
echo "Starting Render-specific build script"

# Clean any previous builds
echo "Cleaning previous builds..."
rm -rf build
rm -rf .next

# Install dependencies
echo "Installing dependencies..."
npm ci

# Run the centralized patch script (stubs any missing caniuse-lite features)
echo "Running caniuse-lite patch script..."
node render-patch.js

# Build the server
echo "Building server..."
npm run build:server

# Build Next.js with CSS processing disabled
echo "Building Next.js application..."
NODE_OPTIONS="--no-warnings" DISABLE_ESLINT_PLUGIN=true BROWSERSLIST_IGNORE_OLD_DATA=true npx next build

echo "Build completed!"

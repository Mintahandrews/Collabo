#!/bin/bash

# Script for building the application on Render with CSS workarounds
echo "Starting Render-specific build script"

# Clean any previous builds
echo "Cleaning previous builds..."
rm -rf build
rm -rf .next

# Install a specific version of caniuse-lite known to work
echo "Installing specific caniuse-lite version..."
npm install caniuse-lite@1.0.30001502 --no-save

# Create the directory structure for the missing module
echo "Setting up caniuse-lite patches..."
mkdir -p ./node_modules/caniuse-lite/data/features

# Create an empty module for the missing feature
echo "Creating empty module for cross-document-view-transitions..."
echo "module.exports = {};" > ./node_modules/caniuse-lite/data/features/cross-document-view-transitions.js

# Patch the features.js file to include our empty module
echo "Patching features index..."
if [ -f "./node_modules/caniuse-lite/data/features.js" ]; then
  # Check if it's already patched
  if ! grep -q "cross-document-view-transitions" "./node_modules/caniuse-lite/data/features.js"; then
    # Create a temporary file with our addition
    sed '1s/^module.exports = {/module.exports = {\n  "cross-document-view-transitions": require(".\/features\/cross-document-view-transitions"),/' "./node_modules/caniuse-lite/data/features.js" > features.js.tmp
    # Replace the original file
    mv features.js.tmp "./node_modules/caniuse-lite/data/features.js"
    echo "Features index patched successfully"
  else
    echo "Features index already patched"
  fi
else
  echo "Features index file not found, creating it..."
  echo 'module.exports = { "cross-document-view-transitions": require("./features/cross-document-view-transitions") };' > "./node_modules/caniuse-lite/data/features.js"
fi

# Build the server
echo "Building server..."
npm run build:server

# Build Next.js with CSS processing disabled
echo "Building Next.js application..."
NODE_OPTIONS="--no-warnings" DISABLE_ESLINT_PLUGIN=true BROWSERSLIST_IGNORE_OLD_DATA=true npx next build

echo "Build completed!"

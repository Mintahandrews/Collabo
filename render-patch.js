// Script to patch caniuse-lite missing module issue on Render
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting caniuse-lite patching process...');

// Create an empty module for cross-document-view-transitions
function createEmptyFeatureFile() {
  try {
    const featureDir = path.resolve('./node_modules/caniuse-lite/data/features');
    const targetFile = path.join(featureDir, 'cross-document-view-transitions.js');
    
    if (!fs.existsSync(featureDir)) {
      console.log('Creating features directory...');
      fs.mkdirSync(featureDir, { recursive: true });
    }
    
    fs.writeFileSync(targetFile, 'module.exports={};\n', 'utf8');
    console.log(`Created empty module at ${targetFile}`);
    return true;
  } catch (err) {
    console.error('Error creating empty feature file:', err);
    return false;
  }
}

// Create an empty module for css-if
function createEmptyFeatureFileCssIf() {
  try {
    const featureDir = path.resolve('./node_modules/caniuse-lite/data/features');
    const targetFile = path.join(featureDir, 'css-if.js');

    if (!fs.existsSync(featureDir)) {
      console.log('Creating features directory...');
      fs.mkdirSync(featureDir, { recursive: true });
    }

    fs.writeFileSync(targetFile, 'module.exports={};\n', 'utf8');
    console.log(`Created empty module at ${targetFile}`);
    return true;
  } catch (err) {
    console.error('Error creating empty feature file (css-if):', err);
    return false;
  }
}

// Update features.js to include the reference
function updateFeaturesIndex() {
  try {
    const featuresPath = path.resolve('./node_modules/caniuse-lite/data/features.js');
    
    if (fs.existsSync(featuresPath)) {
      console.log('Updating features index...');
      
      let content = fs.readFileSync(featuresPath, 'utf8');
      const needsCross = !content.includes('"cross-document-view-transitions"');
      const needsCssIf = !content.includes('"css-if"');

      if (!needsCross && !needsCssIf) {
        console.log('Features index already contains required stubs - no need to patch');
        return true;
      }

      // Build insertion lines only for missing features
      const lines = [];
      if (needsCross) {
        lines.push('"cross-document-view-transitions": require("./features/cross-document-view-transitions"),');
      }
      if (needsCssIf) {
        lines.push('"css-if": require("./features/css-if"),');
      }

      const insertionLines = lines.join('\n  ');
      // Insert after the opening of module.exports = {, be tolerant to whitespace
      const regex = /module\.exports\s*=\s*\{/;
      if (regex.test(content)) {
        content = content.replace(regex, (match) => match + '\n  ' + insertionLines + '\n  ');
      } else {
        console.warn('Unexpected features.js format; could not find module.exports = { pattern. Skipping index patch.');
        return true; // Do not fail the patch; stubs still created as files
      }
      
      fs.writeFileSync(featuresPath, content, 'utf8');
      console.log('Successfully patched features index');
      return true;
    } else {
      console.error('Could not find caniuse-lite features.js at', featuresPath);
      return false;
    }
  } catch (error) {
    console.error('Error updating features index:', error);
    return false;
  }
}

// Apply both patches
let success = createEmptyFeatureFile() && createEmptyFeatureFileCssIf() && updateFeaturesIndex();

// If patching was successful, clear the Next.js cache
if (success) {
  try {
    console.log('Clearing Next.js cache...');
    // Remove .next directory if it exists
    const nextCacheDir = path.resolve('./.next');
    if (fs.existsSync(nextCacheDir)) {
      execSync('rm -rf .next');
      console.log('Cleared Next.js cache');
    } else {
      console.log('.next directory not found, no need to clear cache');
    }
  } catch (err) {
    console.error('Error clearing Next.js cache:', err);
  }
  
  console.log('Patching completed successfully!');
  process.exit(0);
} else {
  console.error('Patching failed!');
  process.exit(1);
}

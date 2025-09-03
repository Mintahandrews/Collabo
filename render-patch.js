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

// Update features.js to include the reference
function updateFeaturesIndex() {
  try {
    const featuresPath = path.resolve('./node_modules/caniuse-lite/data/features.js');
    
    if (fs.existsSync(featuresPath)) {
      console.log('Updating features index...');
      
      let content = fs.readFileSync(featuresPath, 'utf8');
      
      if (content.includes('cross-document-view-transitions')) {
        console.log('Features index already contains the feature - no need to patch');
        return true;
      }
      
      // Add the missing feature to the exports
      content = content.replace(
        'module.exports = {', 
        'module.exports = {\n  "cross-document-view-transitions": require("./features/cross-document-view-transitions"),\n  '
      );
      
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
let success = createEmptyFeatureFile() && updateFeaturesIndex();

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

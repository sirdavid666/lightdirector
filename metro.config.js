const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Prefer browser entry points over Node's "main"
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

const mqttDir = path.join(__dirname, 'node_modules', 'mqtt');
const distDir = path.join(mqttDir, 'dist');

// Try multiple candidates — whichever exists wins
const candidates = [
  'dist/mqtt.esm.js',
  'dist/mqtt.esm.min.js',
  'dist/mqtt.js',
  'dist/mqtt.min.js',
];
let mqttBrowserBundle = null;
for (const c of candidates) {
  const p = path.join(mqttDir, c);
  if (fs.existsSync(p)) { mqttBrowserBundle = p; break; }
}

// Print the truth so we never guess again
console.log('[MQTT-FIX] mqtt dir:', fs.existsSync(mqttDir) ? fs.readdirSync(mqttDir).join(', ') : 'MISSING');
console.log('[MQTT-FIX] dist dir:', fs.existsSync(distDir) ? fs.readdirSync(distDir).join(', ') : 'MISSING');
console.log('[MQTT-FIX] using bundle:', mqttBrowserBundle || 'NONE');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'mqtt' && mqttBrowserBundle) {
    return { type: 'sourceFile', filePath: mqttBrowserBundle };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

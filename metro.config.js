const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro to use mqtt's pre-bundled BROWSER build (WebSocket-based,
// no Node core modules like url/net/tls). The default Node build cannot
// bundle inside a React Native app.
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  mqtt: 'mqtt/dist/mqtt.js',
};

module.exports = config;

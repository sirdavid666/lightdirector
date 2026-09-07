const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.cacheStores = ({ FileStore }) => [
  new FileStore({
    root: '.metro-cache',
  }),
];

config.cacheVersion = '2';

const mqttBrowserBundle = require.resolve('mqtt/dist/mqtt.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'mqtt') {
    return {
      type: 'sourceFile',
      filePath: mqttBrowserBundle,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

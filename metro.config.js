const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const defaultBlockList = defaultConfig.resolver?.blockList;

const blockList = Array.isArray(defaultBlockList)
  ? defaultBlockList
  : defaultBlockList
  ? [defaultBlockList]
  : [];

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [
      /[/\\]android[/\\]\.cxx[/\\]/,
      /[/\\]android[/\\]build[/\\]/,
      ...blockList,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '\\.(gguf|bin|onnx)$': '<rootDir>/__mocks__/fileMock.js',
    '^@op-engineering/op-sqlite$': '<rootDir>/__mocks__/opSqliteMock.js',
  },
};

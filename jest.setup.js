jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  isErrorWithCode: jest.fn((err) => err && typeof err === 'object' && 'code' in err),
  errorCodes: {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
    NULL_PRESENTER: 'NULL_PRESENTER',
  },
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(true)),
  TemporaryDirectoryPath: '/temp',
  DocumentDirectoryPath: '/documents',
}));

jest.mock('react-native-share', () => ({
  default: {
    open: jest.fn(() => Promise.resolve()),
  },
}));

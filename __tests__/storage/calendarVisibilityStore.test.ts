import { calendarVisibilityStore } from '../../src/storage/calendarVisibilityStore';
import RNFS from 'react-native-fs';

describe('calendarVisibilityStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return default { main: true } if file does not exist', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);

    const map = await calendarVisibilityStore.getVisibilityMap();
    expect(map).toEqual({ main: true });
    expect(RNFS.exists).toHaveBeenCalled();
  });

  test('should load visibility map from file if it exists', async () => {
    const mockMap = { main: false, batch_123: true };
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockMap));

    const map = await calendarVisibilityStore.getVisibilityMap();
    expect(map).toEqual(mockMap);
  });

  test('should save changes back to file system', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false); // defaults to { main: true }
    (RNFS.writeFile as jest.Mock).mockResolvedValueOnce(undefined);

    await calendarVisibilityStore.setVisibility('batch_abc', false);

    expect(RNFS.writeFile).toHaveBeenCalled();
    const writeArgs = (RNFS.writeFile as jest.Mock).mock.calls[0];
    const parsedWritten = JSON.parse(writeArgs[1]);

    expect(parsedWritten.main).toBe(true);
    expect(parsedWritten.batch_abc).toBe(false);
  });
});

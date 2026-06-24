import { importedBatchesStore } from '../../src/storage/importedBatchesStore';
import RNFS from 'react-native-fs';

describe('importedBatchesStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return empty array if batches file does not exist', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);

    const batches = await importedBatchesStore.getImportedBatches();
    expect(batches).toEqual([]);
    expect(RNFS.exists).toHaveBeenCalled();
    expect(RNFS.readFile).not.toHaveBeenCalled();
  });

  test('should return parsed batches if file exists', async () => {
    const mockData = [
      {
        id: 'batch_1',
        timestamp: '2026-06-24T12:00:00Z',
        fileName: 'calendar.ics',
        events: ['e1'],
        blocks: ['b1'],
        tasks: ['t1'],
      },
    ];
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockData));

    const batches = await importedBatchesStore.getImportedBatches();
    expect(batches).toEqual(mockData);
    expect(RNFS.exists).toHaveBeenCalled();
    expect(RNFS.readFile).toHaveBeenCalled();
  });

  test('should save a new imported batch successfully', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false); // getImportedBatches returns empty list
    (RNFS.writeFile as jest.Mock).mockResolvedValueOnce(undefined);

    await importedBatchesStore.saveImportedBatch('school.ics', ['ev_1'], ['bl_1'], ['tk_1']);

    expect(RNFS.writeFile).toHaveBeenCalled();
    const writeArgs = (RNFS.writeFile as jest.Mock).mock.calls[0];
    const parsedWritten = JSON.parse(writeArgs[1]);

    expect(parsedWritten).toHaveLength(1);
    expect(parsedWritten[0].fileName).toBe('school.ics');
    expect(parsedWritten[0].events).toEqual(['ev_1']);
    expect(parsedWritten[0].blocks).toEqual(['bl_1']);
    expect(parsedWritten[0].tasks).toEqual(['tk_1']);
  });

  test('should delete an existing batch from tracking record', async () => {
    const mockData = [
      {
        id: 'batch_1',
        timestamp: '2026-06-24T12:00:00Z',
        fileName: 'calendar.ics',
        events: ['e1'],
        blocks: ['b1'],
        tasks: ['t1'],
      },
    ];
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockData));
    (RNFS.writeFile as jest.Mock).mockResolvedValueOnce(undefined);

    const deleted = await importedBatchesStore.deleteImportedBatch('batch_1');

    expect(deleted).toBeDefined();
    expect(deleted!.id).toBe('batch_1');
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      '[]',
      'utf8'
    );
  });

  test('should return null if deleting non-existent batch', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false); // getImportedBatches returns []

    const deleted = await importedBatchesStore.deleteImportedBatch('non_existent');

    expect(deleted).toBeNull();
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });
});

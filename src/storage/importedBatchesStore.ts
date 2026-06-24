import RNFS from 'react-native-fs';

export interface ImportBatch {
  id: string;
  timestamp: string;
  fileName: string;
  events: string[];
  blocks: string[];
  tasks: string[];
}

const BATCHES_FILE_PATH = `${RNFS.DocumentDirectoryPath}/imported_batches.json`;

/**
 * Store to track imported items in batches.
 * Saves data into imported_batches.json in the local app documents folder.
 */
export const importedBatchesStore = {
  /**
   * Retrieves all imported batches.
   * 
   * @returns Array of imported batches, ordered newest first.
   */
  getImportedBatches: async (): Promise<ImportBatch[]> => {
    try {
      const exists = await RNFS.exists(BATCHES_FILE_PATH);
      if (!exists) {
        return [];
      }
      const content = await RNFS.readFile(BATCHES_FILE_PATH, 'utf8');
      return JSON.parse(content) as ImportBatch[];
    } catch (error) {
      console.error('Failed to load imported batches:', error);
      return [];
    }
  },

  /**
   * Saves a new imported batch to history.
   * 
   * @param fileName The name of the file that was imported.
   * @param eventIds List of SQLite IDs of the imported events.
   * @param blockIds List of SQLite IDs of the imported time blocks.
   * @param taskIds List of SQLite IDs of the imported tasks.
   */
  saveImportedBatch: async (
    fileName: string,
    eventIds: string[],
    blockIds: string[],
    taskIds: string[]
  ): Promise<void> => {
    try {
      const batches = await importedBatchesStore.getImportedBatches();
      const newBatch: ImportBatch = {
        id: 'batch_' + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        fileName,
        events: eventIds,
        blocks: blockIds,
        tasks: taskIds,
      };
      batches.unshift(newBatch);
      await RNFS.writeFile(BATCHES_FILE_PATH, JSON.stringify(batches, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save imported batch:', error);
      throw error;
    }
  },

  /**
   * Deletes an imported batch from the tracked history.
   * Note: This does NOT delete the actual items in SQLite; it only removes the tracking record.
   * 
   * @param batchId Unique ID of the batch.
   * @returns The removed batch metadata, or null if not found.
   */
  deleteImportedBatch: async (batchId: string): Promise<ImportBatch | null> => {
    try {
      const batches = await importedBatchesStore.getImportedBatches();
      const index = batches.findIndex((b) => b.id === batchId);
      if (index === -1) {
        return null;
      }
      const [removed] = batches.splice(index, 1);
      await RNFS.writeFile(BATCHES_FILE_PATH, JSON.stringify(batches, null, 2), 'utf8');
      return removed;
    } catch (error) {
      console.error('Failed to delete imported batch:', error);
      throw error;
    }
  },
};

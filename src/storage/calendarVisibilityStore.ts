import RNFS from 'react-native-fs';

const VISIBILITY_FILE_PATH = `${RNFS.DocumentDirectoryPath}/calendar_visibility.json`;

/**
 * Store to persist show/hide settings for calendar layers.
 * Saves a dictionary map of calendar IDs (e.g. 'main', or batch IDs) to booleans.
 */
export const calendarVisibilityStore = {
  /**
   * Retrieves the current visibility map.
   * Defaults to showing all layers if not configured.
   * 
   * @returns Record map of calendar ID to boolean visibility.
   */
  getVisibilityMap: async (): Promise<Record<string, boolean>> => {
    try {
      const exists = await RNFS.exists(VISIBILITY_FILE_PATH);
      if (!exists) {
        return { main: true };
      }
      const content = await RNFS.readFile(VISIBILITY_FILE_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed.main === undefined) {
        parsed.main = true;
      }
      return parsed;
    } catch (error) {
      console.error('Failed to load calendar visibility map:', error);
      return { main: true };
    }
  },

  /**
   * Sets the visibility state of a calendar layer.
   * 
   * @param calendarId The ID of the calendar layer ('main' or import batch ID).
   * @param isVisible Whether it should be visible.
   */
  setVisibility: async (calendarId: string, isVisible: boolean): Promise<void> => {
    try {
      const map = await calendarVisibilityStore.getVisibilityMap();
      map[calendarId] = isVisible;
      await RNFS.writeFile(VISIBILITY_FILE_PATH, JSON.stringify(map, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save calendar visibility:', error);
      throw error;
    }
  },
};

import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';

/**
 * Create a function that generates themed styles.
 * Use this to replace the dual StyleSheet.create + useThemedStyles() pattern.
 *
 * @example
 * // Instead of:
 * const styles = StyleSheet.create({ ... })
 * const themed = useThemedStyles()
 *
 * // Do:
 * const styles = useThemedStyles((colors) => ({
 *   container: { backgroundColor: colors.background },
 *   title: { color: colors.textPrimary },
 * }))
 */
export const useThemedStyles = <T extends Record<string, object>>(
  styleFactory: (colors: ThemeColors, isDarkMode: boolean) => T,
): T => {
  const { colors, isDarkMode } = useTheme();
  return useMemo(() => styleFactory(colors, isDarkMode), [colors, isDarkMode, styleFactory]);
};

/** Re-export for backwards compatibility */
export { useThemedStyles as createThemedStyles };

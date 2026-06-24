/**
 * Centralized category-to-color mapping.
 * All screens should use `getCategoryColor` instead of switch statements.
 */
import { Colors } from './colors';

export type Category = 'work' | 'personal' | 'health' | 'learning';

const CATEGORY_COLOR_MAP: Record<string, string> = {
  work: Colors.blue,
  personal: Colors.yellow,
  health: Colors.success,
  learning: '#9B59B6',
};

const DEFAULT_CATEGORY_COLOR = '#9E9E9E';

/**
 * Get the color associated with a category string.
 * Handles case-insensitive lookup.
 *
 * @param cat - The category name (e.g. 'work', 'Work', 'personal')
 * @returns The hex color string for the category
 */
export const getCategoryColor = (cat?: string): string => {
  if (!cat) return DEFAULT_CATEGORY_COLOR;
  return CATEGORY_COLOR_MAP[cat.toLowerCase()] ?? DEFAULT_CATEGORY_COLOR;
};

/** All known category names, sorted alphabetically */
export const CATEGORIES: Category[] = ['work', 'personal', 'health', 'learning'];

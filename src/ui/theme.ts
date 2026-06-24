/**
 * @deprecated Import from './theme' directory instead:
 *   import { Colors, Fonts, Shadows, Layout } from '../theme';
 *
 * This file re-exports from the split theme directory for backwards compatibility.
 */
export { Colors } from './theme/colors';
export { Fonts, FontSize } from './theme/typography';
export { Spacing } from './theme/spacing';
export { Shadows } from './theme/shadows';
export { Layout } from './theme/layout';
export { getCategoryColor, CATEGORIES } from './theme/categoryColors';
export type { Category } from './theme/categoryColors';

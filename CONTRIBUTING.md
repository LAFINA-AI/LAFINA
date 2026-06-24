# Contributing to LAFINA

## Development Environment Setup

### Prerequisites
- **Node.js** >= 22.11.0
- **React Native CLI** (not Expo)
- **Android Studio** with Android SDK
- **Java JDK 17** (for Android builds)
- A physical Android device or emulator

### Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd LAFINA

# Install dependencies
npm install

# Run on Android
npm run android

# Start Metro bundler (if not auto-started)
npm start
```

## Project Structure

```
src/
  storage/      — SQLite stores, pure data access
  utils/        — Pure utility functions
  ai/           — Voice/NLU pipeline (offline models)
    nlu/        — NLU parser
    tts/        — Text-to-speech
    stt/        — Speech-to-text
  ui/           — React Native screens & components
    screens/    — Full screen components
    components/ — Reusable UI components
    contexts/   — React contexts (ThemeContext)
    theme/      — Colors, typography, spacing, shadows
  constants.ts  — Centralized magic numbers & strings
```

## Branch Naming Convention

Use the format: `prefix/short-description`

| Prefix   | When to Use                        |
|----------|-------------------------------------|
| `feat/`  | New features or screens            |
| `fix/`   | Bug fixes                          |
| `chore/` | Dependencies, config, tooling       |
| `refactor/` | Code restructuring (no behavior change) |
| `docs/`  | Documentation changes              |

Examples:
- `feat/auth-onboarding`
- `fix/calendar-notes`
- `chore/upgrade-rn-086`

## Mandatory Quality Checks

Before marking any task as done, **all three** checks below must pass:

```bash
npm run typecheck  # TypeScript type checking (tsc --noEmit)
npm test           # Jest unit tests
npm run lint       # ESLint
```

Or run them all at once:

```bash
npm run preflight
```

## Development Guidelines

- **Android-only**: Never add iOS platform-specific code.
- **Strict TypeScript**: All source files must be `.ts` or `.tsx`.
- **Offline-first**: All data lives in local SQLite. No cloud backends.
- **On-device AI**: Voice processing uses Whisper.cpp and SmolLM2 locally — no API calls.
- **Dependency flow**: AI/storage must not import from UI. UI must use barrel exports.
- **Theme colors**: Never hardcode hex values — always use `useTheme().colors`.
- **Themed styles**: Use `useThemedStyles()` for theme-dependent styles, `StyleSheet.create` only for static styles.

## Code Review Checklist

- [ ] No hardcoded hex colors (use `colors.xxx` from `useTheme()`)
- [ ] No magic numbers (import from `src/constants.ts`)
- [ ] All new components have proper TypeScript types
- [ ] Import paths are correct for the file's directory depth
- [ ] `npm run preflight` passes cleanly

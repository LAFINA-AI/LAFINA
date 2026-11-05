/** How much each new event moves the profile. Recent weeks outweigh old habits. */
export const EWMA_ALPHA = 0.1;
/** Below this, a "most productive hour" is noise and is not shown. */
export const MIN_HABIT_EVENTS = 5;

export interface ActiveWindow {
  startHour: number;
  /** Exclusive, and may be 24. */
  endHour: number;
  score: number;
}

/** One exponentially weighted moving average step. */
export const updateEwma = (previous: number, value: number, alpha: number = EWMA_ALPHA): number =>
  alpha * value + (1 - alpha) * previous;

/**
 * Builds a 24-hour local-time activity profile from event times, oldest first.
 * Every event pulls its own hour toward 1 and the other hours toward 0.
 */
export const hourlyActivityProfile = (timestampsMs: readonly number[], alpha: number = EWMA_ALPHA): number[] => {
  const profile = new Array<number>(24).fill(0);
  for (const at of timestampsMs) {
    if (!Number.isFinite(at)) continue;
    const hour = new Date(at).getHours();
    for (let index = 0; index < 24; index += 1) {
      profile[index] = updateEwma(profile[index], index === hour ? 1 : 0, alpha);
    }
  }
  return profile;
};

/** The strongest run of `width` hours within one day. Null when the profile is empty. */
export const topActiveWindow = (profile: readonly number[], width = 2): ActiveWindow | null => {
  let best: ActiveWindow | null = null;
  for (let start = 0; start + width <= profile.length; start += 1) {
    const score = profile.slice(start, start + width).reduce((sum, value) => sum + value, 0);
    if (score > 0 && (!best || score > best.score)) best = {startHour: start, endHour: start + width, score};
  }
  return best;
};

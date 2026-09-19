/**
 * Geometry for the Mic button's radial menu.
 *
 * Items fan out in an arc above the button, first item on the left. Offsets
 * use screen axes — x to the right, y downwards — relative to the button's
 * centre, so they can be applied as translations and compared with a finger's
 * movement directly.
 */

export interface RadialItemPosition {
  /** Direction from the centre, in degrees: 0 is right, 90 is straight up. */
  angleDeg: number;
  /** Offset of the item's centre from the button's centre. */
  x: number;
  y: number;
}

export interface RadialLayout {
  radius: number;
  items: RadialItemPosition[];
  /** Half the angle between neighbours: how far off an item a finger may be. */
  halfSectorDeg: number;
}

/** Degrees of arc per gap between items, within the bounds below. */
const SPREAD_PER_GAP_DEG = 32;
const MIN_SPREAD_DEG = 64;
const MAX_SPREAD_DEG = 124;
/** Extra angle the outermost items accept beyond their half-sector. */
const EDGE_SLACK_DEG = 22;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Lays `count` items out on an arc of `radius` centred straight above the button. */
export const computeRadialLayout = (count: number, radius: number): RadialLayout => {
  if (count <= 0) return { radius, items: [], halfSectorDeg: 0 };
  const spread =
    count === 1
      ? 0
      : Math.min(MAX_SPREAD_DEG, Math.max(MIN_SPREAD_DEG, (count - 1) * SPREAD_PER_GAP_DEG));
  const step = count === 1 ? 0 : spread / (count - 1);
  const items = Array.from({ length: count }, (_, index) => {
    const angleDeg = 90 + spread / 2 - index * step;
    return {
      angleDeg,
      x: radius * Math.cos(toRadians(angleDeg)),
      y: -radius * Math.sin(toRadians(angleDeg)),
    };
  });
  return { radius, items, halfSectorDeg: count === 1 ? 45 : step / 2 };
};

/** Smallest angle between two directions, 0 to 180. */
const angleBetween = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

export interface RadialHitOptions {
  /** Movement inside this radius selects nothing, so a hold can be let go. */
  deadZone?: number;
  /** Movement beyond this distance selects nothing. */
  maxDistance?: number;
}

/**
 * The item a finger `dx`/`dy` away from where it pressed is pointing at, or
 * null when it rests near the button, drifts too far, or points between items.
 */
export const hitTestRadial = (
  dx: number,
  dy: number,
  layout: RadialLayout,
  { deadZone = 28, maxDistance = layout.radius + 64 }: RadialHitOptions = {}
): number | null => {
  const distance = Math.hypot(dx, dy);
  if (layout.items.length === 0 || distance < deadZone || distance > maxDistance) return null;

  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  let best: number | null = null;
  let bestGap = Infinity;
  layout.items.forEach((item, index) => {
    const gap = angleBetween(angle, item.angleDeg);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  if (best === null) return null;

  const isEdge = best === 0 || best === layout.items.length - 1;
  const tolerance = layout.halfSectorDeg + (isEdge ? EDGE_SLACK_DEG : 0);
  return bestGap <= tolerance ? best : null;
};

import { computeRadialLayout, hitTestRadial } from '../../src/utils/radialMenu';

describe('radial menu geometry', () => {
  const layout = computeRadialLayout(5, 120);

  it('fans five items symmetrically above the button, first on the left', () => {
    const angles = layout.items.map((item) => Math.round(item.angleDeg));
    expect(angles).toEqual([152, 121, 90, 59, 28]);
    const middle = layout.items[2];
    expect(middle.x).toBeCloseTo(0);
    expect(middle.y).toBeCloseTo(-120);
    expect(layout.items[0].x).toBeCloseTo(-layout.items[4].x);
    expect(layout.items[0].y).toBeCloseTo(layout.items[4].y);
    expect(layout.items.every((item) => item.y < 0)).toBe(true);
  });

  it('keeps two items apart and one item straight up', () => {
    const two = computeRadialLayout(2, 120).items.map((item) => Math.round(item.angleDeg));
    expect(two).toEqual([122, 58]);
    expect(computeRadialLayout(1, 120).items[0].angleDeg).toBe(90);
    expect(computeRadialLayout(0, 120).items).toEqual([]);
  });

  it('picks the item a finger points at', () => {
    for (let index = 0; index < layout.items.length; index += 1) {
      const { x, y } = layout.items[index];
      expect(hitTestRadial(x, y, layout)).toBe(index);
      // Short of the item, but clearly on its way there.
      expect(hitTestRadial(x * 0.5, y * 0.5, layout)).toBe(index);
    }
  });

  it('selects nothing near the button, far away, or below it', () => {
    expect(hitTestRadial(5, -10, layout)).toBeNull();
    expect(hitTestRadial(0, -400, layout)).toBeNull();
    expect(hitTestRadial(0, 80, layout)).toBeNull();
  });

  it('lets the outermost items catch a finger that drifts past them', () => {
    // Straight left and straight right are past the arc's ends.
    expect(hitTestRadial(-100, 0, layout)).toBe(0);
    expect(hitTestRadial(100, 0, layout)).toBe(4);
  });
});

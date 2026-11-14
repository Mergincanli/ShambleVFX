import { describe, expect, it } from 'vitest';
import { CAMERA_DISTANCE, boardProject, boardToThree, makeGameCamera } from '../src/preview/camera';

function threeProject(x: number, y: number, z: number): [number, number] {
  const cam = makeGameCamera();
  const v = boardToThree(x, y, z).project(cam);
  return [((v.x + 1) / 2) * 1920, ((1 - v.y) / 2) * 1080];
}

describe('game camera', () => {
  it('sits about 40.73 m from the point it looks at, as on the drawing board', () => {
    expect(CAMERA_DISTANCE).toBeCloseTo(40.73, 2);
  });

  it("draws every point within half a pixel of the drawing board's own projection", () => {
    const pts: [number, number, number][] = [];
    for (let x = -10; x <= 10; x += 2.5) for (let y = -8; y <= 8; y += 2) for (const z of [0, 0.5, 1.8, 3]) pts.push([x, y, z]);
    let worst = 0;
    for (const [x, y, z] of pts) {
      const a = boardProject(x, y, z), b = threeProject(x, y, z);
      worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    }
    expect(worst).toBeLessThan(0.5);
  });

  it('shows a 1.8 m soldier at the centre of a 1080p screen about 152 px tall (the board reads 148 px with a simpler sum)', () => {
    const h = boardProject(0, 0, 0)[1] - boardProject(0, 0, 1.8)[1];
    expect(h).toBeGreaterThan(148);
    expect(h).toBeLessThan(155);
    console.log(`1.8 m at screen centre: ${h.toFixed(1)} px`);
  });

  it('turns the world the same way as the board (no mirror image)', () => {
    // Board +x runs to the right and down the screen; board +y runs to the right and up the screen.
    const o = threeProject(0, 0, 0), px = threeProject(1, 0, 0), py = threeProject(0, 1, 0);
    expect(px[0]).toBeGreaterThan(o[0]);
    expect(px[1]).toBeGreaterThan(o[1]);
    expect(py[0]).toBeGreaterThan(o[0]);
    expect(py[1]).toBeLessThan(o[1]);
  });
});

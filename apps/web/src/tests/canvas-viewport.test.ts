import { describe, expect, it } from "vitest";
import { calculatePinchViewport } from "../canvas-viewport";

describe("calculatePinchViewport", () => {
  it("zooms around the midpoint between both fingers", () => {
    const result = calculatePinchViewport({
      zoom: 1,
      layerPosition: { x: 0, y: 0 },
      fitOrigin: { x: 0, y: 0 },
      previousCenter: { x: 100, y: 80 },
      currentCenter: { x: 100, y: 80 },
      scaleFactor: 2,
      minZoom: 0.1,
      maxZoom: 3,
    });

    expect(result).toEqual({
      zoom: 2,
      viewOffset: { x: -100, y: -80 },
    });
  });

  it("pans by the movement of the two-finger midpoint", () => {
    const result = calculatePinchViewport({
      zoom: 1,
      layerPosition: { x: 40, y: 25 },
      fitOrigin: { x: 40, y: 25 },
      previousCenter: { x: 100, y: 100 },
      currentCenter: { x: 124, y: 86 },
      scaleFactor: 1,
      minZoom: 0.1,
      maxZoom: 3,
    });

    expect(result).toEqual({
      zoom: 1,
      viewOffset: { x: 24, y: -14 },
    });
  });

  it("uses the clamped zoom when preserving the midpoint anchor", () => {
    const result = calculatePinchViewport({
      zoom: 2,
      layerPosition: { x: 60, y: 45 },
      fitOrigin: { x: 50, y: 40 },
      previousCenter: { x: 100, y: 85 },
      currentCenter: { x: 120, y: 95 },
      scaleFactor: 4,
      minZoom: 0.1,
      maxZoom: 3,
    });

    expect(result).toEqual({
      zoom: 3,
      viewOffset: { x: 10, y: -5 },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  BACKGROUND_LAYER_ID,
  createDocument,
  getDocumentBounds,
  getEffectiveBackgroundBounds,
  normalizeDocument,
  type RectangleNode,
} from "../src";

function rectangle(overrides: Partial<RectangleNode> = {}): RectangleNode {
  return {
    id: "rectangle_1",
    type: "rectangle",
    name: "Rectangle",
    x: 120,
    y: 80,
    width: 400,
    height: 240,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    style: {
      stroke: { enabled: true, color: "#000000", width: 1, style: "solid" },
      fill: { enabled: false, color: "#ffffff", opacity: 1 },
    },
    cornerRadius: 0,
    ...overrides,
  };
}

describe("background layer bounds", () => {
  it("auto-sizes to visible content without turning the first image into a background", () => {
    const document = createDocument();
    document.nodes.push(rectangle());

    expect(getEffectiveBackgroundBounds(document)).toEqual({
      x: 120,
      y: 80,
      width: 400,
      height: 240,
    });
    expect(document.canvas.background.id).toBe(BACKGROUND_LAYER_ID);
    expect(document.nodes[0]?.type).toBe("rectangle");
  });

  it("uses visible content when the background layer is hidden", () => {
    const document = createDocument();
    document.nodes.push(rectangle());
    document.canvas.background.visible = false;

    expect(getDocumentBounds(document)).toEqual({
      x: 120,
      y: 80,
      width: 400,
      height: 240,
    });
  });

  it("normalizes legacy background data", () => {
    const document = createDocument();
    document.canvas.background = {
      type: "color",
      color: "#123456",
    } as typeof document.canvas.background;

    normalizeDocument(document);

    expect(document.canvas.background).toEqual(
      expect.objectContaining({
        id: BACKGROUND_LAYER_ID,
        visible: true,
        locked: true,
        autoSize: true,
        bounds: { x: 0, y: 0, width: 1080, height: 1080 },
      }),
    );
  });
});

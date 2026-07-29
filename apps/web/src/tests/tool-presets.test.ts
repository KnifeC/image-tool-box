import { describe, expect, it } from "vitest";
import {
  createDefaultToolPresets,
  isCreationTool,
  loadToolPresets,
  normalizeToolPresets,
} from "../tool-presets";

describe("tool presets", () => {
  it("provides defaults for every creation tool", () => {
    const presets = createDefaultToolPresets();

    expect(Object.keys(presets)).toEqual([
      "text",
      "rectangle",
      "ellipse",
      "line",
      "arrow",
      "pen",
      "highlighter",
    ]);
    expect(presets.pen).toEqual(
      expect.objectContaining({ color: "#3157f5", width: 6, opacity: 1 }),
    );
  });

  it("merges partial persisted values and rejects invalid fields", () => {
    const presets = normalizeToolPresets({
      text: { text: "标题", fontSize: 72, color: "not-a-color" },
      rectangle: {
        style: {
          fill: { enabled: true, color: "#22c55e", opacity: 4 },
        },
      },
      pen: { width: -10, opacity: 0.45 },
    });

    expect(presets.text.text).toBe("标题");
    expect(presets.text.fontSize).toBe(72);
    expect(presets.text.color).toBe("#3157f5");
    expect(presets.rectangle.style.fill.color).toBe("#22c55e");
    expect(presets.rectangle.style.fill.opacity).toBe(1);
    expect(presets.rectangle.style.stroke.color).toBe("#3157f5");
    expect(presets.pen.width).toBe(1);
    expect(presets.pen.opacity).toBe(0.45);
  });

  it("recognizes only tools that create styled objects", () => {
    expect(isCreationTool("text")).toBe(true);
    expect(isCreationTool("highlighter")).toBe(true);
    expect(isCreationTool("select")).toBe(false);
    expect(isCreationTool("pan")).toBe(false);
  });

  it("loads persisted preferences and falls back on malformed storage", () => {
    const persisted = loadToolPresets({
      getItem: () => JSON.stringify({ pen: { color: "#22c55e", width: 12 } }),
    });
    const malformed = loadToolPresets({ getItem: () => "{broken" });

    expect(persisted.pen.color).toBe("#22c55e");
    expect(persisted.pen.width).toBe(12);
    expect(persisted.pen.opacity).toBe(1);
    expect(malformed).toEqual(createDefaultToolPresets());
  });
});

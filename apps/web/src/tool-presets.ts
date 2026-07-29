import type { ShapeStyle } from "@imagetoolbox/editor-core";

export const CREATION_TOOLS = [
  "text",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "pen",
  "highlighter",
] as const;

export type CreationTool = (typeof CREATION_TOOLS)[number];

export type ToolPresets = {
  text: {
    text: string;
    width: number;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    lineHeight: number;
    align: "left" | "center" | "right";
  };
  rectangle: {
    style: ShapeStyle;
    cornerRadius: number;
  };
  ellipse: {
    style: ShapeStyle;
  };
  line: {
    color: string;
    width: number;
    style: "solid" | "dashed";
  };
  arrow: {
    color: string;
    width: number;
    style: "solid" | "dashed";
    pointerLength: number;
    pointerWidth: number;
  };
  pen: {
    color: string;
    width: number;
    opacity: number;
  };
  highlighter: {
    color: string;
    width: number;
    opacity: number;
  };
};

export const TOOL_PRESETS_STORAGE_KEY = "imagetoolbox.tool-presets.v1";

export function createDefaultToolPresets(): ToolPresets {
  return {
    text: {
      text: "文本",
      width: 280,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 42,
      fontWeight: 600,
      color: "#3157f5",
      lineHeight: 1.2,
      align: "center",
    },
    rectangle: {
      style: {
        stroke: {
          enabled: true,
          color: "#3157f5",
          width: 3,
          style: "solid",
        },
        fill: {
          enabled: true,
          color: "#f6c94c",
          opacity: 0.3,
        },
      },
      cornerRadius: 8,
    },
    ellipse: {
      style: {
        stroke: {
          enabled: true,
          color: "#3157f5",
          width: 3,
          style: "solid",
        },
        fill: {
          enabled: true,
          color: "#f6c94c",
          opacity: 0.3,
        },
      },
    },
    line: {
      color: "#3157f5",
      width: 4,
      style: "solid",
    },
    arrow: {
      color: "#f05252",
      width: 4,
      style: "solid",
      pointerLength: 16,
      pointerWidth: 14,
    },
    pen: {
      color: "#3157f5",
      width: 6,
      opacity: 1,
    },
    highlighter: {
      color: "#f6d74b",
      width: 28,
      opacity: 0.32,
    },
  };
}

export function isCreationTool(value: string): value is CreationTool {
  return (CREATION_TOOLS as readonly string[]).includes(value);
}

export function normalizeToolPresets(value: unknown): ToolPresets {
  const defaults = createDefaultToolPresets();
  if (!isRecord(value)) return defaults;
  return {
    text: normalizeText(value.text, defaults.text),
    rectangle: normalizeRectangle(value.rectangle, defaults.rectangle),
    ellipse: normalizeEllipse(value.ellipse, defaults.ellipse),
    line: normalizeLine(value.line, defaults.line),
    arrow: normalizeArrow(value.arrow, defaults.arrow),
    pen: normalizeFreehand(value.pen, defaults.pen),
    highlighter: normalizeFreehand(value.highlighter, defaults.highlighter),
  };
}

export function loadToolPresets(storage?: Pick<Storage, "getItem">): ToolPresets {
  if (!storage) return createDefaultToolPresets();
  try {
    const raw = storage.getItem(TOOL_PRESETS_STORAGE_KEY);
    return raw ? normalizeToolPresets(JSON.parse(raw)) : createDefaultToolPresets();
  } catch {
    return createDefaultToolPresets();
  }
}

function normalizeText(value: unknown, fallback: ToolPresets["text"]) {
  const record = isRecord(value) ? value : {};
  return {
    text: stringValue(record.text, fallback.text),
    width: numberValue(record.width, fallback.width, 80, 2_000),
    fontFamily: stringValue(record.fontFamily, fallback.fontFamily),
    fontSize: numberValue(record.fontSize, fallback.fontSize, 8, 400),
    fontWeight: numberValue(record.fontWeight, fallback.fontWeight, 100, 900),
    color: colorValue(record.color, fallback.color),
    lineHeight: numberValue(record.lineHeight, fallback.lineHeight, 0.5, 4),
    align: enumValue(record.align, ["left", "center", "right"], fallback.align),
  };
}

function normalizeRectangle(
  value: unknown,
  fallback: ToolPresets["rectangle"],
) {
  const record = isRecord(value) ? value : {};
  return {
    style: normalizeShapeStyle(record.style, fallback.style),
    cornerRadius: numberValue(
      record.cornerRadius,
      fallback.cornerRadius,
      0,
      1_000,
    ),
  };
}

function normalizeEllipse(value: unknown, fallback: ToolPresets["ellipse"]) {
  const record = isRecord(value) ? value : {};
  return {
    style: normalizeShapeStyle(record.style, fallback.style),
  };
}

function normalizeShapeStyle(value: unknown, fallback: ShapeStyle): ShapeStyle {
  const record = isRecord(value) ? value : {};
  const stroke = isRecord(record.stroke) ? record.stroke : {};
  const fill = isRecord(record.fill) ? record.fill : {};
  return {
    stroke: {
      enabled: booleanValue(stroke.enabled, fallback.stroke.enabled),
      color: colorValue(stroke.color, fallback.stroke.color),
      width: numberValue(stroke.width, fallback.stroke.width, 0, 100),
      style: enumValue(
        stroke.style,
        ["solid", "dashed"],
        fallback.stroke.style,
      ),
    },
    fill: {
      enabled: booleanValue(fill.enabled, fallback.fill.enabled),
      color: colorValue(fill.color, fallback.fill.color),
      opacity: numberValue(fill.opacity, fallback.fill.opacity, 0, 1),
    },
  };
}

function normalizeLine(value: unknown, fallback: ToolPresets["line"]) {
  const record = isRecord(value) ? value : {};
  return {
    color: colorValue(record.color, fallback.color),
    width: numberValue(record.width, fallback.width, 1, 100),
    style: enumValue(record.style, ["solid", "dashed"], fallback.style),
  };
}

function normalizeArrow(value: unknown, fallback: ToolPresets["arrow"]) {
  const record = isRecord(value) ? value : {};
  return {
    ...normalizeLine(record, fallback),
    pointerLength: numberValue(
      record.pointerLength,
      fallback.pointerLength,
      4,
      100,
    ),
    pointerWidth: numberValue(
      record.pointerWidth,
      fallback.pointerWidth,
      4,
      100,
    ),
  };
}

function normalizeFreehand(
  value: unknown,
  fallback: ToolPresets["pen"] | ToolPresets["highlighter"],
) {
  const record = isRecord(value) ? value : {};
  return {
    color: colorValue(record.color, fallback.color),
    width: numberValue(record.width, fallback.width, 1, 200),
    opacity: numberValue(record.opacity, fallback.opacity, 0, 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function colorValue(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function numberValue(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function enumValue<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
) {
  return typeof value === "string" && choices.includes(value as T)
    ? (value as T)
    : fallback;
}

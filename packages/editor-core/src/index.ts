export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasConfig = {
  width: number;
  height: number;
  background: BackgroundLayerConfig;
};

export const BACKGROUND_LAYER_ID = "background";

export type BackgroundLayerConfig = {
  id: typeof BACKGROUND_LAYER_ID;
  name: string;
  visible: boolean;
  locked: boolean;
  autoSize: boolean;
  bounds: Rect;
} & (
  | { type: "color"; color: string }
  | { type: "transparent" }
);

export type AssetRecord = {
  id: string;
  type: "image";
  name: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  storageKey: string;
};

export type StrokeStyle = {
  enabled: boolean;
  color: string;
  width: number;
  style: "solid" | "dashed";
  dash?: number[];
};

export type FillStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
};

export type BaseNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
};

export type ImageNode = BaseNode & {
  type: "image";
  assetId: string;
  cropRect: Rect;
  flipX: boolean;
  flipY: boolean;
  border: StrokeStyle;
  cornerRadius: number;
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
    opacity: number;
  };
};

export type ShapeStyle = {
  stroke: StrokeStyle;
  fill: FillStyle;
};

export type RectangleNode = BaseNode & {
  type: "rectangle";
  style: ShapeStyle;
  cornerRadius: number;
};

export type EllipseNode = BaseNode & {
  type: "ellipse";
  style: ShapeStyle;
};

export type LineNode = BaseNode & {
  type: "line";
  points: number[];
  stroke: Omit<StrokeStyle, "enabled">;
};

export type ArrowNode = BaseNode & {
  type: "arrow";
  points: number[];
  stroke: Omit<StrokeStyle, "enabled">;
  arrowStart: boolean;
  arrowEnd: boolean;
  pointerLength: number;
  pointerWidth: number;
};

export type TextNode = BaseNode & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline";
  color: string;
  lineHeight: number;
  letterSpacing: number;
  align: "left" | "center" | "right";
  textStroke: {
    enabled: boolean;
    color: string;
    width: number;
  };
  background: {
    enabled: boolean;
    color: string;
    opacity: number;
    padding: number;
    cornerRadius: number;
  };
};

export type FreehandNode = BaseNode & {
  type: "freehand";
  tool: "pen" | "highlighter";
  points: number[];
  color: string;
  strokeWidth: number;
};

export type SceneNode =
  | ImageNode
  | RectangleNode
  | EllipseNode
  | LineNode
  | ArrowNode
  | TextNode
  | FreehandNode;

export type ImageToolBoxDocument = {
  version: 1;
  id: string;
  name: string;
  canvas: CanvasConfig;
  assets: AssetRecord[];
  nodes: SceneNode[];
  createdAt: number;
  updatedAt: number;
};

export type CropDraft = {
  targetNodeId: string;
  originalCropRect: Rect;
  originalFrame: Rect;
  draftCropRect: Rect;
  draftFrame: Rect;
  aspectRatio?: number;
};

export interface EditorCommand {
  readonly type: string;
  execute(document: ImageToolBoxDocument): void;
  undo(document: ImageToolBoxDocument): void;
}

export class SnapshotCommand implements EditorCommand {
  readonly type: string;
  readonly #before: ImageToolBoxDocument;
  readonly #after: ImageToolBoxDocument;

  constructor(
    type: string,
    before: ImageToolBoxDocument,
    after: ImageToolBoxDocument,
  ) {
    this.type = type;
    this.#before = structuredClone(before);
    this.#after = structuredClone(after);
  }

  execute(document: ImageToolBoxDocument) {
    replaceDocument(document, this.#after);
  }

  undo(document: ImageToolBoxDocument) {
    replaceDocument(document, this.#before);
  }
}

export class HistoryStack {
  readonly #limit: number;
  readonly #undo: EditorCommand[] = [];
  readonly #redo: EditorCommand[] = [];

  constructor(limit = 50) {
    this.#limit = limit;
  }

  commit(command: EditorCommand) {
    this.#undo.push(command);
    this.#redo.length = 0;
    if (this.#undo.length > this.#limit) this.#undo.shift();
  }

  undo(document: ImageToolBoxDocument) {
    const command = this.#undo.pop();
    if (!command) return false;
    command.undo(document);
    this.#redo.push(command);
    return true;
  }

  redo(document: ImageToolBoxDocument) {
    const command = this.#redo.pop();
    if (!command) return false;
    command.execute(document);
    this.#undo.push(command);
    return true;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
  }
}

export function cloneDocument(document: ImageToolBoxDocument) {
  return structuredClone(document);
}

export function replaceDocument(
  target: ImageToolBoxDocument,
  source: ImageToolBoxDocument,
) {
  Object.assign(target, structuredClone(source));
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createDocument(name = "未命名 / Untitled"): ImageToolBoxDocument {
  const now = Date.now();
  return {
    version: 1,
    id: makeId("doc"),
    name,
    canvas: {
      width: 1080,
      height: 1080,
      background: {
        id: BACKGROUND_LAYER_ID,
        name: "背景 / Background",
        type: "color",
        color: "#ffffff",
        visible: true,
        locked: true,
        autoSize: true,
        bounds: { x: 0, y: 0, width: 1080, height: 1080 },
      },
    },
    assets: [],
    nodes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeZIndexes(nodes: SceneNode[]) {
  nodes
    .sort((a, b) => a.zIndex - b.zIndex)
    .forEach((node, index) => {
      node.zIndex = index;
    });
}

export function getNodeBounds(nodes: SceneNode[]): Rect | null {
  if (!nodes.length) return null;
  const corners = nodes.flatMap((node) => {
    const radians = (node.rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return [
      [0, 0],
      [node.width, 0],
      [node.width, node.height],
      [0, node.height],
    ].map(([localX = 0, localY = 0]) => ({
      x: node.x + localX * cosine - localY * sine,
      y: node.y + localX * sine + localY * cosine,
    }));
  });
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getEffectiveBackgroundBounds(document: ImageToolBoxDocument): Rect {
  if (document.canvas.background.autoSize) {
    const contentBounds = getNodeBounds(
      document.nodes.filter((node) => node.visible),
    );
    if (contentBounds) return contentBounds;
  }
  return { ...document.canvas.background.bounds };
}

export function getDocumentBounds(document: ImageToolBoxDocument): Rect | null {
  if (document.canvas.background.visible) {
    return getEffectiveBackgroundBounds(document);
  }
  return getNodeBounds(document.nodes.filter((node) => node.visible));
}

export function normalizeDocument(document: ImageToolBoxDocument) {
  const legacy = document.canvas.background as Partial<BackgroundLayerConfig> & {
    type?: "color" | "transparent";
    color?: string;
  };
  const fallbackBounds = {
    x: 0,
    y: 0,
    width: Math.max(1, document.canvas.width || 1080),
    height: Math.max(1, document.canvas.height || 1080),
  };
  document.canvas.background = {
    id: BACKGROUND_LAYER_ID,
    name: legacy.name ?? "背景 / Background",
    type: legacy.type === "transparent" ? "transparent" : "color",
    ...(legacy.type === "transparent"
      ? {}
      : { color: legacy.color ?? "#ffffff" }),
    visible: legacy.visible ?? true,
    locked: legacy.locked ?? true,
    autoSize: legacy.autoSize ?? true,
    bounds: {
      ...fallbackBounds,
      ...(legacy.bounds ?? {}),
    },
  } as BackgroundLayerConfig;
  return document;
}

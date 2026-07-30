import { computed, reactive, ref, shallowReactive } from "vue";
import { defineStore } from "pinia";
import {
  BACKGROUND_LAYER_ID,
  cloneDocument,
  createDocument,
  getDocumentBounds,
  getEffectiveBackgroundBounds,
  HistoryStack,
  makeId,
  normalizeZIndexes,
  rectFromPoints,
  SnapshotCommand,
  type ArrowNode,
  type EllipseNode,
  type FreehandNode,
  type ImageNode,
  type ImageToolBoxDocument,
  type LineNode,
  type RectangleNode,
  type Rect,
  type SceneNode,
  type TextNode,
} from "@imagetoolbox/editor-core";
import {
  exportProjectArchive,
  importProjectArchive,
  saveLocalProject,
} from "@imagetoolbox/project-format";
import type { ImageToolBoxPlatform, OpenedFile } from "@imagetoolbox/platform-api";
import { renderDocument } from "../services/exporter";
import {
  createDefaultToolPresets,
  loadToolPresets,
  normalizeToolPresets,
  TOOL_PRESETS_STORAGE_KEY,
  type CreationTool,
  type ToolPresets,
} from "../tool-presets";

export type EditorTool =
  | "select"
  | "import"
  | "crop"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "pen"
  | "highlighter"
  | "pan";

const CURRENT_PROJECT_KEY = "imagetoolbox.currentProjectId";

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const defaultStroke = () => ({
  enabled: true,
  color: "#3157f5",
  width: 3,
  style: "solid" as const,
});

const defaultFill = () => ({
  enabled: true,
  color: "#f6c94c",
  opacity: 0.3,
});

export const useEditorStore = defineStore("editor", () => {
  const document = reactive<ImageToolBoxDocument>(createDocument());
  const history = new HistoryStack(50);
  const assets = shallowReactive(new Map<string, Blob>());
  const assetUrls = shallowReactive(new Map<string, string>());
  const selectedIds = ref<string[]>([]);
  const tool = ref<EditorTool>("select");
  const toolPresets = reactive(
    loadToolPresets(
      typeof window === "undefined" ? undefined : window.localStorage,
    ),
  );
  const inspectorTab = ref<"properties" | "layers">("properties");
  const mobilePanel = ref<"properties" | "layers" | null>(null);
  const zoom = ref(0.55);
  const viewOffset = reactive({ x: 0, y: 0 });
  const cropRatio = ref<number | undefined>();
  const cropOriginal = ref<{
    cropRect: ImageNode["cropRect"];
    frame: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const cropSelection = ref<Rect | null>(null);
  const temporaryPan = ref(false);
  const dirty = ref(false);
  const saving = ref(false);
  const toast = ref("");
  const testProjectLoading = ref(false);
  const fitRequest = ref(0);
  const historyVersion = ref(0);
  const textEditRequest = ref<{ nodeId: string; token: number } | null>(null);
  let textEditToken = 0;
  let previewBefore: ImageToolBoxDocument | null = null;
  const lastCanvasColor = ref(
    document.canvas.background.type === "color"
      ? document.canvas.background.color
      : "#ffffff",
  );
  let autosaveTimer: number | undefined;

  const nodes = computed(() => [...document.nodes].sort((a, b) => a.zIndex - b.zIndex));
  const selectedNodes = computed(() =>
    document.nodes.filter((node) => selectedIds.value.includes(node.id)),
  );
  const primaryNode = computed(() => selectedNodes.value.at(-1) ?? null);
  const selectedImage = computed(() =>
    primaryNode.value?.type === "image" ? primaryNode.value : null,
  );
  const backgroundSelected = computed(() =>
    selectedIds.value.includes(BACKGROUND_LAYER_ID),
  );
  const backgroundBounds = computed(() => getEffectiveBackgroundBounds(document));
  const documentBounds = computed(() => getDocumentBounds(document));
  const effectivePan = computed(() => tool.value === "pan" || temporaryPan.value);
  const canUndo = computed(() => {
    historyVersion.value;
    return history.canUndo;
  });
  const canRedo = computed(() => {
    historyVersion.value;
    return history.canRedo;
  });

  function mutate(type: string, operation: () => void) {
    commitPreviewEdit();
    const before = cloneDocument(plainClone(document));
    operation();
    document.updatedAt = Date.now();
    const after = cloneDocument(plainClone(document));
    history.commit(new SnapshotCommand(type, before, after));
    historyVersion.value += 1;
    markDirty();
  }

  function markDirty() {
    dirty.value = true;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => void saveLocal(), 1_000);
  }

  async function saveLocal() {
    saving.value = true;
    try {
      await saveLocalProject(serializableDocument(), assets);
      window.localStorage.setItem(CURRENT_PROJECT_KEY, document.id);
      dirty.value = false;
    } finally {
      saving.value = false;
    }
  }

  function setTool(next: EditorTool) {
    if (tool.value === "crop" && next !== "crop") cancelCrop();
    if (next === "crop") mobilePanel.value = null;
    tool.value = next;
    if (
      next === "text" ||
      next === "rectangle" ||
      next === "ellipse" ||
      next === "line" ||
      next === "arrow" ||
      next === "pen" ||
      next === "highlighter"
    ) {
      inspectorTab.value = "properties";
    }
    if (next === "crop") enterCrop();
  }

  function renameDocument(name: string) {
    const nextName = name.trim();
    if (!nextName || nextName === document.name) return;
    mutate("rename-document", () => {
      document.name = nextName;
    });
  }

  function updateToolPreset<K extends CreationTool>(
    targetTool: K,
    patch: Partial<ToolPresets[K]>,
  ) {
    Object.assign(toolPresets[targetTool], patch);
    const normalized = normalizeToolPresets(toolPresets);
    Object.assign(toolPresets[targetTool], normalized[targetTool]);
    persistToolPresets();
  }

  function resetToolPreset(targetTool: CreationTool) {
    const defaults = createDefaultToolPresets();
    Object.assign(toolPresets[targetTool], plainClone(defaults[targetTool]));
    persistToolPresets();
  }

  function persistToolPresets() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TOOL_PRESETS_STORAGE_KEY,
        JSON.stringify(toolPresets),
      );
    } catch {
      // Tool preferences are optional; drawing must still work if storage fails.
    }
  }

  function select(id: string | null, additive = false) {
    if (!id) {
      selectedIds.value = [];
      return;
    }
    if (additive) {
      selectedIds.value = selectedIds.value.includes(id)
        ? selectedIds.value.filter((candidate) => candidate !== id)
        : [...selectedIds.value, id];
    } else {
      selectedIds.value = [id];
    }
  }

  function setCanvasSize(width: number, height: number) {
    if (document.canvas.background.locked) return;
    const nextWidth = clampCanvasDimension(width);
    const nextHeight = clampCanvasDimension(height);
    const currentBounds = getEffectiveBackgroundBounds(document);
    if (
      !document.canvas.background.autoSize &&
      nextWidth === currentBounds.width &&
      nextHeight === currentBounds.height
    ) {
      return;
    }
    mutate("resize-canvas", () => {
      document.canvas.width = nextWidth;
      document.canvas.height = nextHeight;
      document.canvas.background.autoSize = false;
      document.canvas.background.bounds = {
        ...currentBounds,
        width: nextWidth,
        height: nextHeight,
      };
    });
    fitCanvas();
  }

  function swapCanvasSize() {
    const bounds = getEffectiveBackgroundBounds(document);
    setCanvasSize(bounds.height, bounds.width);
  }

  function setCanvasTransparent(transparent: boolean) {
    if (transparent && document.canvas.background.type === "color") {
      lastCanvasColor.value = document.canvas.background.color;
    }
    if (
      (transparent && document.canvas.background.type === "transparent") ||
      (!transparent && document.canvas.background.type === "color")
    ) return;
    mutate("change-canvas-background", () => {
      const common = backgroundMetadata(document.canvas.background);
      document.canvas.background = transparent
        ? { ...common, type: "transparent" }
        : { ...common, type: "color", color: lastCanvasColor.value };
    });
  }

  function setCanvasBackgroundColor(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    lastCanvasColor.value = color;
    if (
      document.canvas.background.type === "color" &&
      document.canvas.background.color.toLowerCase() === color.toLowerCase()
    ) {
      return;
    }
    mutate("change-canvas-background", () => {
      document.canvas.background = {
        ...backgroundMetadata(document.canvas.background),
        type: "color",
        color,
      };
    });
  }

  function previewCanvasBackgroundColor(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    if (!previewBefore) previewBefore = cloneDocument(plainClone(document));
    lastCanvasColor.value = color;
    document.canvas.background = {
      ...backgroundMetadata(document.canvas.background),
      type: "color",
      color,
    };
    document.updatedAt = Date.now();
  }

  function setBackgroundAutoSize(autoSize: boolean) {
    if (document.canvas.background.locked) return;
    if (document.canvas.background.autoSize === autoSize) return;
    const currentBounds = getEffectiveBackgroundBounds(document);
    mutate("change-background-auto-size", () => {
      document.canvas.background.autoSize = autoSize;
      if (autoSize) document.canvas.background.transformEnabled = false;
      document.canvas.background.bounds = currentBounds;
      document.canvas.width = Math.max(1, Math.round(currentBounds.width));
      document.canvas.height = Math.max(1, Math.round(currentBounds.height));
    });
    fitCanvas();
  }

  function setBackgroundTransformEnabled(enabled: boolean) {
    if (document.canvas.background.locked) return;
    if (document.canvas.background.transformEnabled === enabled) return;
    const currentBounds = getEffectiveBackgroundBounds(document);
    mutate("change-background-transform-enabled", () => {
      document.canvas.background.transformEnabled = enabled;
      if (enabled) {
        document.canvas.background.autoSize = false;
        document.canvas.background.bounds = currentBounds;
        document.canvas.width = Math.max(1, Math.round(currentBounds.width));
        document.canvas.height = Math.max(1, Math.round(currentBounds.height));
      }
    });
    if (enabled) {
      tool.value = "select";
      select(BACKGROUND_LAYER_ID);
    }
  }

  function toggleBackground(key: "visible" | "locked") {
    mutate(`toggle-background-${key}`, () => {
      document.canvas.background[key] = !document.canvas.background[key];
    });
    if (key === "visible") fitCanvas();
  }

  function transformBackground(bounds: Rect) {
    if (
      !document.canvas.background.transformEnabled ||
      document.canvas.background.autoSize ||
      document.canvas.background.locked
    ) {
      return;
    }
    const next = {
      x: bounds.x,
      y: bounds.y,
      width: clampCanvasDimension(bounds.width),
      height: clampCanvasDimension(bounds.height),
    };
    mutate("transform-background", () => {
      document.canvas.background.bounds = next;
      document.canvas.width = next.width;
      document.canvas.height = next.height;
    });
  }

  function setTemporaryPan(active: boolean) {
    temporaryPan.value = active;
  }

  function fitCanvas() {
    fitRequest.value += 1;
  }

  async function importFiles(files: OpenedFile[]) {
    for (const file of files) {
      if (file.mimeType === "application/x-imagetoolbox-project" || file.name.endsWith(".ibox")) {
        await openProjectBlob(new Blob([file.bytes]));
        continue;
      }
      await addImageBlob(new Blob([file.bytes], { type: file.mimeType }), file.name);
    }
    tool.value = "select";
  }

  async function addImageBlob(blob: Blob, name: string, frame?: Partial<ImageNode>) {
    const wasEmpty = document.nodes.length === 0;
    const bitmap = await createImageBitmap(blob);
    const id = makeId("asset");
    const nodeId = makeId("image");
    const maxDisplay = 430;
    const scale = Math.min(1, maxDisplay / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    bitmap.close();
    const asset = {
      id,
      type: "image" as const,
      name,
      mimeType: blob.type || "image/png",
      width: Math.round(width / scale),
      height: Math.round(height / scale),
      size: blob.size,
      storageKey: id,
    };
    const node: ImageNode = {
      id: nodeId,
      type: "image",
      name,
      assetId: id,
      x: frame?.x ?? (document.canvas.width - width) / 2,
      y: frame?.y ?? (document.canvas.height - height) / 2,
      width: frame?.width ?? width,
      height: frame?.height ?? height,
      rotation: frame?.rotation ?? 0,
      opacity: 1,
      cropRect: { x: 0, y: 0, width: asset.width, height: asset.height },
      flipX: false,
      flipY: false,
      border: {
        enabled: false,
        color: "#3157f5",
        width: 2,
        style: "solid",
      },
      cornerRadius: 0,
      shadow: {
        enabled: false,
        color: "#111827",
        blur: 16,
        offsetX: 0,
        offsetY: 8,
        opacity: 0.18,
      },
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
    };
    assets.set(id, blob);
    refreshAssetUrl(id, blob);
    mutate("add-image", () => {
      document.assets.push(asset);
      document.nodes.push(node);
    });
    select(nodeId);
    if (wasEmpty) fitCanvas();
    return nodeId;
  }

  function refreshAssetUrl(id: string, blob: Blob) {
    const old = assetUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    assetUrls.set(id, URL.createObjectURL(blob));
  }

  function addNode(type: Exclude<EditorTool, "select" | "import" | "crop" | "pen" | "highlighter" | "pan">) {
    const bounds = getEffectiveBackgroundBounds(document);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const base = {
      id: makeId(type),
      name: type,
      x: centerX - 120,
      y: centerY - 70,
      width: 240,
      height: 140,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
    };
    let node: SceneNode;
    if (type === "text") {
      node = {
        ...base,
        type: "text",
        name: "夏季旅行计划",
        text: "夏季旅行计划",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 42,
        fontWeight: 600,
        fontStyle: "normal",
        textDecoration: "none",
        color: "#3157f5",
        lineHeight: 1.2,
        letterSpacing: 0,
        align: "center",
        textStroke: { enabled: false, color: "#ffffff", width: 1 },
        background: {
          enabled: false,
          color: "#ffffff",
          opacity: 1,
          padding: 12,
          cornerRadius: 8,
        },
      } satisfies TextNode;
    } else if (type === "rectangle") {
      node = {
        ...base,
        type,
        name: "矩形 / Rectangle",
        style: { stroke: defaultStroke(), fill: defaultFill() },
        cornerRadius: 8,
      } satisfies RectangleNode;
    } else if (type === "ellipse") {
      node = {
        ...base,
        type,
        name: "椭圆 / Ellipse",
        style: { stroke: defaultStroke(), fill: defaultFill() },
      } satisfies EllipseNode;
    } else if (type === "line") {
      node = {
        ...base,
        type,
        name: "直线 / Line",
        points: [0, 0, 240, 140],
        stroke: { color: "#3157f5", width: 4, style: "solid" },
      } satisfies LineNode;
    } else {
      node = {
        ...base,
        type: "arrow",
        name: "箭头 / Arrow",
        points: [0, 140, 240, 0],
        stroke: { color: "#f05252", width: 4, style: "solid" },
        arrowStart: false,
        arrowEnd: true,
        pointerLength: 16,
        pointerWidth: 14,
      } satisfies ArrowNode;
    }
    mutate(`add-${type}`, () => document.nodes.push(node));
    select(node.id);
    tool.value = "select";
  }

  function addTextAt(point: { x: number; y: number }) {
    const preset = toolPresets.text;
    const text = preset.text.trim() ? preset.text : "文本";
    const lineCount = Math.max(1, text.split(/\r?\n/).length);
    const node: TextNode = {
      id: makeId("text"),
      type: "text",
      name: text.split(/\r?\n/, 1)[0] || "文本",
      x: point.x,
      y: point.y,
      width: preset.width,
      height: Math.max(
        68,
        preset.fontSize * preset.lineHeight * lineCount,
      ),
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
      text,
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontStyle: "normal",
      textDecoration: "none",
      color: preset.color,
      lineHeight: preset.lineHeight,
      letterSpacing: 0,
      align: preset.align,
      textStroke: { enabled: false, color: "#ffffff", width: 1 },
      background: {
        enabled: false,
        color: "#ffffff",
        opacity: 1,
        padding: 12,
        cornerRadius: 8,
      },
    };
    mutate("add-text", () => document.nodes.push(node));
    select(node.id);
    tool.value = "select";
    inspectorTab.value = "properties";
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(max-width: 900px)").matches
    ) {
      mobilePanel.value = "properties";
    }
    textEditToken += 1;
    textEditRequest.value = { nodeId: node.id, token: textEditToken };
  }

  function addLinearNode(
    type: "line" | "arrow",
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    const preset = toolPresets[type];
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.max(1, Math.abs(end.x - start.x));
    const height = Math.max(1, Math.abs(end.y - start.y));
    const points = [start.x - x, start.y - y, end.x - x, end.y - y];
    const base = {
      id: makeId(type),
      type,
      name: type === "arrow" ? "箭头 / Arrow" : "直线 / Line",
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
      points,
      stroke: {
        color: preset.color,
        width: preset.width,
        style: preset.style,
      },
    };
    const node: LineNode | ArrowNode =
      type === "arrow"
        ? {
            ...base,
            type: "arrow",
            arrowStart: false,
            arrowEnd: true,
            pointerLength: toolPresets.arrow.pointerLength,
            pointerWidth: toolPresets.arrow.pointerWidth,
          }
        : { ...base, type: "line" };
    mutate(`draw-${type}`, () => document.nodes.push(node));
    select(node.id);
  }

  function addShapeNode(
    type: "rectangle" | "ellipse",
    start: { x: number; y: number },
    end: { x: number; y: number },
    constrainSquare = false,
  ) {
    const bounds = rectFromPoints(start, end, constrainSquare);
    const preset = toolPresets[type];
    const base = {
      id: makeId(type),
      name: type === "rectangle" ? "矩形 / Rectangle" : "椭圆 / Ellipse",
      ...bounds,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
      style: plainClone(preset.style),
    };
    const node: RectangleNode | EllipseNode =
      type === "rectangle"
        ? {
            ...base,
            type: "rectangle",
            cornerRadius: toolPresets.rectangle.cornerRadius,
          }
        : { ...base, type: "ellipse" };
    mutate(`draw-${type}`, () => document.nodes.push(node));
    select(node.id);
  }

  function addFreehand(points: number[], drawTool: "pen" | "highlighter") {
    if (points.length < 4) return;
    const preset = toolPresets[drawTool];
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const node: FreehandNode = {
      id: makeId("stroke"),
      type: "freehand",
      tool: drawTool,
      name: drawTool === "pen" ? "画笔 / Pen" : "荧光笔 / Highlighter",
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      rotation: 0,
      opacity: preset.opacity,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
      points: points.map((value, index) => value - (index % 2 === 0 ? minX : minY)),
      color: preset.color,
      strokeWidth: preset.width,
    };
    mutate(`draw-${drawTool}`, () => document.nodes.push(node));
    select(node.id);
  }

  function updateNode(id: string, patch: Partial<SceneNode>, commit = true) {
    const operation = () => {
      const node = document.nodes.find((candidate) => candidate.id === id);
      if (node) Object.assign(node, patch);
    };
    if (commit) mutate("change-node", operation);
    else {
      operation();
      document.updatedAt = Date.now();
      markDirty();
    }
  }

  function previewNode(id: string, patch: Partial<SceneNode>) {
    if (!previewBefore) previewBefore = cloneDocument(plainClone(document));
    const node = document.nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    Object.assign(node, patch);
    document.updatedAt = Date.now();
  }

  function commitPreviewEdit(type = "change-node") {
    if (!previewBefore) return;
    const before = previewBefore;
    previewBefore = null;
    const after = cloneDocument(plainClone(document));
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    history.commit(new SnapshotCommand(type, before, after));
    historyVersion.value += 1;
    markDirty();
  }

  function transformNode(
    id: string,
    patch: Pick<SceneNode, "x" | "y" | "width" | "height" | "rotation">,
  ) {
    updateNode(id, patch);
  }

  function deleteSelected() {
    const ids = new Set(
      selectedIds.value.filter((id) => id !== BACKGROUND_LAYER_ID),
    );
    if (!ids.size) return;
    mutate("delete-node", () => {
      document.nodes = document.nodes.filter((node) => !ids.has(node.id));
      normalizeZIndexes(document.nodes);
    });
    selectedIds.value = [];
  }

  function duplicateSelected() {
    if (!selectedIds.value.length) return;
    const created: string[] = [];
    mutate("duplicate-node", () => {
      for (const node of selectedNodes.value) {
        const duplicate = plainClone(node);
        duplicate.id = makeId(node.type);
        duplicate.name = `${node.name} copy`;
        duplicate.x += 24;
        duplicate.y += 24;
        duplicate.zIndex = document.nodes.length;
        document.nodes.push(duplicate);
        created.push(duplicate.id);
      }
    });
    selectedIds.value = created;
  }

  function reorderNode(id: string, direction: -1 | 1) {
    mutate("reorder-layer", () => {
      const sorted = nodes.value;
      const index = sorted.findIndex((node) => node.id === id);
      const target = Math.max(0, Math.min(sorted.length - 1, index + direction));
      const other = sorted[target];
      const current = sorted[index];
      if (!other || !current || other.id === current.id) return;
      const zIndex = current.zIndex;
      current.zIndex = other.zIndex;
      other.zIndex = zIndex;
      normalizeZIndexes(document.nodes);
    });
  }

  function moveNodeRelative(
    id: string,
    targetId: string,
    position: "above" | "below",
  ) {
    if (id === targetId) return;
    const currentOrder = nodes.value;
    const currentIndex = currentOrder.findIndex((node) => node.id === id);
    const targetIndex = currentOrder.findIndex((node) => node.id === targetId);
    if (currentIndex < 0 || targetIndex < 0) return;
    if (
      (position === "above" && currentIndex === targetIndex + 1) ||
      (position === "below" && currentIndex === targetIndex - 1)
    ) {
      return;
    }

    mutate("reorder-layer", () => {
      const ordered = [...document.nodes].sort((a, b) => a.zIndex - b.zIndex);
      const sourceIndex = ordered.findIndex((node) => node.id === id);
      const [source] = ordered.splice(sourceIndex, 1);
      const adjustedTargetIndex = ordered.findIndex(
        (node) => node.id === targetId,
      );
      if (!source || adjustedTargetIndex < 0) return;
      const insertIndex =
        position === "above" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
      ordered.splice(insertIndex, 0, source);
      ordered.forEach((node, index) => {
        node.zIndex = index;
      });
      document.nodes = ordered;
    });
  }

  function toggleNode(id: string, key: "visible" | "locked") {
    if (id === BACKGROUND_LAYER_ID) {
      toggleBackground(key);
      return;
    }
    const node = document.nodes.find((candidate) => candidate.id === id);
    if (node) updateNode(id, { [key]: !node[key] } as Partial<SceneNode>);
  }

  function undo() {
    commitPreviewEdit();
    if (history.undo(document)) {
      historyVersion.value += 1;
      dirty.value = true;
      selectedIds.value = selectedIds.value.filter((id) =>
        id === BACKGROUND_LAYER_ID ||
        document.nodes.some((node) => node.id === id),
      );
    }
  }

  function redo() {
    commitPreviewEdit();
    if (history.redo(document)) {
      historyVersion.value += 1;
      dirty.value = true;
    }
  }

  function enterCrop() {
    const image = selectedImage.value;
    if (!image) {
      tool.value = "select";
      showToast("请先选择图片 / Select an image first");
      return;
    }
    cropOriginal.value = {
      cropRect: plainClone(image.cropRect),
      frame: { x: image.x, y: image.y, width: image.width, height: image.height },
    };
    cropSelection.value = { x: 0, y: 0, width: image.width, height: image.height };
  }

  function applyCropRatio(ratio?: number) {
    const image = selectedImage.value;
    const selection = cropSelection.value;
    if (!image || !selection) return;
    cropRatio.value = ratio;
    if (!ratio) return;
    const currentRatio = selection.width / selection.height;
    if (currentRatio > ratio) {
      const width = selection.height * ratio;
      selection.x += (selection.width - width) / 2;
      selection.width = width;
    } else {
      const height = selection.width / ratio;
      selection.y += (selection.height - height) / 2;
      selection.height = height;
    }
    cropSelection.value = { ...selection };
  }

  function adjustCropInset(percent: number) {
    const image = selectedImage.value;
    if (!image || !cropOriginal.value) return;
    const inset = Math.max(0, Math.min(40, percent)) / 100;
    const ratio = cropRatio.value;
    let width = cropOriginal.value.frame.width * (1 - inset * 2);
    let height = cropOriginal.value.frame.height * (1 - inset * 2);
    if (ratio) {
      if (width / height > ratio) width = height * ratio;
      else height = width / ratio;
    }
    cropSelection.value = {
      x: (cropOriginal.value.frame.width - width) / 2,
      y: (cropOriginal.value.frame.height - height) / 2,
      width,
      height,
    };
  }

  function updateCropSelection(selection: Rect) {
    const image = selectedImage.value;
    if (!image) return;
    const width = Math.max(1, Math.min(image.width, selection.width));
    const height = Math.max(1, Math.min(image.height, selection.height));
    cropSelection.value = {
      x: Math.max(0, Math.min(image.width - width, selection.x)),
      y: Math.max(0, Math.min(image.height - height, selection.y)),
      width,
      height,
    };
  }

  function applyCrop() {
    const image = selectedImage.value;
    const original = cropOriginal.value;
    const selection = cropSelection.value;
    if (image && original && selection) {
      const sourceScaleX = original.cropRect.width / original.frame.width;
      const sourceScaleY = original.cropRect.height / original.frame.height;
      const radians = (image.rotation * Math.PI) / 180;
      const offsetX =
        selection.x * Math.cos(radians) - selection.y * Math.sin(radians);
      const offsetY =
        selection.x * Math.sin(radians) + selection.y * Math.cos(radians);
      mutate("crop-image", () => {
        image.cropRect = {
          x: original.cropRect.x + selection.x * sourceScaleX,
          y: original.cropRect.y + selection.y * sourceScaleY,
          width: selection.width * sourceScaleX,
          height: selection.height * sourceScaleY,
        };
        image.x = original.frame.x + offsetX;
        image.y = original.frame.y + offsetY;
        image.width = selection.width;
        image.height = selection.height;
      });
    }
    cropOriginal.value = null;
    cropSelection.value = null;
    cropRatio.value = undefined;
    tool.value = "select";
  }

  function cancelCrop() {
    cropOriginal.value = null;
    cropSelection.value = null;
    cropRatio.value = undefined;
    tool.value = "select";
  }

  function resetCrop() {
    const image = selectedImage.value;
    if (!image) return;
    const asset = document.assets.find((candidate) => candidate.id === image.assetId);
    if (!asset) return;
    const centerX = image.x + image.width / 2;
    const centerY = image.y + image.height / 2;
    image.cropRect = { x: 0, y: 0, width: asset.width, height: asset.height };
    image.height = image.width * (asset.height / asset.width);
    image.x = centerX - image.width / 2;
    image.y = centerY - image.height / 2;
    markDirty();
    if (tool.value === "crop") enterCrop();
  }

  async function saveProject(platform: ImageToolBoxPlatform) {
    await saveLocal();
    const serializable = serializableDocument();
    const blob = await exportProjectArchive(serializable, assets);
    const result = await platform.saveFile({
      suggestedName: `${safeName(document.name)}.ibox`,
      mimeType: "application/x-imagetoolbox-project",
      bytes: await blob.arrayBuffer(),
      filters: [{ name: "ImageToolBox Project", extensions: ["ibox"] }],
    });
    if (result.saved) showToast("工程已保存 / Project saved");
  }

  async function openProject(platform: ImageToolBoxPlatform) {
    const files = await platform.openFiles({
      accept: ".ibox,application/x-imagetoolbox-project",
      multiple: false,
    });
    if (files[0]) await openProjectBlob(new Blob([files[0].bytes]));
  }

  async function openProjectBlob(blob: Blob) {
    const imported = await importProjectArchive(blob);
    Object.assign(document, imported.document);
    if (document.canvas.background.type === "color") {
      lastCanvasColor.value = document.canvas.background.color;
    }
    selectedIds.value = [];
    for (const [id, asset] of assets) {
      const url = assetUrls.get(id);
      if (url) URL.revokeObjectURL(url);
    }
    assets.clear();
    assetUrls.clear();
    for (const [id, asset] of imported.assets) {
      assets.set(id, asset);
      refreshAssetUrl(id, asset);
    }
    await saveLocal();
    fitCanvas();
    showToast("工程已打开 / Project opened");
  }

  async function exportImage(
    platform: ImageToolBoxPlatform,
    options: {
      format: "image/png" | "image/jpeg" | "image/webp";
      quality: number;
      scale: number;
      selectionOnly: boolean;
    },
  ) {
    const blob = await renderDocument(document, assets, {
      ...options,
      selectedIds: selectedIds.value,
    });
    const extension =
      options.format === "image/jpeg" ? "jpg" : options.format.split("/")[1];
    await platform.saveFile({
      suggestedName: `${safeName(document.name)}.${extension}`,
      mimeType: options.format,
      bytes: await blob.arrayBuffer(),
      filters: [{ name: "Image", extensions: [extension ?? "png"] }],
    });
    showToast("图片已导出 / Image exported");
  }

  function serializableDocument() {
    const result = plainClone(document);
    const bounds = getEffectiveBackgroundBounds(result);
    result.canvas.width = Math.max(1, Math.round(bounds.width));
    result.canvas.height = Math.max(1, Math.round(bounds.height));
    result.canvas.background.bounds = bounds;
    return result;
  }

  async function openTestProject() {
    if (testProjectLoading.value || document.nodes.length) return;
    testProjectLoading.value = true;
    try {
      const paths = [
        `${import.meta.env.BASE_URL}demo/alpine-lake.png`,
        `${import.meta.env.BASE_URL}demo/lavender-field.png`,
      ];
      const demoBlobs = await Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`Unable to load test asset: ${path}`);
          return response.blob();
        }),
      );
      const lake = demoBlobs[0]!;
      const lavender = demoBlobs[1]!;
      const lakeId = await addImageBlob(lake, "湖泊山景.jpg", {
        x: 100,
        y: 105,
        width: 430,
        height: 322,
      });
      await addImageBlob(lavender, "薰衣草花田.jpg", {
        x: 600,
        y: 520,
        width: 370,
        height: 278,
      });
      addNode("text");
      const text = selectedNodes.value[0];
      if (text?.type === "text") {
        updateNode(
          text.id,
          { x: 505, y: 410, width: 280, height: 68, rotation: -6 } as Partial<TextNode>,
        );
      }
      addNode("arrow");
      const arrow = selectedNodes.value[0];
      if (arrow?.type === "arrow") {
        updateNode(
          arrow.id,
          { x: 570, y: 515, width: 120, height: 70 } as Partial<ArrowNode>,
        );
      }
      select(lakeId);
      dirty.value = false;
    } catch (error) {
      console.error(error);
      showToast("测试工程打开失败 / Failed to open test project");
    } finally {
      testProjectLoading.value = false;
    }
  }

  function showToast(message: string) {
    toast.value = message;
    window.setTimeout(() => {
      if (toast.value === message) toast.value = "";
    }, 2_400);
  }

  return {
    document,
    nodes,
    assets,
    assetUrls,
    selectedIds,
    selectedNodes,
    primaryNode,
    selectedImage,
    backgroundSelected,
    backgroundBounds,
    documentBounds,
    effectivePan,
    tool,
    toolPresets,
    textEditRequest,
    inspectorTab,
    mobilePanel,
    zoom,
    viewOffset,
    cropRatio,
    cropSelection,
    temporaryPan,
    dirty,
    saving,
    toast,
    testProjectLoading,
    fitRequest,
    canUndo,
    canRedo,
    setTool,
    renameDocument,
    updateToolPreset,
    resetToolPreset,
    select,
    setCanvasSize,
    swapCanvasSize,
    setCanvasTransparent,
    setCanvasBackgroundColor,
    previewCanvasBackgroundColor,
    setBackgroundAutoSize,
    setBackgroundTransformEnabled,
    toggleBackground,
    transformBackground,
    setTemporaryPan,
    fitCanvas,
    showToast,
    importFiles,
    addNode,
    addTextAt,
    addLinearNode,
    addShapeNode,
    addFreehand,
    updateNode,
    previewNode,
    commitPreviewEdit,
    transformNode,
    deleteSelected,
    duplicateSelected,
    reorderNode,
    moveNodeRelative,
    toggleNode,
    undo,
    redo,
    applyCropRatio,
    adjustCropInset,
    updateCropSelection,
    applyCrop,
    cancelCrop,
    resetCrop,
    saveProject,
    openProject,
    openTestProject,
    exportImage,
    saveLocal,
  };
});

function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s*\/\s*/g, "-") || "image";
}

function clampCanvasDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16_384, Math.round(value)));
}

function backgroundMetadata(background: ImageToolBoxDocument["canvas"]["background"]) {
  return {
    id: background.id,
    name: background.name,
    visible: background.visible,
    locked: background.locked,
    autoSize: background.autoSize,
    transformEnabled: background.transformEnabled,
    bounds: { ...background.bounds },
  };
}

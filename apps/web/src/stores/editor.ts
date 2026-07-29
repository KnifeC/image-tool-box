import { computed, reactive, ref, shallowReactive } from "vue";
import { defineStore } from "pinia";
import {
  cloneDocument,
  createDocument,
  HistoryStack,
  makeId,
  normalizeZIndexes,
  SnapshotCommand,
  type ArrowNode,
  type CanvasConfig,
  type EllipseNode,
  type FreehandNode,
  type ImageNode,
  type ImageToolBoxDocument,
  type LineNode,
  type RectangleNode,
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
  enabled: false,
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
  const inspectorTab = ref<"properties" | "layers">("properties");
  const mobilePanel = ref<"properties" | "layers" | null>(null);
  const zoom = ref(0.55);
  const viewOffset = reactive({ x: 0, y: 0 });
  const cropRatio = ref<number | undefined>();
  const cropOriginal = ref<{
    cropRect: ImageNode["cropRect"];
    frame: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const dirty = ref(false);
  const saving = ref(false);
  const toast = ref("");
  const testProjectLoading = ref(false);
  const fitRequest = ref(0);
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
  const canUndo = computed(() => history.canUndo);
  const canRedo = computed(() => history.canRedo);

  function mutate(type: string, operation: () => void) {
    const before = cloneDocument(plainClone(document));
    operation();
    document.updatedAt = Date.now();
    const after = cloneDocument(plainClone(document));
    history.commit(new SnapshotCommand(type, before, after));
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
      await saveLocalProject(plainClone(document), assets);
      window.localStorage.setItem(CURRENT_PROJECT_KEY, document.id);
      dirty.value = false;
    } finally {
      saving.value = false;
    }
  }

  function setTool(next: EditorTool) {
    if (tool.value === "crop" && next !== "crop") cancelCrop();
    tool.value = next;
    if (next === "crop") enterCrop();
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
    const nextWidth = clampCanvasDimension(width);
    const nextHeight = clampCanvasDimension(height);
    if (
      nextWidth === document.canvas.width &&
      nextHeight === document.canvas.height
    ) {
      return;
    }
    mutate("resize-canvas", () => {
      document.canvas.width = nextWidth;
      document.canvas.height = nextHeight;
    });
    fitCanvas();
  }

  function swapCanvasSize() {
    setCanvasSize(document.canvas.height, document.canvas.width);
  }

  function setCanvasTransparent(transparent: boolean) {
    if (transparent && document.canvas.background.type === "color") {
      lastCanvasColor.value = document.canvas.background.color;
    }
    const background: CanvasConfig["background"] = transparent
      ? { type: "transparent" }
      : { type: "color", color: lastCanvasColor.value };
    if (document.canvas.background.type === background.type) return;
    mutate("change-canvas-background", () => {
      document.canvas.background = background;
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
      document.canvas.background = { type: "color", color };
    });
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
    return nodeId;
  }

  function refreshAssetUrl(id: string, blob: Blob) {
    const old = assetUrls.get(id);
    if (old) URL.revokeObjectURL(old);
    assetUrls.set(id, URL.createObjectURL(blob));
  }

  function addNode(type: Exclude<EditorTool, "select" | "import" | "crop" | "pen" | "highlighter" | "pan">) {
    const centerX = document.canvas.width / 2;
    const centerY = document.canvas.height / 2;
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

  function addFreehand(points: number[], drawTool: "pen" | "highlighter") {
    if (points.length < 4) return;
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
      opacity: drawTool === "pen" ? 1 : 0.32,
      visible: true,
      locked: false,
      zIndex: document.nodes.length,
      points: points.map((value, index) => value - (index % 2 === 0 ? minX : minY)),
      color: drawTool === "pen" ? "#3157f5" : "#f6d74b",
      strokeWidth: drawTool === "pen" ? 6 : 28,
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

  function transformNode(
    id: string,
    patch: Pick<SceneNode, "x" | "y" | "width" | "height" | "rotation">,
  ) {
    updateNode(id, patch);
  }

  function deleteSelected() {
    if (!selectedIds.value.length) return;
    const ids = new Set(selectedIds.value);
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

  function toggleNode(id: string, key: "visible" | "locked") {
    const node = document.nodes.find((candidate) => candidate.id === id);
    if (node) updateNode(id, { [key]: !node[key] } as Partial<SceneNode>);
  }

  function undo() {
    if (history.undo(document)) {
      dirty.value = true;
      selectedIds.value = selectedIds.value.filter((id) =>
        document.nodes.some((node) => node.id === id),
      );
    }
  }

  function redo() {
    if (history.redo(document)) dirty.value = true;
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
  }

  function applyCropRatio(ratio?: number) {
    const image = selectedImage.value;
    if (!image) return;
    cropRatio.value = ratio;
    if (!ratio) return;
    const currentRatio = image.cropRect.width / image.cropRect.height;
    if (currentRatio > ratio) {
      const width = image.cropRect.height * ratio;
      image.cropRect.x += (image.cropRect.width - width) / 2;
      image.cropRect.width = width;
    } else {
      const height = image.cropRect.width / ratio;
      image.cropRect.y += (image.cropRect.height - height) / 2;
      image.cropRect.height = height;
    }
    image.height = image.width / ratio;
    markDirty();
  }

  function adjustCropInset(percent: number) {
    const image = selectedImage.value;
    if (!image) return;
    const asset = document.assets.find((candidate) => candidate.id === image.assetId);
    if (!asset) return;
    const inset = Math.max(0, Math.min(40, percent)) / 100;
    const ratio = cropRatio.value;
    let width = asset.width * (1 - inset * 2);
    let height = asset.height * (1 - inset * 2);
    if (ratio) {
      if (width / height > ratio) width = height * ratio;
      else height = width / ratio;
    }
    image.cropRect = {
      x: (asset.width - width) / 2,
      y: (asset.height - height) / 2,
      width,
      height,
    };
    image.height = image.width * (height / width);
    markDirty();
  }

  function applyCrop() {
    const image = selectedImage.value;
    const original = cropOriginal.value;
    if (image && original) {
      const after = cloneDocument(plainClone(document));
      const before = cloneDocument(plainClone(document));
      const beforeNode = before.nodes.find((node) => node.id === image.id);
      if (beforeNode?.type === "image") {
        beforeNode.cropRect = plainClone(original.cropRect);
        Object.assign(beforeNode, original.frame);
      }
      history.commit(new SnapshotCommand("crop-image", before, after));
      markDirty();
    }
    cropOriginal.value = null;
    tool.value = "select";
  }

  function cancelCrop() {
    const image = selectedImage.value;
    if (image && cropOriginal.value) {
      image.cropRect = plainClone(cropOriginal.value.cropRect);
      Object.assign(image, cropOriginal.value.frame);
    }
    cropOriginal.value = null;
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
  }

  async function saveProject(platform: ImageToolBoxPlatform) {
    await saveLocal();
    const blob = await exportProjectArchive(plainClone(document), assets);
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
    tool,
    inspectorTab,
    mobilePanel,
    zoom,
    viewOffset,
    cropRatio,
    dirty,
    saving,
    toast,
    testProjectLoading,
    fitRequest,
    canUndo,
    canRedo,
    setTool,
    select,
    setCanvasSize,
    swapCanvasSize,
    setCanvasTransparent,
    setCanvasBackgroundColor,
    fitCanvas,
    importFiles,
    addNode,
    addFreehand,
    updateNode,
    transformNode,
    deleteSelected,
    duplicateSelected,
    reorderNode,
    toggleNode,
    undo,
    redo,
    applyCropRatio,
    adjustCropInset,
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

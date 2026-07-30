<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import type Konva from "konva";
import { FolderOpen } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { rectFromPoints } from "@imagetoolbox/editor-core";
import {
  calculatePinchViewport,
  type ViewportPoint,
} from "../canvas-viewport";
import { useEditorStore } from "../stores/editor";

const store = useEditorStore();
const { t } = useI18n();
const wrapper = ref<HTMLDivElement | null>(null);
const stageRef = ref<any>(null);
const transformerRef = ref<any>(null);
const cropRectRef = ref<any>(null);
const cropTransformerRef = ref<any>(null);
const size = ref({ width: 900, height: 700 });
const fitOrigin = ref({ x: 0, y: 0 });
const images = new Map<string, HTMLImageElement>();
const imageVersion = ref(0);
const draftPoints = ref<number[]>([]);
const draftLinear = ref<{
  type: "line" | "arrow";
  start: { x: number; y: number };
  end: { x: number; y: number };
} | null>(null);
const draftShape = ref<{
  type: "rectangle" | "ellipse";
  start: { x: number; y: number };
  end: { x: number; y: number };
  constrainSquare: boolean;
} | null>(null);
const textPlacement = ref<{
  screenStart: { x: number; y: number };
  screenEnd: { x: number; y: number };
  point: { x: number; y: number };
} | null>(null);
const gesture = ref<
  "freehand" | "linear" | "shape" | "text" | "pan" | null
>(null);
const panStart = ref<{
  pointer: { x: number; y: number };
  offset: { x: number; y: number };
} | null>(null);
const touchNavigationActive = ref(false);
let pinchState: {
  center: ViewportPoint;
  distance: number;
} | null = null;
let resizeObserver: ResizeObserver | null = null;
const checkerboardPattern = createCheckerboardPattern();

const activeBounds = computed(() => store.documentBounds ?? store.backgroundBounds);
const stagePosition = computed(() => ({
  x: fitOrigin.value.x + store.viewOffset.x,
  y: fitOrigin.value.y + store.viewOffset.y,
}));
const stageCursor = computed(() =>
  store.effectivePan
    ? gesture.value === "pan"
      ? "grabbing"
      : "grab"
    : ["rectangle", "ellipse", "line", "arrow", "pen", "highlighter"].includes(
          store.tool,
        )
      ? "crosshair"
      : store.tool === "text"
        ? "text"
      : "default",
);
const draftShapeBounds = computed(() =>
  draftShape.value
    ? rectFromPoints(
        draftShape.value.start,
        draftShape.value.end,
        draftShape.value.constrainSquare,
      )
    : null,
);
const keepSelectionRatio = computed(
  () =>
    store.selectedNodes.length > 0 &&
    store.selectedNodes.every((node) => node.type === "image"),
);

const backgroundColor = computed(() =>
  store.document.canvas.background.type === "color"
    ? store.document.canvas.background.color
    : undefined,
);

const backgroundPattern = computed(() =>
  store.document.canvas.background.type === "transparent"
    ? checkerboardPattern
    : undefined,
);

const canTransformBackground = computed(
  () =>
    store.document.canvas.background.transformEnabled &&
    !store.document.canvas.background.locked &&
    !store.document.canvas.background.autoSize,
);

watchEffect(() => {
  imageVersion.value;
  for (const [assetId, url] of store.assetUrls) {
    const current = images.get(assetId);
    if (current?.src === url) continue;
    const image = new Image();
    image.onload = () => {
      images.set(assetId, image);
      imageVersion.value += 1;
    };
    image.src = url;
  }
});

watch(
  () => [
    store.selectedIds.slice(),
    store.tool,
    store.nodes.length,
    canTransformBackground.value,
    store.cropSelection,
  ],
  async () => {
    await nextTick();
    const transformer = transformerRef.value?.getNode?.();
    const cropTransformer = cropTransformerRef.value?.getNode?.();
    const stage = stageRef.value?.getNode?.();
    if (transformer && stage) {
      if (store.tool === "crop" || store.tool !== "select") {
        transformer.nodes([]);
      } else {
        const selected = store.selectedIds
          .filter(
            (id) =>
              id !== "background" ||
              canTransformBackground.value,
          )
          .map((id) => stage.findOne(`#${id}`))
          .filter(Boolean);
        transformer.nodes(selected);
        transformer.getLayer()?.batchDraw();
      }
    }
    if (cropTransformer) {
      const cropNode = cropRectRef.value?.getNode?.();
      cropTransformer.nodes(
        store.tool === "crop" && cropNode ? [cropNode] : [],
      );
      cropTransformer.getLayer()?.batchDraw();
    }
  },
  { deep: true },
);

watch(
  () => [
    size.value.width,
    size.value.height,
    store.fitRequest,
  ],
  () => {
    const padding = size.value.width <= 560 ? 32 : 72;
    const nextZoom = Math.min(
      (size.value.width - padding) / activeBounds.value.width,
      (size.value.height - padding) / activeBounds.value.height,
      1,
    );
    store.zoom = Math.max(0.1, Math.min(3, nextZoom));
    fitOrigin.value = {
      x:
        (size.value.width - activeBounds.value.width * store.zoom) / 2 -
        activeBounds.value.x * store.zoom,
      y:
        (size.value.height - activeBounds.value.height * store.zoom) / 2 -
        activeBounds.value.y * store.zoom,
    };
    store.viewOffset.x = 0;
    store.viewOffset.y = 0;
  },
  { flush: "post" },
);

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    size.value = {
      width: Math.max(320, entry.contentRect.width),
      height: Math.max(320, entry.contentRect.height),
    };
  });
  if (wrapper.value) resizeObserver.observe(wrapper.value);
  window.addEventListener("mouseup", finishGesture);
  window.addEventListener("touchend", onWindowTouchEnd);
  window.addEventListener("touchcancel", onWindowTouchEnd);
  window.addEventListener("blur", cancelAllGestures);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("mouseup", finishGesture);
  window.removeEventListener("touchend", onWindowTouchEnd);
  window.removeEventListener("touchcancel", onWindowTouchEnd);
  window.removeEventListener("blur", cancelAllGestures);
});

function imageFor(assetId: string) {
  imageVersion.value;
  return images.get(assetId);
}

function onWheel(event: any) {
  event.evt.preventDefault();
  const stage = stageRef.value.getNode();
  const pointer = stage.getPointerPosition();
  if (!pointer) return;
  const previous = store.zoom;
  const direction = event.evt.deltaY > 0 ? -1 : 1;
  const next = Math.max(0.1, Math.min(3, previous + direction * 0.05));
  const mousePoint = {
    x: (pointer.x - stagePosition.value.x) / previous,
    y: (pointer.y - stagePosition.value.y) / previous,
  };
  store.viewOffset.x += mousePoint.x * (previous - next);
  store.viewOffset.y += mousePoint.y * (previous - next);
  store.zoom = next;
}

function onStageTouchStart(event: any) {
  const touchEvent = event.evt as TouchEvent;
  if (touchEvent.touches.length < 2 && !touchNavigationActive.value) {
    onStagePointerDown(event);
    return;
  }

  touchEvent.preventDefault();
  if (!touchNavigationActive.value) {
    touchNavigationActive.value = true;
    cancelGesture();
    stopActiveDrags(event.target.getStage());
  }
  pinchState = pinchDetails(event.target.getStage(), touchEvent.touches);
}

function onStageTouchMove(event: any) {
  const touchEvent = event.evt as TouchEvent;
  if (!touchNavigationActive.value && touchEvent.touches.length < 2) {
    onStagePointerMove(event);
    return;
  }

  touchEvent.preventDefault();
  if (!touchNavigationActive.value) {
    touchNavigationActive.value = true;
    cancelGesture();
    stopActiveDrags(event.target.getStage());
  }

  const stage = event.target.getStage() as Konva.Stage;
  const current = pinchDetails(stage, touchEvent.touches);
  if (!current) {
    pinchState = null;
    return;
  }
  if (!pinchState || pinchState.distance === 0 || current.distance === 0) {
    pinchState = current;
    return;
  }

  const viewport = calculatePinchViewport({
    zoom: store.zoom,
    layerPosition: stagePosition.value,
    fitOrigin: fitOrigin.value,
    previousCenter: pinchState.center,
    currentCenter: current.center,
    scaleFactor: current.distance / pinchState.distance,
    minZoom: 0.1,
    maxZoom: 3,
  });
  store.zoom = viewport.zoom;
  store.viewOffset.x = viewport.viewOffset.x;
  store.viewOffset.y = viewport.viewOffset.y;
  pinchState = current;
}

function onStageTouchEnd(event: any) {
  const touchEvent = event.evt as TouchEvent;
  if (!touchNavigationActive.value) {
    finishGesture();
    return;
  }

  touchEvent.preventDefault();
  if (touchEvent.touches.length >= 2) {
    pinchState = pinchDetails(event.target.getStage(), touchEvent.touches);
  } else if (touchEvent.touches.length === 0) {
    endTouchNavigation();
  } else {
    pinchState = null;
  }
}

function onWindowTouchEnd(event: TouchEvent) {
  if (!touchNavigationActive.value) {
    finishGesture();
    return;
  }
  if (event.touches.length === 0) endTouchNavigation();
}

function endTouchNavigation() {
  touchNavigationActive.value = false;
  pinchState = null;
}

function cancelAllGestures() {
  cancelGesture();
  endTouchNavigation();
}

function pinchDetails(
  stage: Konva.Stage,
  touches: TouchList,
): { center: ViewportPoint; distance: number } | null {
  const first = touches.item(0);
  const second = touches.item(1);
  if (!first || !second) return null;

  const bounds = stage.container().getBoundingClientRect();
  const scaleX = bounds.width > 0 ? stage.width() / bounds.width : 1;
  const scaleY = bounds.height > 0 ? stage.height() / bounds.height : 1;
  const firstPoint = {
    x: (first.clientX - bounds.left) * scaleX,
    y: (first.clientY - bounds.top) * scaleY,
  };
  const secondPoint = {
    x: (second.clientX - bounds.left) * scaleX,
    y: (second.clientY - bounds.top) * scaleY,
  };

  return {
    center: {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    },
    distance: Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    ),
  };
}

function stopActiveDrags(stage: Konva.Stage) {
  const draggingNodes = stage.find((node: Konva.Node) => node.isDragging());
  for (const node of draggingNodes) node.stopDrag();
  if (stage.isDragging()) stage.stopDrag();
}

function onStagePointerDown(event: any) {
  const stage = event.target.getStage();
  const screenPoint = stage.getPointerPosition();
  if (!screenPoint || gesture.value) return;
  event.evt?.preventDefault?.();
  if (store.effectivePan) {
    gesture.value = "pan";
    panStart.value = {
      pointer: screenPoint,
      offset: { ...store.viewOffset },
    };
    return;
  }
  const point = documentPoint(stage);
  if (!point) return;
  if (store.tool === "text") {
    gesture.value = "text";
    textPlacement.value = {
      screenStart: screenPoint,
      screenEnd: screenPoint,
      point,
    };
    return;
  }
  if (store.tool === "pen" || store.tool === "highlighter") {
    gesture.value = "freehand";
    draftPoints.value = [point.x, point.y];
    return;
  }
  if (store.tool === "line" || store.tool === "arrow") {
    gesture.value = "linear";
    draftLinear.value = {
      type: store.tool,
      start: point,
      end: point,
    };
    return;
  }
  if (store.tool === "rectangle" || store.tool === "ellipse") {
    gesture.value = "shape";
    draftShape.value = {
      type: store.tool,
      start: point,
      end: point,
      constrainSquare: Boolean(event.evt?.shiftKey),
    };
    return;
  }
  if (event.target === stage) store.select(null);
}

function onStagePointerMove(event: any) {
  const stage = event.target.getStage();
  if (gesture.value === "pan" && panStart.value) {
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    store.viewOffset.x =
      panStart.value.offset.x + pointer.x - panStart.value.pointer.x;
    store.viewOffset.y =
      panStart.value.offset.y + pointer.y - panStart.value.pointer.y;
    return;
  }
  if (gesture.value === "text" && textPlacement.value) {
    const pointer = stage.getPointerPosition();
    if (pointer) {
      textPlacement.value = {
        ...textPlacement.value,
        screenEnd: pointer,
      };
    }
    return;
  }
  const point = documentPoint(stage);
  if (!point) return;
  if (gesture.value === "freehand") {
    const points = draftPoints.value;
    const lastX = points.at(-2) ?? point.x;
    const lastY = points.at(-1) ?? point.y;
    const minimumDistance = 2 / store.zoom;
    if (Math.hypot(point.x - lastX, point.y - lastY) < minimumDistance) return;
    draftPoints.value = [...points, point.x, point.y];
  } else if (gesture.value === "linear" && draftLinear.value) {
    draftLinear.value = { ...draftLinear.value, end: point };
  } else if (gesture.value === "shape" && draftShape.value) {
    draftShape.value = {
      ...draftShape.value,
      end: point,
      constrainSquare: Boolean(event.evt?.shiftKey),
    };
  }
}

function finishGesture() {
  if (gesture.value === "text" && textPlacement.value) {
    const { screenStart, screenEnd, point } = textPlacement.value;
    if (
      Math.hypot(
        screenEnd.x - screenStart.x,
        screenEnd.y - screenStart.y,
      ) < 4
    ) {
      store.addTextAt(point);
    }
  } else if (gesture.value === "freehand" && draftPoints.value.length >= 4) {
    const drawTool =
      store.tool === "highlighter" ? "highlighter" : "pen";
    store.addFreehand(draftPoints.value, drawTool);
  } else if (gesture.value === "linear" && draftLinear.value) {
    const { type, start, end } = draftLinear.value;
    if (Math.hypot(end.x - start.x, end.y - start.y) * store.zoom >= 4) {
      store.addLinearNode(type, start, end);
    }
  } else if (gesture.value === "shape" && draftShape.value) {
    const { type, start, end, constrainSquare } = draftShape.value;
    const bounds = rectFromPoints(start, end, constrainSquare);
    if (
      bounds.width * store.zoom >= 4 &&
      bounds.height * store.zoom >= 4
    ) {
      store.addShapeNode(type, start, end, constrainSquare);
    }
  }
  gesture.value = null;
  panStart.value = null;
  draftPoints.value = [];
  draftLinear.value = null;
  draftShape.value = null;
  textPlacement.value = null;
}

function cancelGesture() {
  gesture.value = null;
  panStart.value = null;
  draftPoints.value = [];
  draftLinear.value = null;
  draftShape.value = null;
  textPlacement.value = null;
}

function documentPoint(stage: Konva.Stage) {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  return {
    x: (pointer.x - stagePosition.value.x) / store.zoom,
    y: (pointer.y - stagePosition.value.y) / store.zoom,
  };
}

function selectNode(event: any, id: string) {
  if (store.tool !== "select") return;
  if (((event.evt as TouchEvent | undefined)?.touches?.length ?? 0) > 1) return;
  event.cancelBubble = true;
  store.select(id, Boolean(event.evt?.shiftKey));
}

function transformEnd(event: any, id: string) {
  const target = event.target;
  const width = Math.max(1, target.width() * target.scaleX());
  const height = Math.max(1, target.height() * target.scaleY());
  target.scaleX(1);
  target.scaleY(1);
  store.transformNode(id, {
    x: target.x(),
    y: target.y(),
    width,
    height,
    rotation: target.rotation(),
  });
}

function backgroundTransformEnd(event: any) {
  const target = event.target;
  const width = Math.max(1, target.width() * target.scaleX());
  const height = Math.max(1, target.height() * target.scaleY());
  target.scaleX(1);
  target.scaleY(1);
  store.transformBackground({
    x: target.x(),
    y: target.y(),
    width,
    height,
  });
}

function backgroundDragEnd(event: any) {
  store.transformBackground({
    ...store.backgroundBounds,
    x: event.target.x(),
    y: event.target.y(),
  });
}

function dragEnd(event: any, id: string) {
  const node = store.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  store.transformNode(id, {
    x: event.target.x(),
    y: event.target.y(),
    width: node.width,
    height: node.height,
    rotation: node.rotation,
  });
}

function cropDragEnd(event: any) {
  const selection = store.cropSelection;
  if (!selection) return;
  store.updateCropSelection({
    ...selection,
    x: event.target.x(),
    y: event.target.y(),
  });
}

function cropTransformEnd(event: any) {
  const target = event.target;
  const selection = store.cropSelection;
  if (!selection) return;
  const width = Math.max(1, target.width() * target.scaleX());
  const height = Math.max(1, target.height() * target.scaleY());
  target.scaleX(1);
  target.scaleY(1);
  store.updateCropSelection({
    x: target.x(),
    y: target.y(),
    width,
    height,
  });
}

function colorWithOpacity(color: string, opacity: number) {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function createCheckerboardPattern() {
  const pattern = document.createElement("canvas");
  const cellSize = 12;
  pattern.width = cellSize * 2;
  pattern.height = cellSize * 2;
  const context = pattern.getContext("2d");
  if (!context) return pattern;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pattern.width, pattern.height);
  context.fillStyle = "#e5e7eb";
  context.fillRect(0, 0, cellSize, cellSize);
  context.fillRect(cellSize, cellSize, cellSize, cellSize);
  return pattern;
}
</script>

<template>
  <main ref="wrapper" class="workspace" :style="{ cursor: stageCursor }">
    <v-stage
      ref="stageRef"
      :config="{ width: size.width, height: size.height }"
      @wheel="onWheel"
      @mousedown="onStagePointerDown"
      @touchstart="onStageTouchStart"
      @mousemove="onStagePointerMove"
      @touchmove="onStageTouchMove"
      @mouseup="finishGesture"
      @touchend="onStageTouchEnd"
      @touchcancel="onStageTouchEnd"
    >
      <v-layer
        :config="{
          x: stagePosition.x,
          y: stagePosition.y,
          scaleX: store.zoom,
          scaleY: store.zoom,
        }"
      >
        <v-rect
          v-if="store.document.canvas.background.visible"
          :config="{
            id: store.document.canvas.background.id,
            x: store.backgroundBounds.x,
            y: store.backgroundBounds.y,
            width: store.backgroundBounds.width,
            height: store.backgroundBounds.height,
            fill: backgroundColor,
            fillPatternImage: backgroundPattern,
            fillPatternRepeat: 'repeat',
            shadowColor: '#64748b',
            shadowBlur: 24,
            shadowOpacity: 0.18,
            shadowOffsetY: 8,
            listening:
              store.tool === 'select' &&
              canTransformBackground,
            draggable:
              store.tool === 'select' &&
              canTransformBackground,
          }"
          @mousedown="selectNode($event, store.document.canvas.background.id)"
          @touchstart="selectNode($event, store.document.canvas.background.id)"
          @dragend="backgroundDragEnd"
          @transformend="backgroundTransformEnd"
        />

        <template v-for="node in store.nodes" :key="node.id">
          <v-image
            v-if="node.type === 'image' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              rotation: node.rotation,
              opacity: node.opacity,
              image: imageFor(node.assetId),
              cropX: node.cropRect.x,
              cropY: node.cropRect.y,
              cropWidth: node.cropRect.width,
              cropHeight: node.cropRect.height,
              scaleX: node.flipX ? -1 : 1,
              scaleY: node.flipY ? -1 : 1,
              offsetX: node.flipX ? node.width : 0,
              offsetY: node.flipY ? node.height : 0,
              cornerRadius: node.cornerRadius,
              stroke: node.border.enabled ? node.border.color : undefined,
              strokeWidth: node.border.enabled ? node.border.width : 0,
              dash: node.border.style === 'dashed' ? [10, 8] : undefined,
              shadowEnabled: node.shadow.enabled,
              shadowColor: node.shadow.color,
              shadowBlur: node.shadow.blur,
              shadowOpacity: node.shadow.opacity,
              shadowOffsetX: node.shadow.offsetX,
              shadowOffsetY: node.shadow.offsetY,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
            @transformend="transformEnd($event, node.id)"
          />
          <v-rect
            v-else-if="node.type === 'rectangle' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              rotation: node.rotation,
              opacity: node.opacity,
              fill: node.style.fill.enabled
                ? colorWithOpacity(
                    node.style.fill.color,
                    node.style.fill.opacity,
                  )
                : undefined,
              fillEnabled: node.style.fill.enabled,
              fillAfterStrokeEnabled: true,
              stroke: node.style.stroke.enabled ? node.style.stroke.color : undefined,
              strokeWidth: node.style.stroke.enabled ? node.style.stroke.width : 0,
              dash: node.style.stroke.style === 'dashed' ? [10, 8] : undefined,
              cornerRadius: node.cornerRadius,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
            @transformend="transformEnd($event, node.id)"
          />
          <v-ellipse
            v-else-if="node.type === 'ellipse' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              radiusX: node.width / 2,
              radiusY: node.height / 2,
              offsetX: -node.width / 2,
              offsetY: -node.height / 2,
              rotation: node.rotation,
              opacity: node.opacity,
              fill: node.style.fill.enabled
                ? colorWithOpacity(
                    node.style.fill.color,
                    node.style.fill.opacity,
                  )
                : undefined,
              stroke: node.style.stroke.enabled
                ? node.style.stroke.color
                : undefined,
              strokeWidth: node.style.stroke.enabled
                ? node.style.stroke.width
                : 0,
              dash:
                node.style.stroke.style === 'dashed'
                  ? [10, 8]
                  : undefined,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
            @transformend="transformEnd($event, node.id)"
          />
          <v-line
            v-else-if="node.type === 'line' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              points: node.points,
              rotation: node.rotation,
              opacity: node.opacity,
              stroke: node.stroke.color,
              strokeWidth: node.stroke.width,
              dash: node.stroke.style === 'dashed' ? [10, 8] : undefined,
              lineCap: 'round',
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
          />
          <v-arrow
            v-else-if="node.type === 'arrow' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              points: node.points,
              rotation: node.rotation,
              opacity: node.opacity,
              stroke: node.stroke.color,
              fill: node.stroke.color,
              strokeWidth: node.stroke.width,
              dash: node.stroke.style === 'dashed' ? [10, 8] : undefined,
              pointerLength: node.pointerLength,
              pointerWidth: node.pointerWidth,
              pointerAtBeginning: node.arrowStart,
              pointerAtEnding: node.arrowEnd,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
          />
          <v-text
            v-else-if="node.type === 'text' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              rotation: node.rotation,
              opacity: node.opacity,
              text: node.text,
              fontFamily: node.fontFamily,
              fontSize: node.fontSize,
              fontStyle: `${node.fontStyle} ${node.fontWeight}`,
              fill: node.color,
              lineHeight: node.lineHeight,
              letterSpacing: node.letterSpacing,
              align: node.align,
              stroke: node.textStroke.enabled ? node.textStroke.color : undefined,
              strokeWidth: node.textStroke.enabled ? node.textStroke.width : 0,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
            @transformend="transformEnd($event, node.id)"
          />
          <v-line
            v-else-if="node.type === 'freehand' && node.visible"
            :config="{
              id: node.id,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              rotation: node.rotation,
              opacity: node.opacity,
              points: node.points,
              stroke: node.color,
              strokeWidth: node.strokeWidth,
              lineCap: 'round',
              lineJoin: 'round',
              tension: 0.35,
              draggable: store.tool === 'select' && !node.locked,
            }"
            @mousedown="selectNode($event, node.id)"
            @touchstart="selectNode($event, node.id)"
            @dragend="dragEnd($event, node.id)"
          />
        </template>

        <v-line
          v-if="draftPoints.length"
          :config="{
            points: draftPoints,
            stroke:
              store.tool === 'highlighter'
                ? store.toolPresets.highlighter.color
                : store.toolPresets.pen.color,
            opacity:
              store.tool === 'highlighter'
                ? store.toolPresets.highlighter.opacity
                : store.toolPresets.pen.opacity,
            strokeWidth:
              store.tool === 'highlighter'
                ? store.toolPresets.highlighter.width
                : store.toolPresets.pen.width,
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.35,
            listening: false,
          }"
        />

        <v-arrow
          v-if="draftLinear?.type === 'arrow'"
          :config="{
            points: [
              draftLinear.start.x,
              draftLinear.start.y,
              draftLinear.end.x,
              draftLinear.end.y,
            ],
            stroke: store.toolPresets.arrow.color,
            fill: store.toolPresets.arrow.color,
            strokeWidth: store.toolPresets.arrow.width,
            dash:
              store.toolPresets.arrow.style === 'dashed'
                ? [10, 8]
                : undefined,
            pointerLength: store.toolPresets.arrow.pointerLength,
            pointerWidth: store.toolPresets.arrow.pointerWidth,
            lineCap: 'round',
            listening: false,
          }"
        />
        <v-line
          v-else-if="draftLinear"
          :config="{
            points: [
              draftLinear.start.x,
              draftLinear.start.y,
              draftLinear.end.x,
              draftLinear.end.y,
            ],
            stroke: store.toolPresets.line.color,
            strokeWidth: store.toolPresets.line.width,
            dash:
              store.toolPresets.line.style === 'dashed'
                ? [10, 8]
                : undefined,
            lineCap: 'round',
            listening: false,
          }"
        />

        <v-rect
          v-if="draftShape?.type === 'rectangle' && draftShapeBounds"
          :config="{
            ...draftShapeBounds,
            fill: store.toolPresets.rectangle.style.fill.enabled
              ? colorWithOpacity(
                  store.toolPresets.rectangle.style.fill.color,
                  store.toolPresets.rectangle.style.fill.opacity,
                )
              : undefined,
            stroke: store.toolPresets.rectangle.style.stroke.enabled
              ? store.toolPresets.rectangle.style.stroke.color
              : undefined,
            strokeWidth: store.toolPresets.rectangle.style.stroke.enabled
              ? store.toolPresets.rectangle.style.stroke.width
              : 0,
            dash:
              store.toolPresets.rectangle.style.stroke.style === 'dashed'
                ? [10, 8]
                : undefined,
            cornerRadius: store.toolPresets.rectangle.cornerRadius,
            listening: false,
          }"
        />
        <v-ellipse
          v-else-if="draftShape?.type === 'ellipse' && draftShapeBounds"
          :config="{
            x: draftShapeBounds.x + draftShapeBounds.width / 2,
            y: draftShapeBounds.y + draftShapeBounds.height / 2,
            radiusX: draftShapeBounds.width / 2,
            radiusY: draftShapeBounds.height / 2,
            fill: store.toolPresets.ellipse.style.fill.enabled
              ? colorWithOpacity(
                  store.toolPresets.ellipse.style.fill.color,
                  store.toolPresets.ellipse.style.fill.opacity,
                )
              : undefined,
            stroke: store.toolPresets.ellipse.style.stroke.enabled
              ? store.toolPresets.ellipse.style.stroke.color
              : undefined,
            strokeWidth: store.toolPresets.ellipse.style.stroke.enabled
              ? store.toolPresets.ellipse.style.stroke.width
              : 0,
            dash:
              store.toolPresets.ellipse.style.stroke.style === 'dashed'
                ? [10, 8]
                : undefined,
            listening: false,
          }"
        />

        <v-group
          v-if="
            store.tool === 'crop' &&
            store.selectedImage &&
            store.cropSelection
          "
          :config="{
            x: store.selectedImage.x,
            y: store.selectedImage.y,
            rotation: store.selectedImage.rotation,
          }"
        >
          <v-rect
            v-for="mask in [
              { x: 0, y: 0, width: store.selectedImage.width, height: store.cropSelection.y },
              {
                x: 0,
                y: store.cropSelection.y + store.cropSelection.height,
                width: store.selectedImage.width,
                height:
                  store.selectedImage.height -
                  store.cropSelection.y -
                  store.cropSelection.height,
              },
              {
                x: 0,
                y: store.cropSelection.y,
                width: store.cropSelection.x,
                height: store.cropSelection.height,
              },
              {
                x: store.cropSelection.x + store.cropSelection.width,
                y: store.cropSelection.y,
                width:
                  store.selectedImage.width -
                  store.cropSelection.x -
                  store.cropSelection.width,
                height: store.cropSelection.height,
              },
            ]"
            :key="`${mask.x}-${mask.y}-${mask.width}-${mask.height}`"
            :config="{
              ...mask,
              fill: 'rgba(10, 15, 28, 0.48)',
              listening: false,
            }"
          />
          <v-rect
            ref="cropRectRef"
            :config="{
              id: 'crop-selection',
              x: store.cropSelection.x,
              y: store.cropSelection.y,
              width: store.cropSelection.width,
              height: store.cropSelection.height,
              fill: 'rgba(255,255,255,0.01)',
              stroke: '#ffffff',
              strokeWidth: 2 / store.zoom,
              draggable: true,
            }"
            @dragend="cropDragEnd"
            @transformend="cropTransformEnd"
            @dblclick="store.applyCrop"
            @dbltap="store.applyCrop"
          />
          <v-line
            v-for="fraction in [1 / 3, 2 / 3]"
            :key="`crop-v-${fraction}`"
            :config="{
              points: [
                store.cropSelection.x + store.cropSelection.width * fraction,
                store.cropSelection.y,
                store.cropSelection.x + store.cropSelection.width * fraction,
                store.cropSelection.y + store.cropSelection.height,
              ],
              stroke: '#ffffff',
              strokeWidth: 1 / store.zoom,
              dash: [7 / store.zoom, 7 / store.zoom],
              listening: false,
            }"
          />
          <v-line
            v-for="fraction in [1 / 3, 2 / 3]"
            :key="`crop-h-${fraction}`"
            :config="{
              points: [
                store.cropSelection.x,
                store.cropSelection.y + store.cropSelection.height * fraction,
                store.cropSelection.x + store.cropSelection.width,
                store.cropSelection.y + store.cropSelection.height * fraction,
              ],
              stroke: '#ffffff',
              strokeWidth: 1 / store.zoom,
              dash: [7 / store.zoom, 7 / store.zoom],
              listening: false,
            }"
          />
          <v-transformer
            ref="cropTransformerRef"
            :config="{
              rotateEnabled: false,
              keepRatio: false,
              flipEnabled: false,
              borderStroke: '#ffffff',
              borderStrokeWidth: 2 / store.zoom,
              anchorFill: '#ffffff',
              anchorStroke: '#3157f5',
              anchorStrokeWidth: 2 / store.zoom,
              anchorSize: 11 / store.zoom,
              enabledAnchors: [
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
                'middle-left',
                'middle-right',
                'top-center',
                'bottom-center',
              ],
            }"
          />
        </v-group>

        <v-transformer
          ref="transformerRef"
          :config="{
            borderStroke: '#3157f5',
            borderStrokeWidth: 2 / store.zoom,
            anchorFill: '#ffffff',
            anchorStroke: '#3157f5',
            anchorStrokeWidth: 2 / store.zoom,
            anchorSize: 10 / store.zoom,
            rotateAnchorOffset: 32 / store.zoom,
            rotateEnabled: !store.backgroundSelected,
            keepRatio: keepSelectionRatio,
            enabledAnchors: [
              'top-left',
              'top-right',
              'bottom-left',
              'bottom-right',
              'middle-left',
              'middle-right',
              'top-center',
              'bottom-center',
            ],
          }"
        />
      </v-layer>
    </v-stage>
    <div v-if="!store.nodes.length" class="workspace-empty">
      <p>{{ t("canvas.empty") }}</p>
      <button
        type="button"
        :disabled="store.testProjectLoading"
        @click="store.openTestProject"
      >
        <FolderOpen :size="19" />
        {{ store.testProjectLoading ? t("canvas.opening") : t("canvas.openTestProject") }}
      </button>
      <p class="workspace-empty-hint">{{ t("canvas.startDirectly") }}</p>
    </div>
    <div v-if="store.tool === 'crop'" class="crop-mode-label">
      {{ t("canvas.cropMode") }}
    </div>
    <div v-else-if="store.tool === 'text'" class="crop-mode-label">
      {{ t("canvas.placeText") }}
    </div>
    <div
      v-else-if="store.tool === 'rectangle' || store.tool === 'ellipse'"
      class="crop-mode-label"
    >
      {{
        t("canvas.drawShape", {
          shape: t(store.tool),
          lockedShape:
            store.tool === "rectangle" ? t("canvas.square") : t("canvas.circle"),
        })
      }}
    </div>
  </main>
</template>

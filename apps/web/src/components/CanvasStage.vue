<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import type Konva from "konva";
import { FolderOpen } from "lucide-vue-next";
import { useEditorStore } from "../stores/editor";

const store = useEditorStore();
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
const gesture = ref<"freehand" | "linear" | "pan" | null>(null);
const panStart = ref<{
  pointer: { x: number; y: number };
  offset: { x: number; y: number };
} | null>(null);
let resizeObserver: ResizeObserver | null = null;
const checkerboardPattern = createCheckerboardPattern();

const activeBounds = computed(() => store.documentBounds ?? store.backgroundBounds);
const stagePosition = computed(() => ({
  x: fitOrigin.value.x + store.viewOffset.x,
  y: fitOrigin.value.y + store.viewOffset.y,
}));
const stageCursor = computed(() =>
  store.effectivePan ? (gesture.value === "pan" ? "grabbing" : "grab") : "default",
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
    store.document.canvas.background.locked,
    store.document.canvas.background.autoSize,
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
              (!store.document.canvas.background.locked &&
                !store.document.canvas.background.autoSize),
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
  window.addEventListener("touchend", finishGesture);
  window.addEventListener("blur", cancelGesture);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("mouseup", finishGesture);
  window.removeEventListener("touchend", finishGesture);
  window.removeEventListener("blur", cancelGesture);
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
  }
}

function finishGesture() {
  if (gesture.value === "freehand" && draftPoints.value.length >= 4) {
    const drawTool =
      store.tool === "highlighter" ? "highlighter" : "pen";
    store.addFreehand(draftPoints.value, drawTool);
  } else if (gesture.value === "linear" && draftLinear.value) {
    const { type, start, end } = draftLinear.value;
    if (Math.hypot(end.x - start.x, end.y - start.y) * store.zoom >= 4) {
      store.addLinearNode(type, start, end);
    }
  }
  gesture.value = null;
  panStart.value = null;
  draftPoints.value = [];
  draftLinear.value = null;
}

function cancelGesture() {
  gesture.value = null;
  panStart.value = null;
  draftPoints.value = [];
  draftLinear.value = null;
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
      @touchstart="onStagePointerDown"
      @mousemove="onStagePointerMove"
      @touchmove="onStagePointerMove"
      @mouseup="finishGesture"
      @touchend="finishGesture"
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
              !store.document.canvas.background.locked &&
              !store.document.canvas.background.autoSize,
            draggable:
              store.tool === 'select' &&
              !store.document.canvas.background.locked &&
              !store.document.canvas.background.autoSize,
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
              fill: node.style.fill.enabled ? node.style.fill.color : undefined,
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
              x: node.x + node.width / 2,
              y: node.y + node.height / 2,
              radiusX: node.width / 2,
              radiusY: node.height / 2,
              rotation: node.rotation,
              opacity: node.opacity,
              fill: node.style.fill.enabled ? node.style.fill.color : undefined,
              stroke: node.style.stroke.enabled ? node.style.stroke.color : undefined,
              strokeWidth: node.style.stroke.enabled ? node.style.stroke.width : 0,
              dash: node.style.stroke.style === 'dashed' ? [10, 8] : undefined,
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
            stroke: store.tool === 'highlighter' ? '#f6d74b' : '#3157f5',
            opacity: store.tool === 'highlighter' ? 0.32 : 1,
            strokeWidth: store.tool === 'highlighter' ? 28 : 6,
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
            stroke: '#f05252',
            fill: '#f05252',
            strokeWidth: 4,
            pointerLength: 16,
            pointerWidth: 14,
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
            stroke: '#3157f5',
            strokeWidth: 4,
            lineCap: 'round',
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
            keepRatio: true,
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
      <p>画布还是空的</p>
      <button
        type="button"
        :disabled="store.testProjectLoading"
        @click="store.openTestProject"
      >
        <FolderOpen :size="19" />
        {{ store.testProjectLoading ? "正在打开…" : "打开测试工程" }}
      </button>
    </div>
    <div v-if="store.tool === 'crop'" class="crop-mode-label">
      裁剪模式 / Crop mode
    </div>
  </main>
</template>

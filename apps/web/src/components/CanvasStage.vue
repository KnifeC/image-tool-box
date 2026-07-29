<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import type Konva from "konva";
import { FolderOpen } from "lucide-vue-next";
import { useEditorStore } from "../stores/editor";

const store = useEditorStore();
const wrapper = ref<HTMLDivElement | null>(null);
const stageRef = ref<any>(null);
const transformerRef = ref<any>(null);
const size = ref({ width: 900, height: 700 });
const images = new Map<string, HTMLImageElement>();
const imageVersion = ref(0);
const drawing = ref(false);
const draftPoints = ref<number[]>([]);
let resizeObserver: ResizeObserver | null = null;
const checkerboardPattern = createCheckerboardPattern();

const stagePosition = computed(() => ({
  x: (size.value.width - store.document.canvas.width * store.zoom) / 2 + store.viewOffset.x,
  y: (size.value.height - store.document.canvas.height * store.zoom) / 2 + store.viewOffset.y,
}));

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
  () => [store.selectedIds.slice(), store.tool, store.nodes.length],
  async () => {
    await nextTick();
    const transformer = transformerRef.value?.getNode?.();
    const stage = stageRef.value?.getNode?.();
    if (!transformer || !stage || store.tool === "crop") return transformer?.nodes([]);
    const selected = store.selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter(Boolean);
    transformer.nodes(selected);
    transformer.getLayer()?.batchDraw();
  },
  { deep: true },
);

watch(
  () => [
    size.value.width,
    size.value.height,
    store.document.canvas.width,
    store.document.canvas.height,
    store.fitRequest,
  ],
  () => {
    const padding = size.value.width <= 560 ? 32 : 72;
    const nextZoom = Math.min(
      (size.value.width - padding) / store.document.canvas.width,
      (size.value.height - padding) / store.document.canvas.height,
      1,
    );
    store.zoom = Math.max(0.1, Math.min(3, nextZoom));
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
});

onBeforeUnmount(() => resizeObserver?.disconnect());

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
  if (store.tool === "pen" || store.tool === "highlighter") {
    const point = documentPoint(stage);
    if (!point) return;
    drawing.value = true;
    draftPoints.value = [point.x, point.y];
    return;
  }
  if (event.target === stage) store.select(null);
}

function onStagePointerMove(event: any) {
  if (!drawing.value) return;
  const point = documentPoint(event.target.getStage());
  if (point) draftPoints.value.push(point.x, point.y);
}

function onStagePointerUp() {
  if (!drawing.value) return;
  drawing.value = false;
  if (store.tool === "pen" || store.tool === "highlighter") {
    store.addFreehand(draftPoints.value, store.tool);
  }
  draftPoints.value = [];
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
  <main ref="wrapper" class="workspace">
    <v-stage
      ref="stageRef"
      :config="{ width: size.width, height: size.height }"
      @wheel="onWheel"
      @mousedown="onStagePointerDown"
      @touchstart="onStagePointerDown"
      @mousemove="onStagePointerMove"
      @touchmove="onStagePointerMove"
      @mouseup="onStagePointerUp"
      @touchend="onStagePointerUp"
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
          :config="{
            x: 0,
            y: 0,
            width: store.document.canvas.width,
            height: store.document.canvas.height,
            fill: backgroundColor,
            fillPatternImage: backgroundPattern,
            fillPatternRepeat: 'repeat',
            shadowColor: '#64748b',
            shadowBlur: 24,
            shadowOpacity: 0.18,
            shadowOffsetY: 8,
            listening: false,
          }"
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

        <template v-if="store.tool === 'crop' && store.selectedImage">
          <v-rect
            :config="{
              x: store.selectedImage.x,
              y: store.selectedImage.y,
              width: store.selectedImage.width,
              height: store.selectedImage.height,
              stroke: '#ffffff',
              strokeWidth: 3 / store.zoom,
              dash: [10 / store.zoom, 6 / store.zoom],
              listening: false,
            }"
          />
          <v-line
            v-for="fraction in [1 / 3, 2 / 3]"
            :key="`v-${fraction}`"
            :config="{
              points: [
                store.selectedImage.x + store.selectedImage.width * fraction,
                store.selectedImage.y,
                store.selectedImage.x + store.selectedImage.width * fraction,
                store.selectedImage.y + store.selectedImage.height,
              ],
              stroke: '#ffffff',
              strokeWidth: 1 / store.zoom,
              dash: [7 / store.zoom, 7 / store.zoom],
              listening: false,
            }"
          />
          <v-line
            v-for="fraction in [1 / 3, 2 / 3]"
            :key="`h-${fraction}`"
            :config="{
              points: [
                store.selectedImage.x,
                store.selectedImage.y + store.selectedImage.height * fraction,
                store.selectedImage.x + store.selectedImage.width,
                store.selectedImage.y + store.selectedImage.height * fraction,
              ],
              stroke: '#ffffff',
              strokeWidth: 1 / store.zoom,
              dash: [7 / store.zoom, 7 / store.zoom],
              listening: false,
            }"
          />
        </template>

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

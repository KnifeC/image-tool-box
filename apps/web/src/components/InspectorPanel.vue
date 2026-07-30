<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  GripHorizontal,
  GripVertical,
  Lock,
  Trash2,
  Unlock,
  X,
} from "lucide-vue-next";
import type {
  ArrowNode,
  FreehandNode,
  ImageNode,
  LineNode,
  RectangleNode,
  SceneNode,
  TextNode,
} from "@imagetoolbox/editor-core";
import { useEditorStore } from "../stores/editor";
import { isCreationTool } from "../tool-presets";
import ToolOptionsPanel from "./ToolOptionsPanel.vue";

const store = useEditorStore();
const { t } = useI18n();
const node = computed(() => store.primaryNode);
const activeCreationTool = computed(() =>
  isCreationTool(store.tool) ? store.tool : null,
);
const propertiesOpen = ref(true);
const layersOpen = ref(true);
const inspectorStackRef = ref<HTMLElement | null>(null);
const panelSplit = ref(0.58);
const panelResizing = ref(false);
const draggedLayerId = ref<string | null>(null);
const layerDropTargetId = ref<string | null>(null);
const layerDropPosition = ref<"above" | "below">("above");
let layerPointerDrag: {
  layerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  sourceElement: HTMLElement;
} | null = null;
let suppressLayerClickId: string | null = null;
const textInputRef = ref<HTMLTextAreaElement | null>(null);
const bothPanelsOpen = computed(() => propertiesOpen.value && layersOpen.value);
const propertiesPanelStyle = computed(() =>
  bothPanelsOpen.value
    ? { flexBasis: `${Math.round(panelSplit.value * 10000) / 100}%` }
    : undefined,
);
const canMoveLayerUp = computed(() => {
  if (!node.value) return false;
  return node.value.zIndex < store.nodes.length - 1;
});
const canMoveLayerDown = computed(() => {
  if (!node.value) return false;
  return node.value.zIndex > 0;
});
const canvasColor = computed(() =>
  store.document.canvas.background.type === "color"
    ? store.document.canvas.background.color
    : "#ffffff",
);
const canvasWidthDraft = ref(store.backgroundBounds.width);
const canvasHeightDraft = ref(store.backgroundBounds.height);
const backgroundSizeDisabled = computed(
  () =>
    store.document.canvas.background.locked ||
    store.document.canvas.background.autoSize,
);

watch(
  () => [store.backgroundBounds.width, store.backgroundBounds.height],
  ([width, height]) => {
    canvasWidthDraft.value = width ?? 1;
    canvasHeightDraft.value = height ?? 1;
  },
);

watch(
  () => store.textEditRequest?.token,
  async () => {
    await nextTick();
    if (
      store.textEditRequest?.nodeId !== node.value?.id ||
      node.value?.type !== "text"
    ) {
      return;
    }
    textInputRef.value?.focus();
    textInputRef.value?.select();
  },
);

watch(
  () => store.mobilePanel,
  (panel) => {
    if (panel === "properties") propertiesOpen.value = true;
    if (panel === "layers") layersOpen.value = true;
  },
);

function numberValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function update(patch: Partial<SceneNode>) {
  if (node.value) store.updateNode(node.value.id, patch);
}

function preview(patch: Partial<SceneNode>) {
  if (node.value) store.previewNode(node.value.id, patch);
}

function finishPreview() {
  store.commitPreviewEdit();
}

function selectLayer(layerId: string, additive = false) {
  store.setTool("select");
  store.select(layerId, additive);
  propertiesOpen.value = true;
}

function updatePanelSplit(clientY: number) {
  const stack = inspectorStackRef.value;
  if (!stack) return;
  const bounds = stack.getBoundingClientRect();
  const dividerHeight = 10;
  const minimumPanelHeight = 96;
  const availableHeight = Math.max(1, bounds.height - dividerHeight);
  const propertiesHeight = Math.min(
    availableHeight - minimumPanelHeight,
    Math.max(minimumPanelHeight, clientY - bounds.top - dividerHeight / 2),
  );
  panelSplit.value = propertiesHeight / availableHeight;
}

function startPanelResize(event: PointerEvent) {
  if (event.button !== 0 || !bothPanelsOpen.value) return;
  panelResizing.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updatePanelSplit(event.clientY);
  event.preventDefault();
}

function resizePanels(event: PointerEvent) {
  if (!panelResizing.value) return;
  updatePanelSplit(event.clientY);
}

function finishPanelResize(event: PointerEvent) {
  if (!panelResizing.value) return;
  updatePanelSplit(event.clientY);
  panelResizing.value = false;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
}

function resizePanelsWithKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.08 : 0.03;
  if (event.key === "ArrowUp") {
    panelSplit.value = Math.max(0.2, panelSplit.value - step);
  } else if (event.key === "ArrowDown") {
    panelSplit.value = Math.min(0.8, panelSplit.value + step);
  } else if (event.key === "Home") {
    panelSplit.value = 0.2;
  } else if (event.key === "End") {
    panelSplit.value = 0.8;
  } else {
    return;
  }
  event.preventDefault();
}

function prepareLayerPointerDrag(event: PointerEvent, layerId: string) {
  if (event.button !== 0) return;
  const origin = event.target as HTMLElement;
  if (origin.closest(".layer-icon-action")) return;
  if (
    event.pointerType !== "mouse" &&
    !origin.closest(".layer-drag-handle")
  ) {
    return;
  }
  layerPointerDrag = {
    layerId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    sourceElement: event.currentTarget as HTMLElement,
  };
  layerPointerDrag.sourceElement.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", continueLayerPointerDrag, {
    passive: false,
  });
  window.addEventListener("pointerup", finishLayerPointerDrag);
  window.addEventListener("pointercancel", cancelLayerPointerDrag);
  if (event.pointerType === "mouse") {
    window.addEventListener("mouseup", finishLayerMouseDrag);
  }
}

function continueLayerPointerDrag(event: PointerEvent) {
  const drag = layerPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!draggedLayerId.value) {
    const distance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    if (distance < 6) return;
    draggedLayerId.value = drag.layerId;
    layerDropTargetId.value = null;
    selectLayer(drag.layerId);
  }
  const targetRow = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>(".layer-row[data-layer-id]");
  const targetId = targetRow?.dataset.layerId;
  if (!targetRow || !targetId || targetId === drag.layerId) {
    layerDropTargetId.value = null;
    return;
  }
  const bounds = targetRow.getBoundingClientRect();
  layerDropTargetId.value = targetId;
  layerDropPosition.value =
    event.clientY < bounds.top + bounds.height / 2 ? "above" : "below";
  event.preventDefault();
}

function finishLayerPointerDrag(event: PointerEvent) {
  const drag = layerPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  completeLayerPointerDrag(event);
}

function finishLayerMouseDrag(event: MouseEvent) {
  if (!layerPointerDrag) return;
  completeLayerPointerDrag(event);
}

function completeLayerPointerDrag(event: Event) {
  const drag = layerPointerDrag;
  if (!drag) return;
  const wasDragging = draggedLayerId.value === drag.layerId;
  const targetId = layerDropTargetId.value;
  if (drag.sourceElement.hasPointerCapture(drag.pointerId)) {
    drag.sourceElement.releasePointerCapture(drag.pointerId);
  }
  removeLayerPointerListeners();
  if (wasDragging && targetId) {
    store.moveNodeRelative(drag.layerId, targetId, layerDropPosition.value);
  }
  clearLayerDrag();
  if (wasDragging) {
    suppressLayerClickId = drag.layerId;
    window.setTimeout(() => {
      if (suppressLayerClickId === drag.layerId) suppressLayerClickId = null;
    }, 0);
    event.preventDefault();
  }
}

function cancelLayerPointerDrag(event: PointerEvent) {
  const drag = layerPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.sourceElement.hasPointerCapture(event.pointerId)) {
    drag.sourceElement.releasePointerCapture(event.pointerId);
  }
  removeLayerPointerListeners();
  clearLayerDrag();
}

function removeLayerPointerListeners() {
  window.removeEventListener("pointermove", continueLayerPointerDrag);
  window.removeEventListener("pointerup", finishLayerPointerDrag);
  window.removeEventListener("pointercancel", cancelLayerPointerDrag);
  window.removeEventListener("mouseup", finishLayerMouseDrag);
  layerPointerDrag = null;
}

function handleLayerClick(layerId: string, additive: boolean) {
  if (suppressLayerClickId === layerId) {
    suppressLayerClickId = null;
    return;
  }
  selectLayer(layerId, additive);
}

function clearLayerDrag() {
  draggedLayerId.value = null;
  layerDropTargetId.value = null;
}

onBeforeUnmount(removeLayerPointerListeners);

function updateImageBorder(key: "enabled" | "color" | "width", value: boolean | string | number) {
  if (node.value?.type !== "image") return;
  update({
    border: { ...node.value.border, [key]: value },
  } as Partial<ImageNode>);
}

function updateShape(group: "stroke" | "fill", key: string, value: unknown) {
  if (node.value?.type !== "rectangle" && node.value?.type !== "ellipse") return;
  update({
    style: {
      ...node.value.style,
      [group]: { ...node.value.style[group], [key]: value },
    },
  } as Partial<RectangleNode>);
}

function previewShape(group: "stroke" | "fill", key: string, value: unknown) {
  if (node.value?.type !== "rectangle" && node.value?.type !== "ellipse") return;
  preview({
    style: {
      ...node.value.style,
      [group]: { ...node.value.style[group], [key]: value },
    },
  } as Partial<RectangleNode>);
}

function previewImageBorder(
  key: "color" | "width",
  value: string | number,
) {
  if (node.value?.type !== "image") return;
  preview({
    border: { ...node.value.border, [key]: value },
  } as Partial<ImageNode>);
}

function previewLinear(key: "color" | "width", value: string | number) {
  if (node.value?.type !== "line" && node.value?.type !== "arrow") return;
  preview({
    stroke: { ...node.value.stroke, [key]: value },
  } as Partial<LineNode | ArrowNode>);
}

function previewFreehand(key: "color" | "strokeWidth", value: string | number) {
  if (node.value?.type !== "freehand") return;
  preview({ [key]: value } as Partial<FreehandNode>);
}

function updateText(key: keyof TextNode, value: unknown) {
  if (node.value?.type !== "text") return;
  update({ [key]: value } as Partial<TextNode>);
}

function applyCanvasSize() {
  store.setCanvasSize(canvasWidthDraft.value, canvasHeightDraft.value);
}

const ratioOptions = computed(() => [
  { label: t("inspector.free"), value: undefined },
  { label: t("inspector.original"), value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
]);

const canvasPresets = computed(() => [
  { label: t("inspector.square"), detail: "1080 × 1080", width: 1080, height: 1080 },
  { label: t("inspector.landscape"), detail: "1920 × 1080", width: 1920, height: 1080 },
  { label: t("inspector.portrait"), detail: "1080 × 1920", width: 1080, height: 1920 },
  { label: t("inspector.social"), detail: "1080 × 1350", width: 1080, height: 1350 },
]);
</script>

<template>
  <aside
    class="inspector"
    :class="{
      'mobile-open': store.mobilePanel !== null,
      'crop-mode': store.tool === 'crop' && store.selectedImage,
    }"
    :aria-label="t('inspector.label')"
  >
    <button
      v-if="store.mobilePanel && store.tool !== 'crop'"
      class="mobile-panel-close"
      type="button"
      :aria-label="t('inspector.close')"
      @click="store.mobilePanel = null"
    >
      <X :size="22" />
    </button>

    <template v-if="store.tool === 'crop' && store.selectedImage">
      <div class="inspector-heading">
        <h2>{{ t("inspector.crop") }}</h2>
      </div>
      <div class="panel-scroll crop-panel">
        <section class="property-section">
          <h3>{{ t("inspector.ratio") }}</h3>
          <div class="ratio-grid">
            <button
              v-for="ratio in ratioOptions"
              :key="ratio.label"
              type="button"
              :class="{
                active:
                  ratio.value === 0
                    ? false
                    : store.cropRatio === ratio.value,
              }"
              @click="
                ratio.value === 0
                  ? store.resetCrop()
                  : store.applyCropRatio(ratio.value)
              "
            >
              {{ ratio.label }}
            </button>
          </div>
        </section>
        <section class="property-section">
          <h3>{{ t("inspector.cropArea") }}</h3>
          <div class="field-grid">
            <label>
              <span>{{ t("inspector.width") }}</span>
              <input
                :value="Math.round(store.cropSelection?.width ?? 0)"
                type="number"
                readonly
              />
            </label>
            <label>
              <span>{{ t("inspector.height") }}</span>
              <input
                :value="Math.round(store.cropSelection?.height ?? 0)"
                type="number"
                readonly
              />
            </label>
          </div>
        </section>
        <section class="property-section">
          <h3>{{ t("inspector.zoomContent") }}</h3>
          <input
            class="full-slider"
            type="range"
            min="0"
            max="40"
            value="0"
            @input="store.adjustCropInset(numberValue($event))"
          />
          <p class="crop-help">{{ t("inspector.cropHelp") }}</p>
        </section>
      </div>
      <div class="crop-actions">
        <button type="button" @click="store.resetCrop">{{ t("inspector.reset") }}</button>
        <button type="button" @click="store.cancelCrop">{{ t("inspector.cancel") }}</button>
        <button class="primary" type="button" @click="store.applyCrop">{{ t("inspector.done") }}</button>
      </div>
    </template>

    <template v-else>
      <div
        ref="inspectorStackRef"
        class="inspector-stack"
        :class="{ 'is-resizing': panelResizing }"
      >
        <section
          class="inspector-accordion properties-accordion"
          :class="{ open: propertiesOpen }"
          :style="propertiesPanelStyle"
        >
          <button
            class="inspector-section-toggle"
            type="button"
            :aria-expanded="propertiesOpen"
            aria-controls="inspector-properties"
            @click="propertiesOpen = !propertiesOpen"
          >
            <span>{{ t("inspector.properties") }}</span>
            <ChevronDown :size="18" :class="{ rotated: propertiesOpen }" />
          </button>

          <div
            v-show="propertiesOpen"
            id="inspector-properties"
            class="panel-scroll inspector-section-content"
          >
        <ToolOptionsPanel v-if="activeCreationTool" />
        <template v-else-if="node">
          <section class="property-section">
            <h3>{{ t("inspector.position") }}</h3>
            <div class="field-grid">
              <label>
                <span>X</span>
                <input
                  :value="Math.round(node.x)"
                  type="number"
                  @change="update({ x: numberValue($event) })"
                />
              </label>
              <label>
                <span>Y</span>
                <input
                  :value="Math.round(node.y)"
                  type="number"
                  @change="update({ y: numberValue($event) })"
                />
              </label>
            </div>
          </section>
          <section class="property-section">
            <h3>{{ t("inspector.size") }}</h3>
            <div class="field-grid">
              <label>
                <span>{{ t("inspector.width") }}</span>
                <input
                  :value="Math.round(node.width)"
                  type="number"
                  min="1"
                  @change="update({ width: numberValue($event) })"
                />
              </label>
              <label>
                <span>{{ t("inspector.height") }}</span>
                <input
                  :value="Math.round(node.height)"
                  type="number"
                  min="1"
                  @change="update({ height: numberValue($event) })"
                />
              </label>
            </div>
          </section>
          <section class="property-section inline-section">
            <label>
              <span>{{ t("inspector.rotation") }}</span>
              <input
                :value="Math.round(node.rotation)"
                type="number"
                @change="update({ rotation: numberValue($event) })"
              />
            </label>
          </section>
          <section class="property-section">
            <div class="slider-heading">
              <h3>{{ t("inspector.opacity") }}</h3>
              <output>{{ Math.round(node.opacity * 100) }}%</output>
            </div>
            <input
              class="full-slider"
              :value="node.opacity"
              type="range"
              min="0"
              max="1"
              step="0.01"
              @input="preview({ opacity: numberValue($event) })"
              @change="finishPreview"
              @blur="finishPreview"
            />
          </section>

          <section v-if="node.type === 'image'" class="property-section">
            <div class="toggle-row">
              <h3>{{ t("inspector.border") }}</h3>
              <input
                :checked="node.border.enabled"
                type="checkbox"
                @change="updateImageBorder('enabled', ($event.target as HTMLInputElement).checked)"
              />
            </div>
            <div v-if="node.border.enabled" class="style-row">
              <input
                :value="node.border.color"
                type="color"
                @input="previewImageBorder('color', ($event.target as HTMLInputElement).value)"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <input
                :value="node.border.width"
                type="number"
                min="0"
                max="24"
                @change="updateImageBorder('width', numberValue($event))"
              />
              <span>px</span>
            </div>
            <label class="single-field">
              <span>{{ t("inspector.cornerRadius") }}</span>
              <input
                :value="node.cornerRadius"
                type="number"
                min="0"
                @change="update({ cornerRadius: numberValue($event) } as Partial<ImageNode>)"
              />
            </label>
          </section>

          <section
            v-if="node.type === 'rectangle' || node.type === 'ellipse'"
            class="property-section"
          >
            <div class="toggle-row">
              <h3>{{ t("inspector.stroke") }}</h3>
              <input
                :checked="node.style.stroke.enabled"
                type="checkbox"
                @change="updateShape('stroke', 'enabled', ($event.target as HTMLInputElement).checked)"
              />
            </div>
            <div class="style-row">
              <input
                :value="node.style.stroke.color"
                type="color"
                :aria-label="t('inspector.strokeColor')"
                :disabled="!node.style.stroke.enabled"
                @input="previewShape('stroke', 'color', ($event.target as HTMLInputElement).value)"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <input
                :value="node.style.stroke.width"
                type="number"
                min="0"
                :disabled="!node.style.stroke.enabled"
                @change="updateShape('stroke', 'width', numberValue($event))"
              />
              <span>px</span>
            </div>
            <div class="toggle-row property-subrow">
              <h3>{{ t("inspector.fill") }}</h3>
              <input
                :checked="node.style.fill.enabled"
                type="checkbox"
                @change="updateShape('fill', 'enabled', ($event.target as HTMLInputElement).checked)"
              />
            </div>
            <div class="style-row">
              <input
                :value="node.style.fill.color"
                type="color"
                :aria-label="t('inspector.fillColor')"
                :disabled="!node.style.fill.enabled"
                @input="previewShape('fill', 'color', ($event.target as HTMLInputElement).value)"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <input
                :value="node.style.fill.opacity"
                type="range"
                min="0"
                max="1"
                step="0.01"
                :aria-label="t('inspector.fillOpacity')"
                :disabled="!node.style.fill.enabled"
                @input="previewShape('fill', 'opacity', numberValue($event))"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <output>{{ Math.round(node.style.fill.opacity * 100) }}%</output>
            </div>
          </section>

          <section
            v-if="node.type === 'line' || node.type === 'arrow'"
            class="property-section"
          >
            <div class="slider-heading">
              <h3>{{ t("inspector.line") }}</h3>
              <output>{{ Math.round(node.stroke.width) }} px</output>
            </div>
            <div class="style-row">
              <input
                :value="node.stroke.color"
                type="color"
                :aria-label="t('inspector.lineColor')"
                @input="previewLinear('color', ($event.target as HTMLInputElement).value)"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <input
                :value="node.stroke.width"
                type="range"
                min="1"
                max="40"
                step="1"
                :aria-label="t('inspector.lineWidth')"
                @input="previewLinear('width', numberValue($event))"
                @change="finishPreview"
                @blur="finishPreview"
              />
            </div>
          </section>

          <section v-if="node.type === 'freehand'" class="property-section">
            <div class="slider-heading">
              <h3>{{ t("inspector.stroke") }}</h3>
              <output>{{ Math.round(node.strokeWidth) }} px</output>
            </div>
            <div class="style-row">
              <input
                :value="node.color"
                type="color"
                :aria-label="t('inspector.strokeColor')"
                @input="previewFreehand('color', ($event.target as HTMLInputElement).value)"
                @change="finishPreview"
                @blur="finishPreview"
              />
              <input
                :value="node.strokeWidth"
                type="range"
                min="1"
                max="80"
                step="1"
                :aria-label="t('inspector.strokeWidth')"
                @input="previewFreehand('strokeWidth', numberValue($event))"
                @change="finishPreview"
                @blur="finishPreview"
              />
            </div>
          </section>

          <section v-if="node.type === 'text'" class="property-section">
            <label class="text-field">
              <span>{{ t("inspector.text") }}</span>
              <textarea
                ref="textInputRef"
                :value="node.text"
                rows="3"
                @change="updateText('text', ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>
            <div class="field-grid">
              <label>
                <span>{{ t("inspector.fontSize") }}</span>
                <input
                  :value="node.fontSize"
                  type="number"
                  @change="updateText('fontSize', numberValue($event))"
                />
              </label>
              <label>
                <span>{{ t("inspector.color") }}</span>
                <input
                  :value="node.color"
                  type="color"
                  :aria-label="t('inspector.textColor')"
                  @input="preview({ color: ($event.target as HTMLInputElement).value } as Partial<TextNode>)"
                  @change="finishPreview"
                  @blur="finishPreview"
                />
              </label>
            </div>
          </section>
        </template>
        <div v-else class="canvas-settings">
          <section class="property-section">
            <h3>{{ t("inspector.backgroundLayer") }}</h3>
            <div class="background-toggle-list">
              <label>
                <span>{{ t("inspector.visible") }}</span>
                <input
                  :checked="store.document.canvas.background.visible"
                  type="checkbox"
                  @change="store.toggleBackground('visible')"
                />
              </label>
              <label>
                <span>{{ t("inspector.locked") }}</span>
                <input
                  :checked="store.document.canvas.background.locked"
                  type="checkbox"
                  @change="store.toggleBackground('locked')"
                />
              </label>
              <label>
                <span>{{ t("inspector.autoSize") }}</span>
                <input
                  :checked="store.document.canvas.background.autoSize"
                  type="checkbox"
                  :disabled="store.document.canvas.background.locked"
                  @change="
                    store.setBackgroundAutoSize(
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
              </label>
            </div>
          </section>
          <section class="property-section">
            <h3>{{ t("inspector.backgroundSize") }}</h3>
            <div class="background-toggle-list background-size-toggle">
              <label>
                <span>{{ t("inspector.transformBackground") }}</span>
                <input
                  :checked="
                    store.document.canvas.background.transformEnabled
                  "
                  type="checkbox"
                  :disabled="store.document.canvas.background.locked"
                  @change="
                    store.setBackgroundTransformEnabled(
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
              </label>
            </div>
            <p class="background-transform-help">
              {{
                store.document.canvas.background.locked
                  ? t("inspector.transformBackgroundLockedHint")
                  : t("inspector.transformBackgroundHint")
              }}
            </p>
            <div class="canvas-preset-grid">
              <button
                v-for="preset in canvasPresets"
                :key="preset.label"
                type="button"
                :class="{
                  active:
                    store.backgroundBounds.width === preset.width &&
                    store.backgroundBounds.height === preset.height,
                }"
                :disabled="backgroundSizeDisabled"
                @click="store.setCanvasSize(preset.width, preset.height)"
              >
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.detail }}</span>
              </button>
            </div>
            <div class="field-grid">
              <label>
                <span>{{ t("inspector.canvasWidth") }}</span>
                <input
                  v-model.number="canvasWidthDraft"
                  type="number"
                  min="1"
                  max="16384"
                  :disabled="backgroundSizeDisabled"
                />
              </label>
              <label>
                <span>{{ t("inspector.canvasHeight") }}</span>
                <input
                  v-model.number="canvasHeightDraft"
                  type="number"
                  min="1"
                  max="16384"
                  :disabled="backgroundSizeDisabled"
                />
              </label>
            </div>
            <div class="canvas-size-actions">
              <button
                type="button"
                :disabled="backgroundSizeDisabled"
                @click="applyCanvasSize"
              >
                {{ t("inspector.apply") }}
              </button>
              <button
                type="button"
                :disabled="backgroundSizeDisabled"
                @click="store.swapCanvasSize"
              >
                {{ t("inspector.swap") }}
              </button>
            </div>
          </section>

          <section class="property-section">
            <div class="toggle-row">
              <h3>{{ t("inspector.transparent") }}</h3>
              <input
                :checked="store.document.canvas.background.type === 'transparent'"
                type="checkbox"
                :aria-label="t('inspector.transparent')"
                @change="
                  store.setCanvasTransparent(
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
            </div>
            <label
              class="canvas-color-field"
              :class="{
                disabled:
                  store.document.canvas.background.type === 'transparent',
              }"
            >
              <span>{{ t("inspector.background") }}</span>
              <span>
                <input
                  :value="canvasColor"
                  type="color"
                  :aria-label="t('inspector.background')"
                  :disabled="
                    store.document.canvas.background.type === 'transparent'
                  "
                  @input="
                    store.previewCanvasBackgroundColor(
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                  @change="finishPreview"
                  @blur="finishPreview"
                />
                <output>{{ canvasColor.toUpperCase() }}</output>
              </span>
            </label>
          </section>
        </div>
          </div>
        </section>

        <div
          v-show="bothPanelsOpen"
          class="panel-resizer"
          data-testid="inspector-panel-resizer"
          role="separator"
          :aria-label="t('inspector.resizePanels')"
          aria-orientation="horizontal"
          aria-valuemin="20"
          aria-valuemax="80"
          :aria-valuenow="Math.round(panelSplit * 100)"
          tabindex="0"
          @keydown="resizePanelsWithKeyboard"
          @pointerdown="startPanelResize"
          @pointermove="resizePanels"
          @pointerup="finishPanelResize"
          @pointercancel="finishPanelResize"
        >
          <GripHorizontal :size="16" aria-hidden="true" />
        </div>

        <section
          class="inspector-accordion layers-accordion"
          :class="{ open: layersOpen }"
        >
          <button
            class="inspector-section-toggle"
            type="button"
            :aria-expanded="layersOpen"
            aria-controls="inspector-layers"
            @click="layersOpen = !layersOpen"
          >
            <span>{{ t("inspector.layers") }}</span>
            <ChevronDown :size="18" :class="{ rotated: layersOpen }" />
          </button>

          <div
            v-show="layersOpen"
            id="inspector-layers"
            class="panel-scroll layers-panel inspector-section-content"
          >
        <div class="layers-heading">
          <span>{{ t("inspector.layerCount", { count: store.nodes.length + 1 }) }}</span>
          <button type="button" :disabled="!node" @click="store.deleteSelected">
            <Trash2 :size="16" />
          </button>
        </div>
        <button
          v-for="layer in [...store.nodes].reverse()"
          :key="layer.id"
          class="layer-row"
          :class="{
            selected: store.selectedIds.includes(layer.id),
            dragging: draggedLayerId === layer.id,
            'drag-over-above':
              layerDropTargetId === layer.id && layerDropPosition === 'above',
            'drag-over-below':
              layerDropTargetId === layer.id && layerDropPosition === 'below',
          }"
          type="button"
          :data-layer-id="layer.id"
          :aria-label="t('inspector.layerDragLabel', { name: layer.name })"
          @pointerdown="prepareLayerPointerDrag($event, layer.id)"
          @click="handleLayerClick(layer.id, $event.shiftKey)"
        >
          <span
            class="layer-drag-handle"
            :title="t('inspector.dragLayer')"
          >
            <GripVertical :size="15" aria-hidden="true" />
          </span>
          <span
            class="layer-icon-action"
            role="button"
            tabindex="0"
            @click.stop="store.toggleNode(layer.id, 'visible')"
          >
            <Eye v-if="layer.visible" :size="17" />
            <EyeOff v-else :size="17" />
          </span>
          <span class="layer-type">{{ layer.type.slice(0, 1).toUpperCase() }}</span>
          <span class="layer-name">{{ layer.name }}</span>
          <span
            class="layer-icon-action"
            role="button"
            tabindex="0"
            @click.stop="store.toggleNode(layer.id, 'locked')"
          >
            <Lock v-if="layer.locked" :size="15" />
            <Unlock v-else :size="15" />
          </span>
        </button>
        <button
          class="layer-row background-layer-row"
          :class="{ selected: store.backgroundSelected }"
          type="button"
          @click="selectLayer(store.document.canvas.background.id)"
        >
          <span
            class="layer-icon-action"
            role="button"
            tabindex="0"
            @click.stop="store.toggleBackground('visible')"
          >
            <Eye v-if="store.document.canvas.background.visible" :size="17" />
            <EyeOff v-else :size="17" />
          </span>
          <span class="layer-type">B</span>
          <span class="layer-name">
            {{ store.document.canvas.background.name }}
          </span>
          <span
            class="layer-icon-action"
            role="button"
            tabindex="0"
            @click.stop="store.toggleBackground('locked')"
          >
            <Lock v-if="store.document.canvas.background.locked" :size="15" />
            <Unlock v-else :size="15" />
          </span>
        </button>
        <div v-if="node" class="layer-order-actions">
          <button
            type="button"
            data-testid="move-layer-up"
            :disabled="!canMoveLayerUp"
            :title="t('inspector.moveUpTitle')"
            @click="store.reorderNode(node.id, 1)"
          >
            <ArrowUp :size="16" />
            {{ t("inspector.moveUp") }}
          </button>
          <button
            type="button"
            data-testid="move-layer-down"
            :disabled="!canMoveLayerDown"
            :title="t('inspector.moveDownTitle')"
            @click="store.reorderNode(node.id, -1)"
          >
            <ArrowDown :size="16" />
            {{ t("inspector.moveDown") }}
          </button>
        </div>
          </div>
        </section>
      </div>
    </template>
  </aside>
</template>

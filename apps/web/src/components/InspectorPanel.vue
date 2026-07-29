<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
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
const node = computed(() => store.primaryNode);
const activeCreationTool = computed(() =>
  isCreationTool(store.tool) ? store.tool : null,
);
const textInputRef = ref<HTMLTextAreaElement | null>(null);
const canvasColor = computed(() =>
  store.document.canvas.background.type === "color"
    ? store.document.canvas.background.color
    : "#ffffff",
);
const canvasWidthDraft = ref(store.backgroundBounds.width);
const canvasHeightDraft = ref(store.backgroundBounds.height);

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

const ratioOptions = [
  { label: "自由", value: undefined },
  { label: "原图", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

const canvasPresets = [
  { label: "方形", detail: "1080 × 1080", width: 1080, height: 1080 },
  { label: "横屏 16:9", detail: "1920 × 1080", width: 1920, height: 1080 },
  { label: "竖屏 9:16", detail: "1080 × 1920", width: 1080, height: 1920 },
  { label: "社交媒体 4:5", detail: "1080 × 1350", width: 1080, height: 1350 },
];
</script>

<template>
  <aside
    class="inspector"
    :class="{ 'mobile-open': store.mobilePanel !== null }"
    aria-label="属性和图层"
  >
    <button
      v-if="store.mobilePanel"
      class="mobile-panel-close"
      type="button"
      aria-label="关闭面板"
      @click="store.mobilePanel = null"
    >
      <X :size="22" />
    </button>

    <template v-if="store.tool === 'crop' && store.selectedImage">
      <div class="inspector-heading">
        <h2>裁剪 / Crop</h2>
      </div>
      <div class="panel-scroll crop-panel">
        <section class="property-section">
          <h3>比例 / Ratio</h3>
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
          <h3>裁剪区域 / Crop area</h3>
          <div class="field-grid">
            <label>
              <span>宽 / W</span>
              <input
                :value="Math.round(store.cropSelection?.width ?? 0)"
                type="number"
                readonly
              />
            </label>
            <label>
              <span>高 / H</span>
              <input
                :value="Math.round(store.cropSelection?.height ?? 0)"
                type="number"
                readonly
              />
            </label>
          </div>
        </section>
        <section class="property-section">
          <h3>缩放图片内容</h3>
          <input
            class="full-slider"
            type="range"
            min="0"
            max="40"
            value="0"
            @input="store.adjustCropInset(numberValue($event))"
          />
          <p class="crop-help">拖动滑块调整可见区域。裁剪不会修改原始图片内容。</p>
        </section>
      </div>
      <div class="crop-actions">
        <button type="button" @click="store.resetCrop">重置</button>
        <button type="button" @click="store.cancelCrop">取消</button>
        <button class="primary" type="button" @click="store.applyCrop">完成</button>
      </div>
    </template>

    <template v-else>
      <div class="inspector-tabs">
        <button
          type="button"
          :class="{ active: store.inspectorTab === 'properties' }"
          @click="store.inspectorTab = 'properties'"
        >
          属性 / Properties
        </button>
        <button
          type="button"
          :class="{ active: store.inspectorTab === 'layers' }"
          @click="store.inspectorTab = 'layers'"
        >
          图层 / Layers
        </button>
      </div>

      <div v-if="store.inspectorTab === 'properties'" class="panel-scroll">
        <ToolOptionsPanel v-if="activeCreationTool" />
        <template v-else-if="node">
          <section class="property-section">
            <h3>位置 / Position</h3>
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
            <h3>大小 / Size</h3>
            <div class="field-grid">
              <label>
                <span>宽 / W</span>
                <input
                  :value="Math.round(node.width)"
                  type="number"
                  min="1"
                  @change="update({ width: numberValue($event) })"
                />
              </label>
              <label>
                <span>高 / H</span>
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
              <span>旋转 / Rotation</span>
              <input
                :value="Math.round(node.rotation)"
                type="number"
                @change="update({ rotation: numberValue($event) })"
              />
            </label>
          </section>
          <section class="property-section">
            <div class="slider-heading">
              <h3>不透明度 / Opacity</h3>
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
              <h3>边框 / Border</h3>
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
              <span>圆角 / Corner radius</span>
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
              <h3>描边 / Stroke</h3>
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
                aria-label="描边颜色 / Stroke color"
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
              <h3>填充 / Fill</h3>
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
                aria-label="填充颜色 / Fill color"
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
                aria-label="填充不透明度 / Fill opacity"
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
              <h3>线条 / Line</h3>
              <output>{{ Math.round(node.stroke.width) }} px</output>
            </div>
            <div class="style-row">
              <input
                :value="node.stroke.color"
                type="color"
                aria-label="线条颜色 / Line color"
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
                aria-label="线条宽度 / Line width"
                @input="previewLinear('width', numberValue($event))"
                @change="finishPreview"
                @blur="finishPreview"
              />
            </div>
          </section>

          <section v-if="node.type === 'freehand'" class="property-section">
            <div class="slider-heading">
              <h3>笔触 / Stroke</h3>
              <output>{{ Math.round(node.strokeWidth) }} px</output>
            </div>
            <div class="style-row">
              <input
                :value="node.color"
                type="color"
                aria-label="笔触颜色 / Stroke color"
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
                aria-label="笔触宽度 / Stroke width"
                @input="previewFreehand('strokeWidth', numberValue($event))"
                @change="finishPreview"
                @blur="finishPreview"
              />
            </div>
          </section>

          <section v-if="node.type === 'text'" class="property-section">
            <label class="text-field">
              <span>文字 / Text</span>
              <textarea
                ref="textInputRef"
                :value="node.text"
                rows="3"
                @change="updateText('text', ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </label>
            <div class="field-grid">
              <label>
                <span>字号</span>
                <input
                  :value="node.fontSize"
                  type="number"
                  @change="updateText('fontSize', numberValue($event))"
                />
              </label>
              <label>
                <span>颜色</span>
                <input
                  :value="node.color"
                  type="color"
                  aria-label="文字颜色 / Text color"
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
            <h3>背景图层 / Background layer</h3>
            <div class="background-toggle-list">
              <label>
                <span>显示背景 / Visible</span>
                <input
                  :checked="store.document.canvas.background.visible"
                  type="checkbox"
                  @change="store.toggleBackground('visible')"
                />
              </label>
              <label>
                <span>锁定背景 / Locked</span>
                <input
                  :checked="store.document.canvas.background.locked"
                  type="checkbox"
                  @change="store.toggleBackground('locked')"
                />
              </label>
              <label>
                <span>自适应大小 / Auto size</span>
                <input
                  :checked="store.document.canvas.background.autoSize"
                  type="checkbox"
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
            <h3>背景尺寸 / Background size</h3>
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
                :disabled="store.document.canvas.background.autoSize"
                @click="store.setCanvasSize(preset.width, preset.height)"
              >
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.detail }}</span>
              </button>
            </div>
            <div class="field-grid">
              <label>
                <span>画布宽度 / Width</span>
                <input
                  v-model.number="canvasWidthDraft"
                  type="number"
                  min="1"
                  max="16384"
                  :disabled="store.document.canvas.background.autoSize"
                />
              </label>
              <label>
                <span>画布高度 / Height</span>
                <input
                  v-model.number="canvasHeightDraft"
                  type="number"
                  min="1"
                  max="16384"
                  :disabled="store.document.canvas.background.autoSize"
                />
              </label>
            </div>
            <div class="canvas-size-actions">
              <button
                type="button"
                :disabled="store.document.canvas.background.autoSize"
                @click="applyCanvasSize"
              >
                应用尺寸 / Apply
              </button>
              <button
                type="button"
                :disabled="store.document.canvas.background.autoSize"
                @click="store.swapCanvasSize"
              >
                交换宽高 / Swap
              </button>
            </div>
          </section>

          <section class="property-section">
            <div class="toggle-row">
              <h3>透明背景 / Transparent</h3>
              <input
                :checked="store.document.canvas.background.type === 'transparent'"
                type="checkbox"
                aria-label="透明背景"
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
              <span>背景颜色 / Background</span>
              <span>
                <input
                  :value="canvasColor"
                  type="color"
                  aria-label="画布背景颜色"
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

      <div v-else class="panel-scroll layers-panel">
        <div class="layers-heading">
          <span>{{ store.nodes.length + 1 }} 个图层</span>
          <button type="button" :disabled="!node" @click="store.deleteSelected">
            <Trash2 :size="16" />
          </button>
        </div>
        <button
          v-for="layer in [...store.nodes].reverse()"
          :key="layer.id"
          class="layer-row"
          :class="{ selected: store.selectedIds.includes(layer.id) }"
          type="button"
          @click="store.select(layer.id, $event.shiftKey)"
        >
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
          @click="store.select(store.document.canvas.background.id)"
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
          <button type="button" @click="store.reorderNode(node.id, 1)">
            <ArrowUp :size="16" />
            上移
          </button>
          <button type="button" @click="store.reorderNode(node.id, -1)">
            <ArrowDown :size="16" />
            下移
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>

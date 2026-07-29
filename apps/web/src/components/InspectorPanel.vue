<script setup lang="ts">
import { computed } from "vue";
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
  ImageNode,
  RectangleNode,
  SceneNode,
  TextNode,
} from "@imagetoolbox/editor-core";
import { useEditorStore } from "../stores/editor";

const store = useEditorStore();
const node = computed(() => store.primaryNode);

function numberValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function update(patch: Partial<SceneNode>) {
  if (node.value) store.updateNode(node.value.id, patch);
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

function updateText(key: keyof TextNode, value: unknown) {
  if (node.value?.type !== "text") return;
  update({ [key]: value } as Partial<TextNode>);
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
                :value="Math.round(store.selectedImage.cropRect.width)"
                type="number"
                readonly
              />
            </label>
            <label>
              <span>高 / H</span>
              <input
                :value="Math.round(store.selectedImage.cropRect.height)"
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
        <template v-if="node">
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
              @change="update({ opacity: numberValue($event) })"
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
                @change="updateImageBorder('color', ($event.target as HTMLInputElement).value)"
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
                @change="updateShape('stroke', 'color', ($event.target as HTMLInputElement).value)"
              />
              <input
                :value="node.style.stroke.width"
                type="number"
                min="0"
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
                @change="updateShape('fill', 'color', ($event.target as HTMLInputElement).value)"
              />
              <input
                :value="node.style.fill.opacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                @change="updateShape('fill', 'opacity', numberValue($event))"
              />
            </div>
          </section>

          <section v-if="node.type === 'text'" class="property-section">
            <label class="text-field">
              <span>文字 / Text</span>
              <textarea
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
                  @change="updateText('color', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>
        </template>
        <div v-else class="empty-inspector">
          <div class="empty-icon"></div>
          <h3>未选择对象</h3>
          <p>在画板或图层中选择对象以编辑属性。</p>
        </div>
      </div>

      <div v-else class="panel-scroll layers-panel">
        <div class="layers-heading">
          <span>{{ store.nodes.length }} 个对象</span>
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


<script setup lang="ts">
import { computed } from "vue";
import { RotateCcw } from "lucide-vue-next";
import { useEditorStore } from "../stores/editor";
import {
  isCreationTool,
  type CreationTool,
  type ToolPresets,
} from "../tool-presets";

const store = useEditorStore();
const tool = computed<CreationTool | null>(() =>
  isCreationTool(store.tool) ? store.tool : null,
);

const toolLabels: Record<CreationTool, string> = {
  text: "文本 / Text",
  rectangle: "矩形 / Rectangle",
  ellipse: "椭圆 / Ellipse",
  line: "直线 / Line",
  arrow: "箭头 / Arrow",
  pen: "画笔 / Pen",
  highlighter: "荧光笔 / Highlighter",
};

function numberValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function textValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked;
}

function updateText(patch: Partial<ToolPresets["text"]>) {
  store.updateToolPreset("text", patch);
}

function updateShape(
  group: "stroke" | "fill",
  key: string,
  value: unknown,
) {
  const active = tool.value;
  if (active !== "rectangle" && active !== "ellipse") return;
  const preset = store.toolPresets[active];
  store.updateToolPreset(active, {
    style: {
      ...preset.style,
      [group]: { ...preset.style[group], [key]: value },
    },
  } as Partial<ToolPresets[typeof active]>);
}

function updateRectangle(patch: Partial<ToolPresets["rectangle"]>) {
  store.updateToolPreset("rectangle", patch);
}

function updateLine(
  target: "line" | "arrow",
  patch: Partial<ToolPresets["line"] | ToolPresets["arrow"]>,
) {
  if (target === "line") {
    store.updateToolPreset("line", patch);
  } else {
    store.updateToolPreset("arrow", patch);
  }
}

function updateArrowSize(size: number) {
  store.updateToolPreset("arrow", {
    pointerLength: size,
    pointerWidth: Math.max(4, Math.round(size * 0.875)),
  });
}

function updateFreehand(
  target: "pen" | "highlighter",
  patch: Partial<ToolPresets["pen"]>,
) {
  store.updateToolPreset(target, patch);
}

function reset() {
  if (tool.value) store.resetToolPreset(tool.value);
}
</script>

<template>
  <template v-if="tool">
    <section class="tool-options-heading">
      <div>
        <h2>{{ toolLabels[tool] }} 设置</h2>
        <p>应用于下一个对象，不会修改当前选中内容。</p>
      </div>
      <button type="button" title="恢复默认值" @click="reset">
        <RotateCcw :size="16" />
        重置
      </button>
    </section>

    <template v-if="tool === 'text'">
      <section class="property-section">
        <label class="text-field">
          <span>默认文字 / Default text</span>
          <textarea
            :value="store.toolPresets.text.text"
            rows="3"
            @input="updateText({ text: textValue($event) })"
          ></textarea>
        </label>
        <div class="field-grid tool-options-grid">
          <label>
            <span>字号 / Size</span>
            <input
              :value="store.toolPresets.text.fontSize"
              type="number"
              min="8"
              max="400"
              @input="updateText({ fontSize: numberValue($event) })"
            />
          </label>
          <label>
            <span>文本框宽度 / Width</span>
            <input
              :value="store.toolPresets.text.width"
              type="number"
              min="80"
              max="2000"
              @input="updateText({ width: numberValue($event) })"
            />
          </label>
          <label>
            <span>字重 / Weight</span>
            <select
              :value="store.toolPresets.text.fontWeight"
              @change="updateText({ fontWeight: numberValue($event) })"
            >
              <option :value="400">常规</option>
              <option :value="500">中等</option>
              <option :value="600">半粗</option>
              <option :value="700">粗体</option>
              <option :value="800">特粗</option>
            </select>
          </label>
          <label>
            <span>对齐 / Align</span>
            <select
              :value="store.toolPresets.text.align"
              @change="
                updateText({
                  align: textValue($event) as ToolPresets['text']['align'],
                })
              "
            >
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
        </div>
        <label class="tool-color-field">
          <span>文字颜色 / Text color</span>
          <span>
            <input
              :value="store.toolPresets.text.color"
              type="color"
              aria-label="预设文字颜色 / Preset text color"
              @input="updateText({ color: textValue($event) })"
            />
            <output>{{ store.toolPresets.text.color.toUpperCase() }}</output>
          </span>
        </label>
      </section>
    </template>

    <template v-else-if="tool === 'rectangle' || tool === 'ellipse'">
      <section class="property-section">
        <div class="toggle-row">
          <h3>描边 / Stroke</h3>
          <input
            :checked="store.toolPresets[tool].style.stroke.enabled"
            type="checkbox"
            aria-label="预设描边 / Preset stroke"
            @change="updateShape('stroke', 'enabled', checkedValue($event))"
          />
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].style.stroke.color"
            type="color"
            aria-label="预设描边颜色 / Preset stroke color"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @input="updateShape('stroke', 'color', textValue($event))"
          />
          <input
            :value="store.toolPresets[tool].style.stroke.width"
            type="range"
            min="0"
            max="40"
            step="1"
            aria-label="预设描边宽度 / Preset stroke width"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @input="updateShape('stroke', 'width', numberValue($event))"
          />
          <output>{{ store.toolPresets[tool].style.stroke.width }} px</output>
        </div>
        <label class="single-field">
          <span>线型 / Style</span>
          <select
            :value="store.toolPresets[tool].style.stroke.style"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @change="updateShape('stroke', 'style', textValue($event))"
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
          </select>
        </label>
      </section>

      <section class="property-section">
        <div class="toggle-row">
          <h3>填充 / Fill</h3>
          <input
            :checked="store.toolPresets[tool].style.fill.enabled"
            type="checkbox"
            aria-label="预设填充 / Preset fill"
            @change="updateShape('fill', 'enabled', checkedValue($event))"
          />
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].style.fill.color"
            type="color"
            aria-label="预设填充颜色 / Preset fill color"
            :disabled="!store.toolPresets[tool].style.fill.enabled"
            @input="updateShape('fill', 'color', textValue($event))"
          />
          <input
            :value="store.toolPresets[tool].style.fill.opacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            aria-label="预设填充不透明度 / Preset fill opacity"
            :disabled="!store.toolPresets[tool].style.fill.enabled"
            @input="updateShape('fill', 'opacity', numberValue($event))"
          />
          <output>
            {{ Math.round(store.toolPresets[tool].style.fill.opacity * 100) }}%
          </output>
        </div>
        <label v-if="tool === 'rectangle'" class="single-field">
          <span>圆角 / Corner radius</span>
          <input
            :value="store.toolPresets.rectangle.cornerRadius"
            type="number"
            min="0"
            max="1000"
            @input="
              updateRectangle({ cornerRadius: numberValue($event) })
            "
          />
        </label>
      </section>
    </template>

    <template v-else-if="tool === 'line' || tool === 'arrow'">
      <section class="property-section">
        <div class="slider-heading">
          <h3>线条 / Line</h3>
          <output>{{ store.toolPresets[tool].width }} px</output>
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].color"
            type="color"
            aria-label="预设线条颜色 / Preset line color"
            @input="updateLine(tool, { color: textValue($event) })"
          />
          <input
            :value="store.toolPresets[tool].width"
            type="range"
            min="1"
            max="40"
            step="1"
            aria-label="预设线条宽度 / Preset line width"
            @input="updateLine(tool, { width: numberValue($event) })"
          />
        </div>
        <label class="single-field">
          <span>线型 / Style</span>
          <select
            :value="store.toolPresets[tool].style"
            @change="
              updateLine(tool, {
                style: textValue($event) as 'solid' | 'dashed',
              })
            "
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
          </select>
        </label>
      </section>
      <section v-if="tool === 'arrow'" class="property-section">
        <div class="slider-heading">
          <h3>箭头大小 / Arrowhead</h3>
          <output>{{ store.toolPresets.arrow.pointerLength }} px</output>
        </div>
        <input
          class="full-slider"
          :value="store.toolPresets.arrow.pointerLength"
          type="range"
          min="4"
          max="60"
          step="1"
          aria-label="预设箭头大小 / Preset arrowhead size"
          @input="updateArrowSize(numberValue($event))"
        />
      </section>
    </template>

    <template v-else>
      <section class="property-section">
        <div class="slider-heading">
          <h3>笔触粗细 / Width</h3>
          <output>{{ store.toolPresets[tool].width }} px</output>
        </div>
        <input
          class="full-slider"
          :value="store.toolPresets[tool].width"
          type="range"
          min="1"
          max="100"
          step="1"
          aria-label="预设笔触粗细 / Preset stroke width"
          @input="
            updateFreehand(tool, { width: numberValue($event) })
          "
        />
      </section>
      <section class="property-section">
        <label class="tool-color-field">
          <span>笔触颜色 / Stroke color</span>
          <span>
            <input
              :value="store.toolPresets[tool].color"
              type="color"
              aria-label="预设笔触颜色 / Preset stroke color"
              @input="
                updateFreehand(tool, { color: textValue($event) })
              "
            />
            <output>{{ store.toolPresets[tool].color.toUpperCase() }}</output>
          </span>
        </label>
        <div class="slider-heading tool-opacity-heading">
          <h3>不透明度 / Opacity</h3>
          <output>
            {{ Math.round(store.toolPresets[tool].opacity * 100) }}%
          </output>
        </div>
        <input
          class="full-slider"
          :value="store.toolPresets[tool].opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="预设笔触不透明度 / Preset stroke opacity"
          @input="
            updateFreehand(tool, { opacity: numberValue($event) })
          "
        />
      </section>
    </template>
  </template>
</template>

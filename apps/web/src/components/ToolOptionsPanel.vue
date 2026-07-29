<script setup lang="ts">
import { computed } from "vue";
import { RotateCcw } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useEditorStore } from "../stores/editor";
import {
  isCreationTool,
  type CreationTool,
  type ToolPresets,
} from "../tool-presets";

const store = useEditorStore();
const { t } = useI18n();
const tool = computed<CreationTool | null>(() =>
  isCreationTool(store.tool) ? store.tool : null,
);

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
        <h2>{{ t("options.settings", { tool: t(tool) }) }}</h2>
        <p>{{ t("options.hint") }}</p>
      </div>
      <button type="button" :title="t('options.restoreDefaults')" @click="reset">
        <RotateCcw :size="16" />
        {{ t("options.reset") }}
      </button>
    </section>

    <template v-if="tool === 'text'">
      <section class="property-section">
        <label class="text-field">
          <span>{{ t("options.defaultText") }}</span>
          <textarea
            :value="store.toolPresets.text.text"
            rows="3"
            @input="updateText({ text: textValue($event) })"
          ></textarea>
        </label>
        <div class="field-grid tool-options-grid">
          <label>
            <span>{{ t("options.fontSize") }}</span>
            <input
              :value="store.toolPresets.text.fontSize"
              type="number"
              min="8"
              max="400"
              @input="updateText({ fontSize: numberValue($event) })"
            />
          </label>
          <label>
            <span>{{ t("options.textWidth") }}</span>
            <input
              :value="store.toolPresets.text.width"
              type="number"
              min="80"
              max="2000"
              @input="updateText({ width: numberValue($event) })"
            />
          </label>
          <label>
            <span>{{ t("options.weight") }}</span>
            <select
              :value="store.toolPresets.text.fontWeight"
              @change="updateText({ fontWeight: numberValue($event) })"
            >
              <option :value="400">{{ t("options.regular") }}</option>
              <option :value="500">{{ t("options.medium") }}</option>
              <option :value="600">{{ t("options.semibold") }}</option>
              <option :value="700">{{ t("options.bold") }}</option>
              <option :value="800">{{ t("options.extrabold") }}</option>
            </select>
          </label>
          <label>
            <span>{{ t("options.align") }}</span>
            <select
              :value="store.toolPresets.text.align"
              @change="
                updateText({
                  align: textValue($event) as ToolPresets['text']['align'],
                })
              "
            >
              <option value="left">{{ t("options.alignLeft") }}</option>
              <option value="center">{{ t("options.alignCenter") }}</option>
              <option value="right">{{ t("options.alignRight") }}</option>
            </select>
          </label>
        </div>
        <label class="tool-color-field">
          <span>{{ t("options.textColor") }}</span>
          <span>
            <input
              :value="store.toolPresets.text.color"
              type="color"
              :aria-label="t('options.textColor')"
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
          <h3>{{ t("options.stroke") }}</h3>
          <input
            :checked="store.toolPresets[tool].style.stroke.enabled"
            type="checkbox"
            :aria-label="t('options.stroke')"
            @change="updateShape('stroke', 'enabled', checkedValue($event))"
          />
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].style.stroke.color"
            type="color"
            :aria-label="t('inspector.strokeColor')"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @input="updateShape('stroke', 'color', textValue($event))"
          />
          <input
            :value="store.toolPresets[tool].style.stroke.width"
            type="range"
            min="0"
            max="40"
            step="1"
            :aria-label="t('inspector.strokeWidth')"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @input="updateShape('stroke', 'width', numberValue($event))"
          />
          <output>{{ store.toolPresets[tool].style.stroke.width }} px</output>
        </div>
        <label class="single-field">
          <span>{{ t("options.style") }}</span>
          <select
            :value="store.toolPresets[tool].style.stroke.style"
            :disabled="!store.toolPresets[tool].style.stroke.enabled"
            @change="updateShape('stroke', 'style', textValue($event))"
          >
            <option value="solid">{{ t("options.solid") }}</option>
            <option value="dashed">{{ t("options.dashed") }}</option>
          </select>
        </label>
      </section>

      <section class="property-section">
        <div class="toggle-row">
          <h3>{{ t("options.fill") }}</h3>
          <input
            :checked="store.toolPresets[tool].style.fill.enabled"
            type="checkbox"
            :aria-label="t('options.fill')"
            @change="updateShape('fill', 'enabled', checkedValue($event))"
          />
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].style.fill.color"
            type="color"
            :aria-label="t('inspector.fillColor')"
            :disabled="!store.toolPresets[tool].style.fill.enabled"
            @input="updateShape('fill', 'color', textValue($event))"
          />
          <input
            :value="store.toolPresets[tool].style.fill.opacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :aria-label="t('inspector.fillOpacity')"
            :disabled="!store.toolPresets[tool].style.fill.enabled"
            @input="updateShape('fill', 'opacity', numberValue($event))"
          />
          <output>
            {{ Math.round(store.toolPresets[tool].style.fill.opacity * 100) }}%
          </output>
        </div>
        <label v-if="tool === 'rectangle'" class="single-field">
          <span>{{ t("options.cornerRadius") }}</span>
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
          <h3>{{ t("options.line") }}</h3>
          <output>{{ store.toolPresets[tool].width }} px</output>
        </div>
        <div class="style-row tool-style-row">
          <input
            :value="store.toolPresets[tool].color"
            type="color"
            :aria-label="t('inspector.lineColor')"
            @input="updateLine(tool, { color: textValue($event) })"
          />
          <input
            :value="store.toolPresets[tool].width"
            type="range"
            min="1"
            max="40"
            step="1"
            :aria-label="t('inspector.lineWidth')"
            @input="updateLine(tool, { width: numberValue($event) })"
          />
        </div>
        <label class="single-field">
          <span>{{ t("options.style") }}</span>
          <select
            :value="store.toolPresets[tool].style"
            @change="
              updateLine(tool, {
                style: textValue($event) as 'solid' | 'dashed',
              })
            "
          >
            <option value="solid">{{ t("options.solid") }}</option>
            <option value="dashed">{{ t("options.dashed") }}</option>
          </select>
        </label>
      </section>
      <section v-if="tool === 'arrow'" class="property-section">
        <div class="slider-heading">
          <h3>{{ t("options.arrowhead") }}</h3>
          <output>{{ store.toolPresets.arrow.pointerLength }} px</output>
        </div>
        <input
          class="full-slider"
          :value="store.toolPresets.arrow.pointerLength"
          type="range"
          min="4"
          max="60"
          step="1"
          :aria-label="t('options.arrowhead')"
          @input="updateArrowSize(numberValue($event))"
        />
      </section>
    </template>

    <template v-else>
      <section class="property-section">
        <div class="slider-heading">
          <h3>{{ t("options.strokeWidth") }}</h3>
          <output>{{ store.toolPresets[tool].width }} px</output>
        </div>
        <input
          class="full-slider"
          :value="store.toolPresets[tool].width"
          type="range"
          min="1"
          max="100"
          step="1"
          :aria-label="t('options.strokeWidth')"
          @input="
            updateFreehand(tool, { width: numberValue($event) })
          "
        />
      </section>
      <section class="property-section">
        <label class="tool-color-field">
          <span>{{ t("options.strokeColor") }}</span>
          <span>
            <input
              :value="store.toolPresets[tool].color"
              type="color"
              :aria-label="t('options.strokeColor')"
              @input="
                updateFreehand(tool, { color: textValue($event) })
              "
            />
            <output>{{ store.toolPresets[tool].color.toUpperCase() }}</output>
          </span>
        </label>
        <div class="slider-heading tool-opacity-heading">
          <h3>{{ t("options.opacity") }}</h3>
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
          :aria-label="t('options.opacity')"
          @input="
            updateFreehand(tool, { opacity: numberValue($event) })
          "
        />
      </section>
    </template>
  </template>
</template>

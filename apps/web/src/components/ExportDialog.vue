<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { Download, X } from "lucide-vue-next";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";

const emit = defineEmits<{ close: [] }>();
const store = useEditorStore();
const platform = inject(platformKey)!;
const format = ref<"image/png" | "image/jpeg" | "image/webp">("image/png");
const quality = ref(0.9);
const scale = ref(1);
const selectionOnly = ref(false);
const exporting = ref(false);
const hasSelection = computed(() => store.selectedIds.length > 0);

async function submit() {
  exporting.value = true;
  try {
    await store.exportImage(platform, {
      format: format.value,
      quality: quality.value,
      scale: scale.value,
      selectionOnly: selectionOnly.value,
    });
    emit("close");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header>
        <div>
          <h2 id="export-title">导出图片 / Export</h2>
          <p>使用原始图片资源合成最终结果</p>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <div class="dialog-body">
        <label>
          <span>格式 / Format</span>
          <select v-model="format">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>
        <label>
          <span>倍率 / Scale</span>
          <select v-model.number="scale">
            <option :value="0.5">0.5×</option>
            <option :value="1">1×</option>
            <option :value="2">2×</option>
          </select>
        </label>
        <label v-if="format !== 'image/png'" class="quality-field">
          <span>质量 / Quality</span>
          <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05" />
          <output>{{ Math.round(quality * 100) }}%</output>
        </label>
        <label class="checkbox-field" :class="{ disabled: !hasSelection }">
          <input v-model="selectionOnly" type="checkbox" :disabled="!hasSelection" />
          <span>仅导出选中对象 / Selection only</span>
        </label>
        <div class="export-summary">
          {{ Math.round(store.document.canvas.width * scale) }} ×
          {{ Math.round(store.document.canvas.height * scale) }} px
        </div>
      </div>
      <footer>
        <button class="secondary-button" type="button" @click="emit('close')">
          取消 / Cancel
        </button>
        <button class="primary-button" type="button" :disabled="exporting" @click="submit">
          <Download :size="18" />
          {{ exporting ? "正在导出…" : "导出 / Export" }}
        </button>
      </footer>
    </section>
  </div>
</template>


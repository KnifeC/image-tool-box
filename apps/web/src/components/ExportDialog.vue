<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { Download, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";

const emit = defineEmits<{ close: [] }>();
const store = useEditorStore();
const { t } = useI18n();
const platform = inject(platformKey)!;
const format = ref<"image/png" | "image/jpeg" | "image/webp">("image/png");
const quality = ref(0.9);
const scale = ref(1);
const selectionOnly = ref(false);
const exporting = ref(false);
const hasSelection = computed(() => store.selectedNodes.length > 0);
const exportBounds = computed(() => store.documentBounds);

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
          <h2 id="export-title">{{ t("exportDialog.title") }}</h2>
          <p>{{ t("exportDialog.description") }}</p>
        </div>
        <button type="button" :aria-label="t('exportDialog.close')" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <div class="dialog-body">
        <label>
          <span>{{ t("exportDialog.format") }}</span>
          <select v-model="format">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>
        <label>
          <span>{{ t("exportDialog.scale") }}</span>
          <select v-model.number="scale">
            <option :value="0.5">0.5×</option>
            <option :value="1">1×</option>
            <option :value="2">2×</option>
          </select>
        </label>
        <label v-if="format !== 'image/png'" class="quality-field">
          <span>{{ t("exportDialog.quality") }}</span>
          <input v-model.number="quality" type="range" min="0.1" max="1" step="0.05" />
          <output>{{ Math.round(quality * 100) }}%</output>
        </label>
        <label class="checkbox-field" :class="{ disabled: !hasSelection }">
          <input v-model="selectionOnly" type="checkbox" :disabled="!hasSelection" />
          <span>{{ t("exportDialog.selectionOnly") }}</span>
        </label>
        <div class="export-summary">
          <template v-if="exportBounds">
            {{ Math.round(exportBounds.width * scale) }} ×
            {{ Math.round(exportBounds.height * scale) }} px
          </template>
          <template v-else>{{ t("exportDialog.nothing") }}</template>
        </div>
        <p
          v-if="
            format === 'image/jpeg' &&
            (!store.document.canvas.background.visible ||
              store.document.canvas.background.type === 'transparent')
          "
          class="export-warning"
        >
          {{ t("exportDialog.jpgWarning") }}
        </p>
      </div>
      <footer>
        <button class="secondary-button" type="button" @click="emit('close')">
          {{ t("exportDialog.cancel") }}
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="exporting || !exportBounds"
          @click="submit"
        >
          <Download :size="18" />
          {{ exporting ? t("exportDialog.exporting") : t("exportDialog.export") }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowUpRight,
  Circle,
  Crop,
  Hand,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Minus,
  PenLine,
  Square,
  Type,
} from "lucide-vue-next";
import type { Component } from "vue";
import { useI18n } from "vue-i18n";
import { useEditorStore, type EditorTool } from "../stores/editor";

const store = useEditorStore();
const { t } = useI18n();
const emit = defineEmits<{ import: [] }>();

const tools: Array<{
  id: EditorTool;
  shortcut?: string;
  icon: Component;
}> = [
  { id: "select", shortcut: "select", icon: MousePointer2 },
  { id: "import", shortcut: "import", icon: ImagePlus },
  { id: "crop", shortcut: "crop", icon: Crop },
  { id: "text", shortcut: "text", icon: Type },
  { id: "rectangle", shortcut: "rectangle", icon: Square },
  { id: "ellipse", icon: Circle },
  { id: "line", icon: Minus },
  { id: "arrow", icon: ArrowUpRight },
  { id: "pen", shortcut: "pen", icon: PenLine },
  { id: "highlighter", icon: Highlighter },
  { id: "pan", shortcut: "pan", icon: Hand },
];

function activate(id: EditorTool) {
  if (id === "import") {
    emit("import");
    return;
  }
  store.setTool(id);
}
</script>

<template>
  <nav class="toolrail" :aria-label="t('mobile.tools')">
    <button
      v-for="item in tools"
      :key="item.id"
      class="tool-button"
      :class="{ active: store.tool === item.id }"
      type="button"
      :title="
        item.shortcut
          ? `${t(item.id)} (${t(`shortcuts.${item.shortcut}`)})`
          : t(item.id)
      "
      @click="activate(item.id)"
    >
      <component :is="item.icon" :size="23" :stroke-width="1.8" />
      <span class="desktop-tool-label">{{ t(item.id) }}</span>
      <span class="mobile-tool-label">{{ t(item.id) }}</span>
      <kbd v-if="item.shortcut && item.shortcut !== 'import'" class="tool-shortcut">
        {{ t(`shortcuts.${item.shortcut}`) }}
      </kbd>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Layers3, SlidersHorizontal } from "lucide-vue-next";
import type { MenuCommand } from "@imagetoolbox/platform-api";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";
import BottomBar from "./BottomBar.vue";
import CanvasStage from "./CanvasStage.vue";
import ExportDialog from "./ExportDialog.vue";
import InspectorPanel from "./InspectorPanel.vue";
import ToolRail from "./ToolRail.vue";
import TopBar from "./TopBar.vue";

const store = useEditorStore();
const platform = inject(platformKey)!;
const { locale, t } = useI18n();
const exportOpen = ref(false);
let removeMenuListener: (() => void) | undefined;

async function importImages() {
  const files = await platform.openFiles({
    accept: "image/jpeg,image/png,image/webp,image/bmp,.ibox",
    multiple: true,
  });
  await store.importFiles(files);
}

function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) store.setTemporaryPan(true);
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
  } else if (modifier && event.key.toLowerCase() === "d") {
    event.preventDefault();
    store.duplicateSelected();
  } else if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void store.saveProject(platform);
  } else if (modifier && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void importImages();
  } else if (modifier && event.key.toLowerCase() === "e") {
    event.preventDefault();
    exportOpen.value = true;
  } else if (event.key === "Delete" || event.key === "Backspace") {
    store.deleteSelected();
  } else if (event.key.toLowerCase() === "v") {
    store.setTool("select");
  } else if (event.key.toLowerCase() === "c") {
    store.setTool("crop");
  } else if (event.key.toLowerCase() === "t") {
    store.setTool("text");
  } else if (event.key.toLowerCase() === "r") {
    store.setTool("rectangle");
  } else if (event.key.toLowerCase() === "p") {
    store.setTool("pen");
  } else if (event.key === "Escape") {
    store.tool === "crop" ? store.cancelCrop() : store.setTool("select");
  } else if (event.key === "Enter" && store.tool === "crop") {
    store.applyCrop();
  }
}

function keyboardUp(event: KeyboardEvent) {
  if (event.code === "Space") store.setTemporaryPan(false);
}

function releaseTemporaryPan() {
  store.setTemporaryPan(false);
}

function handleMenuCommand(command: MenuCommand) {
  if (command === "import") void importImages();
  if (command === "open-project") void store.openProject(platform);
  if (command === "save-project") void store.saveProject(platform);
  if (command === "export") exportOpen.value = true;
  if (command === "undo") store.undo();
  if (command === "redo") store.redo();
  if (command === "set-locale-zh") locale.value = "zh";
  if (command === "set-locale-en") locale.value = "en";
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const files = [...(event.dataTransfer?.files ?? [])];
  void Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type,
      bytes: await file.arrayBuffer(),
    })),
  ).then(store.importFiles);
}

onMounted(() => {
  window.addEventListener("keydown", keyboard);
  window.addEventListener("keyup", keyboardUp);
  window.addEventListener("blur", releaseTemporaryPan);
  removeMenuListener = platform.onMenuCommand(handleMenuCommand);
});

watch(
  locale,
  (nextLocale) => {
    const supportedLocale = nextLocale === "zh" ? "zh" : "en";
    window.localStorage.setItem("imagetoolbox.locale", supportedLocale);
    void platform.setLocale(supportedLocale);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", keyboard);
  window.removeEventListener("keyup", keyboardUp);
  window.removeEventListener("blur", releaseTemporaryPan);
  removeMenuListener?.();
});
</script>

<template>
  <div class="app-shell" @dragover.prevent @drop="onDrop">
    <TopBar :on-export="() => (exportOpen = true)" />
    <div class="editor-grid">
      <ToolRail @import="importImages" />
      <CanvasStage />
      <InspectorPanel />
    </div>
    <BottomBar />

    <div class="mobile-panel-actions">
      <button type="button" @click="store.mobilePanel = 'properties'">
        <SlidersHorizontal :size="19" />
        {{ t("mobile.properties") }}
      </button>
      <button type="button" @click="store.mobilePanel = 'layers'">
        <Layers3 :size="19" />
        {{ t("mobile.layers") }}
      </button>
    </div>

    <Transition name="fade">
      <ExportDialog v-if="exportOpen" @close="exportOpen = false" />
    </Transition>
    <Transition name="toast">
      <div v-if="store.toast" class="toast-message">{{ store.toast }}</div>
    </Transition>
  </div>
</template>

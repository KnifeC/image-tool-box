<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Layers3, SlidersHorizontal } from "lucide-vue-next";
import type { MenuCommand } from "@imagetoolbox/platform-api";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";
import {
  getClipboardImageFiles,
  toOpenedClipboardImages,
} from "../clipboard";
import BottomBar from "./BottomBar.vue";
import CanvasStage from "./CanvasStage.vue";
import ExportDialog from "./ExportDialog.vue";
import InspectorPanel from "./InspectorPanel.vue";
import NewProjectDialog from "./NewProjectDialog.vue";
import ToolRail from "./ToolRail.vue";
import TopBar from "./TopBar.vue";

const store = useEditorStore();
const platform = inject(platformKey)!;
const { locale, t } = useI18n();
const exportOpen = ref(false);
const newProjectOpen = ref(false);
const editorGridRef = ref<HTMLElement | null>(null);
const resizingPanel = ref<"tools" | "inspector" | null>(null);
const TOOLRAIL_WIDTH_STORAGE_KEY = "imagetoolbox.toolrail-width";
const INSPECTOR_WIDTH_STORAGE_KEY = "imagetoolbox.inspector-width";
const TOOLRAIL_MIN_WIDTH = 88;
const TOOLRAIL_MAX_WIDTH = 320;
const INSPECTOR_MIN_WIDTH = 280;
const INSPECTOR_MAX_WIDTH = 640;
const MIN_WORKSPACE_WIDTH = 320;
const defaultToolrailWidth = window.innerWidth <= 1240 ? 88 : 150;
const defaultInspectorWidth = window.innerWidth <= 1240 ? 340 : 400;
const toolrailWidth = ref(
  loadPanelWidth(TOOLRAIL_WIDTH_STORAGE_KEY, defaultToolrailWidth),
);
const inspectorWidth = ref(
  loadPanelWidth(INSPECTOR_WIDTH_STORAGE_KEY, defaultInspectorWidth),
);
const editorGridStyle = computed(() => ({
  "--toolrail-width": `${toolrailWidth.value}px`,
  "--inspector-width": `${inspectorWidth.value}px`,
}));
let removeMenuListener: (() => void) | undefined;
let sidePanelResizePointerId: number | undefined;
let sidePanelResizeTarget: HTMLElement | undefined;

function loadPanelWidth(key: string, fallback: number) {
  const saved = Number(window.localStorage.getItem(key));
  return Number.isFinite(saved) && saved > 0 ? saved : fallback;
}

function panelWidthLimits(panel: "tools" | "inspector") {
  const gridWidth = editorGridRef.value?.getBoundingClientRect().width ?? window.innerWidth;
  const otherWidth =
    panel === "tools" ? inspectorWidth.value : toolrailWidth.value;
  const minimum =
    panel === "tools" ? TOOLRAIL_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
  const maximum =
    panel === "tools" ? TOOLRAIL_MAX_WIDTH : INSPECTOR_MAX_WIDTH;
  return {
    minimum,
    maximum: Math.max(
      minimum,
      Math.min(maximum, gridWidth - otherWidth - MIN_WORKSPACE_WIDTH),
    ),
  };
}

function setPanelWidth(panel: "tools" | "inspector", width: number) {
  const { minimum, maximum } = panelWidthLimits(panel);
  const nextWidth = Math.round(Math.min(maximum, Math.max(minimum, width)));
  if (panel === "tools") {
    toolrailWidth.value = nextWidth;
  } else {
    inspectorWidth.value = nextWidth;
  }
}

function updatePanelWidth(panel: "tools" | "inspector", clientX: number) {
  const grid = editorGridRef.value;
  if (!grid) return;
  const bounds = grid.getBoundingClientRect();
  setPanelWidth(
    panel,
    panel === "tools" ? clientX - bounds.left : bounds.right - clientX,
  );
}

function startSidePanelResize(
  event: PointerEvent,
  panel: "tools" | "inspector",
) {
  if (event.button !== 0) return;
  resizingPanel.value = panel;
  sidePanelResizePointerId = event.pointerId;
  sidePanelResizeTarget = event.currentTarget as HTMLElement;
  sidePanelResizeTarget.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", continueSidePanelResize);
  window.addEventListener("pointerup", finishSidePanelResize);
  window.addEventListener("pointercancel", finishSidePanelResize);
  updatePanelWidth(panel, event.clientX);
  event.preventDefault();
}

function continueSidePanelResize(event: PointerEvent) {
  if (
    !resizingPanel.value ||
    event.pointerId !== sidePanelResizePointerId
  ) {
    return;
  }
  updatePanelWidth(resizingPanel.value, event.clientX);
}

function finishSidePanelResize(event: PointerEvent) {
  const panel = resizingPanel.value;
  if (!panel || event.pointerId !== sidePanelResizePointerId) return;
  updatePanelWidth(panel, event.clientX);
  resizingPanel.value = null;
  if (sidePanelResizeTarget?.hasPointerCapture(event.pointerId)) {
    sidePanelResizeTarget.releasePointerCapture(event.pointerId);
  }
  sidePanelResizePointerId = undefined;
  sidePanelResizeTarget = undefined;
  removeSidePanelResizeListeners();
  window.localStorage.setItem(
    panel === "tools"
      ? TOOLRAIL_WIDTH_STORAGE_KEY
      : INSPECTOR_WIDTH_STORAGE_KEY,
    String(panel === "tools" ? toolrailWidth.value : inspectorWidth.value),
  );
}

function removeSidePanelResizeListeners() {
  window.removeEventListener("pointermove", continueSidePanelResize);
  window.removeEventListener("pointerup", finishSidePanelResize);
  window.removeEventListener("pointercancel", finishSidePanelResize);
}

function resizeSidePanelWithKeyboard(
  event: KeyboardEvent,
  panel: "tools" | "inspector",
) {
  const step = event.shiftKey ? 40 : 16;
  const current = panel === "tools" ? toolrailWidth.value : inspectorWidth.value;
  const { minimum, maximum } = panelWidthLimits(panel);
  let next = current;

  if (event.key === "ArrowLeft") {
    next += panel === "tools" ? -step : step;
  } else if (event.key === "ArrowRight") {
    next += panel === "tools" ? step : -step;
  } else if (event.key === "Home") {
    next = minimum;
  } else if (event.key === "End") {
    next = maximum;
  } else {
    return;
  }

  setPanelWidth(panel, next);
  window.localStorage.setItem(
    panel === "tools"
      ? TOOLRAIL_WIDTH_STORAGE_KEY
      : INSPECTOR_WIDTH_STORAGE_KEY,
    String(panel === "tools" ? toolrailWidth.value : inspectorWidth.value),
  );
  event.preventDefault();
}

function resetSidePanelWidth(panel: "tools" | "inspector") {
  const defaultWidth =
    panel === "tools" ? defaultToolrailWidth : defaultInspectorWidth;
  setPanelWidth(panel, defaultWidth);
  window.localStorage.removeItem(
    panel === "tools"
      ? TOOLRAIL_WIDTH_STORAGE_KEY
      : INSPECTOR_WIDTH_STORAGE_KEY,
  );
}

function keepPanelWidthsInBounds() {
  setPanelWidth("inspector", inspectorWidth.value);
  setPanelWidth("tools", toolrailWidth.value);
}

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

function requestNewProject() {
  if (store.hasProjectContent) {
    newProjectOpen.value = true;
    return;
  }
  void store.createNewProject();
}

async function confirmNewProject() {
  newProjectOpen.value = false;
  await store.createNewProject();
}

function flushOnPageHide() {
  void store.flushAutosave();
}

function flushWhenHidden() {
  if (document.visibilityState === "hidden") flushOnPageHide();
}

function protectBeforeUnload(event: BeforeUnloadEvent) {
  if (!store.hasPendingAutosave) return;
  void store.flushAutosave();
  event.preventDefault();
  event.returnValue = "";
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

function onPaste(event: ClipboardEvent) {
  const imageFiles = getClipboardImageFiles(event.clipboardData);
  if (!imageFiles.length) return;

  event.preventDefault();
  void toOpenedClipboardImages(imageFiles)
    .then(store.importFiles)
    .then(() => store.showToast(t("clipboard.imported")))
    .catch((error) => {
      console.error(error);
      store.showToast(t("clipboard.importFailed"));
    });
}

onMounted(() => {
  window.addEventListener("keydown", keyboard);
  window.addEventListener("keyup", keyboardUp);
  window.addEventListener("paste", onPaste);
  window.addEventListener("blur", releaseTemporaryPan);
  window.addEventListener("pagehide", flushOnPageHide);
  window.addEventListener("beforeunload", protectBeforeUnload);
  document.addEventListener("visibilitychange", flushWhenHidden);
  window.addEventListener("resize", keepPanelWidthsInBounds);
  keepPanelWidthsInBounds();
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
  removeSidePanelResizeListeners();
  window.removeEventListener("keydown", keyboard);
  window.removeEventListener("keyup", keyboardUp);
  window.removeEventListener("paste", onPaste);
  window.removeEventListener("blur", releaseTemporaryPan);
  window.removeEventListener("pagehide", flushOnPageHide);
  window.removeEventListener("beforeunload", protectBeforeUnload);
  window.removeEventListener("resize", keepPanelWidthsInBounds);
  document.removeEventListener("visibilitychange", flushWhenHidden);
  void store.flushAutosave();
  removeMenuListener?.();
});
</script>

<template>
  <div class="app-shell" @dragover.prevent @drop="onDrop">
    <TopBar
      :on-export="() => (exportOpen = true)"
      :on-new="requestNewProject"
    />
    <div
      ref="editorGridRef"
      class="editor-grid"
      :class="{
        'crop-active': store.tool === 'crop',
        'is-resizing-side-panel': resizingPanel,
      }"
      :style="editorGridStyle"
    >
      <ToolRail @import="importImages" />
      <div
        class="side-panel-resizer toolrail-resizer"
        data-testid="toolrail-resizer"
        role="separator"
        :aria-label="t('layout.resizeTools')"
        aria-orientation="vertical"
        :aria-valuemin="TOOLRAIL_MIN_WIDTH"
        :aria-valuemax="TOOLRAIL_MAX_WIDTH"
        :aria-valuenow="toolrailWidth"
        :title="t('layout.resizeToolsHint')"
        tabindex="0"
        @dblclick="resetSidePanelWidth('tools')"
        @keydown="resizeSidePanelWithKeyboard($event, 'tools')"
        @pointerdown="startSidePanelResize($event, 'tools')"
      />
      <CanvasStage />
      <div
        class="side-panel-resizer inspector-resizer"
        data-testid="inspector-resizer"
        role="separator"
        :aria-label="t('layout.resizeInspector')"
        aria-orientation="vertical"
        :aria-valuemin="INSPECTOR_MIN_WIDTH"
        :aria-valuemax="INSPECTOR_MAX_WIDTH"
        :aria-valuenow="inspectorWidth"
        :title="t('layout.resizeInspectorHint')"
        tabindex="0"
        @dblclick="resetSidePanelWidth('inspector')"
        @keydown="resizeSidePanelWithKeyboard($event, 'inspector')"
        @pointerdown="startSidePanelResize($event, 'inspector')"
      />
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
    <Transition name="fade">
      <NewProjectDialog
        v-if="newProjectOpen"
        @close="newProjectOpen = false"
        @confirm="confirmNewProject"
      />
    </Transition>
    <Transition name="toast">
      <div v-if="store.toast" class="toast-message">{{ store.toast }}</div>
    </Transition>
  </div>
</template>

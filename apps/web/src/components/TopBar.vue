<script setup lang="ts">
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import {
  ChevronDown,
  Download,
  FileImage,
  FolderOpen,
  Languages,
  Redo2,
  Save,
  Undo2,
} from "lucide-vue-next";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";

defineProps<{ onExport: () => void }>();

const store = useEditorStore();
const platform = inject(platformKey)!;
const { locale } = useI18n();

async function importImages() {
  const files = await platform.openFiles({
    accept: "image/jpeg,image/png,image/webp,image/bmp,.ibox",
    multiple: true,
  });
  await store.importFiles(files);
}

function toggleLocale() {
  locale.value = locale.value === "zh" ? "en" : "zh";
  localStorage.setItem("imagetoolbox.locale", locale.value);
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <span></span>
      </span>
      <strong>ImageToolBox</strong>
    </div>

    <button class="document-name" type="button">
      <span>{{ store.document.name }}</span>
      <ChevronDown :size="15" />
    </button>

    <div class="topbar-spacer"></div>

    <div class="command-group command-history">
      <button
        class="command"
        type="button"
        :disabled="!store.canUndo"
        title="撤销 / Undo"
        @click="store.undo"
      >
        <Undo2 :size="20" />
        <span>撤销</span>
      </button>
      <button
        class="command"
        type="button"
        :disabled="!store.canRedo"
        title="重做 / Redo"
        @click="store.redo"
      >
        <Redo2 :size="20" />
        <span>重做</span>
      </button>
    </div>

    <div class="command-group command-files">
      <button class="command" type="button" @click="importImages">
        <FileImage :size="20" />
        <span>导入</span>
      </button>
      <button class="command command-open" type="button" @click="store.openProject(platform)">
        <FolderOpen :size="20" />
        <span>打开</span>
      </button>
      <button class="command" type="button" @click="store.saveProject(platform)">
        <Save :size="20" />
        <span>保存项目</span>
      </button>
    </div>

    <button
      class="icon-command locale-command"
      type="button"
      title="切换语言 / Switch language"
      @click="toggleLocale"
    >
      <Languages :size="19" />
      <span>{{ locale === "zh" ? "中" : "EN" }}</span>
    </button>

    <button class="export-button" type="button" @click="onExport">
      <Download :size="20" />
      <span>导出 / Export</span>
    </button>
  </header>
</template>


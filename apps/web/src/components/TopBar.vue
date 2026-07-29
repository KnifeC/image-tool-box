<script setup lang="ts">
import { inject, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  Download,
  FileImage,
  FolderOpen,
  Languages,
  Pencil,
  Redo2,
  Save,
  Undo2,
} from "lucide-vue-next";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";

defineProps<{ onExport: () => void }>();

const store = useEditorStore();
const platform = inject(platformKey)!;
const { locale, t } = useI18n();
const renaming = ref(false);
const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

async function importImages() {
  const files = await platform.openFiles({
    accept: "image/jpeg,image/png,image/webp,image/bmp,.ibox",
    multiple: true,
  });
  await store.importFiles(files);
}

function toggleLocale() {
  locale.value = locale.value === "zh" ? "en" : "zh";
}

async function startRename() {
  nameDraft.value = store.document.name;
  renaming.value = true;
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
}

function commitRename() {
  if (!renaming.value) return;
  store.renameDocument(nameDraft.value);
  renaming.value = false;
}

function cancelRename() {
  renaming.value = false;
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

    <form v-if="renaming" class="document-name-editor" @submit.prevent="commitRename">
      <input
        ref="nameInput"
        v-model="nameDraft"
        :aria-label="t('topbar.projectName')"
        maxlength="120"
        @blur="commitRename"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
      />
    </form>
    <button
      v-else
      class="document-name"
      type="button"
      :title="t('topbar.renameHint')"
      :aria-label="`${t('topbar.rename')}: ${store.document.name}`"
      @click="startRename"
    >
      <span>{{ store.document.name }}</span>
      <Pencil :size="14" />
    </button>

    <div class="topbar-spacer"></div>

    <div class="command-group command-history">
      <button
        class="command"
        type="button"
        :disabled="!store.canUndo"
        :title="`${t('topbar.undo')} (${t('shortcuts.undo')})`"
        @click="store.undo"
      >
        <Undo2 :size="20" />
        <span>{{ t("topbar.undo") }}</span>
      </button>
      <button
        class="command"
        type="button"
        :disabled="!store.canRedo"
        :title="`${t('topbar.redo')} (${t('shortcuts.redo')})`"
        @click="store.redo"
      >
        <Redo2 :size="20" />
        <span>{{ t("topbar.redo") }}</span>
      </button>
    </div>

    <div class="command-group command-files">
      <button
        class="command"
        type="button"
        :title="`${t('import')} (${t('shortcuts.import')})`"
        @click="importImages"
      >
        <FileImage :size="20" />
        <span>{{ t("topbar.import") }}</span>
      </button>
      <button class="command command-open" type="button" @click="store.openProject(platform)">
        <FolderOpen :size="20" />
        <span>{{ t("topbar.open") }}</span>
      </button>
      <button
        class="command"
        type="button"
        :title="`${t('topbar.save')} (${t('shortcuts.save')})`"
        @click="store.saveProject(platform)"
      >
        <Save :size="20" />
        <span>{{ t("topbar.save") }}</span>
      </button>
    </div>

    <button
      class="icon-command locale-command"
      type="button"
      :title="t('topbar.switchLanguage')"
      @click="toggleLocale"
    >
      <Languages :size="19" />
      <span>{{ locale === "zh" ? "中" : "EN" }}</span>
    </button>

    <button
      class="export-button"
      type="button"
      :title="`${t('topbar.export')} (${t('shortcuts.export')})`"
      @click="onExport"
    >
      <Download :size="20" />
      <span>{{ t("topbar.export") }}</span>
    </button>
  </header>
</template>

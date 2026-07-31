<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  Check,
  ClipboardCopy,
  Download,
  FileImage,
  FilePlus2,
  FolderOpen,
  Languages,
  Pencil,
  Redo2,
  Save,
  Undo2,
} from "lucide-vue-next";
import { platformKey } from "../platform";
import { useEditorStore } from "../stores/editor";

defineProps<{ onExport: () => void; onNew: () => void }>();

const store = useEditorStore();
const platform = inject(platformKey)!;
const { locale, t } = useI18n();
const renaming = ref(false);
const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
const copying = ref(false);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const brandIconUrl = `${import.meta.env.BASE_URL}icon.svg`;

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

async function quickCopyPng() {
  copying.value = true;
  try {
    await store.copyImageToClipboard(platform, {
      scale: 1,
      selectionOnly: false,
    });
    copied.value = true;
    copiedTimer = setTimeout(() => {
      copied.value = false;
      copiedTimer = undefined;
    }, 1800);
  } catch (error) {
    console.error(error);
    store.showToast(t("exportDialog.copyFailed"));
  } finally {
    copying.value = false;
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <img class="brand-mark" :src="brandIconUrl" alt="" aria-hidden="true" />
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
      <button class="command command-new" type="button" @click="onNew">
        <FilePlus2 :size="20" />
        <span>{{ t("topbar.new") }}</span>
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
      class="quick-copy-button"
      type="button"
      :title="copied ? t('topbar.copiedPng') : t('topbar.copyPng')"
      :aria-label="copied ? t('topbar.copiedPng') : t('topbar.copyPng')"
      :disabled="copying || copied || !store.documentBounds"
      @click="quickCopyPng"
    >
      <Check v-if="copied" :size="20" />
      <ClipboardCopy v-else :size="20" />
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

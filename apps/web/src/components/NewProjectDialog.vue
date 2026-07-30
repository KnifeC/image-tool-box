<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { FilePlus2, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const emit = defineEmits<{ close: []; confirm: [] }>();
const { t } = useI18n();
const dialog = ref<HTMLElement | null>(null);

onMounted(async () => {
  await nextTick();
  dialog.value?.focus();
});
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <section
      ref="dialog"
      class="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      aria-describedby="new-project-description"
      tabindex="-1"
      @keydown.esc.prevent="emit('close')"
    >
      <header>
        <div>
          <h2 id="new-project-title">{{ t("newProjectDialog.title") }}</h2>
          <p id="new-project-description">
            {{ t("newProjectDialog.description") }}
          </p>
        </div>
        <button
          type="button"
          :aria-label="t('newProjectDialog.close')"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>
      <div class="confirm-dialog-body">
        {{ t("newProjectDialog.warning") }}
      </div>
      <footer>
        <button class="secondary-button" type="button" @click="emit('close')">
          {{ t("newProjectDialog.cancel") }}
        </button>
        <button class="primary-button" type="button" @click="emit('confirm')">
          <FilePlus2 :size="18" />
          {{ t("newProjectDialog.confirm") }}
        </button>
      </footer>
    </section>
  </div>
</template>

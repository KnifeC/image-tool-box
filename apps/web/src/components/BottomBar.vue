<script setup lang="ts">
import { Maximize, Minus, Plus, ShieldCheck } from "lucide-vue-next";
import { useEditorStore } from "../stores/editor";

const store = useEditorStore();

function setZoom(value: number) {
  store.zoom = Math.max(0.1, Math.min(3, value));
}
</script>

<template>
  <footer class="statusbar">
    <div class="zoom-cluster">
      <button type="button" aria-label="缩小" @click="setZoom(store.zoom - 0.1)">
        <Minus :size="16" />
      </button>
      <input
        :value="store.zoom"
        type="range"
        min="0.1"
        max="1.5"
        step="0.05"
        aria-label="缩放"
        @input="setZoom(Number(($event.target as HTMLInputElement).value))"
      />
      <button type="button" aria-label="放大" @click="setZoom(store.zoom + 0.1)">
        <Plus :size="16" />
      </button>
      <button class="zoom-value" type="button">{{ Math.round(store.zoom * 100) }}%</button>
      <button class="fit-button" type="button" @click="store.fitCanvas">
        <Maximize :size="16" />
        <span>适应 / Fit</span>
      </button>
    </div>
    <div class="coordinate-readout">
      <span>X: {{ Math.round(store.primaryNode?.x ?? 0) }}</span>
      <span>Y: {{ Math.round(store.primaryNode?.y ?? 0) }}</span>
    </div>
    <div class="privacy-mark">
      <ShieldCheck :size="18" />
      <span>仅在本地处理 / Local only</span>
    </div>
  </footer>
</template>

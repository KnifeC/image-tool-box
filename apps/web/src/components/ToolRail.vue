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
import { useEditorStore, type EditorTool } from "../stores/editor";

const store = useEditorStore();
const emit = defineEmits<{ import: [] }>();

const tools: Array<{
  id: EditorTool;
  label: string;
  mobileLabel: string;
  icon: Component;
}> = [
  { id: "select", label: "选择", mobileLabel: "选择", icon: MousePointer2 },
  { id: "import", label: "导入图片", mobileLabel: "导入", icon: ImagePlus },
  { id: "crop", label: "裁剪", mobileLabel: "裁剪", icon: Crop },
  { id: "text", label: "文本", mobileLabel: "文本", icon: Type },
  { id: "rectangle", label: "矩形", mobileLabel: "矩形", icon: Square },
  { id: "ellipse", label: "椭圆", mobileLabel: "椭圆", icon: Circle },
  { id: "line", label: "直线", mobileLabel: "直线", icon: Minus },
  { id: "arrow", label: "箭头", mobileLabel: "箭头", icon: ArrowUpRight },
  { id: "pen", label: "画笔", mobileLabel: "画笔", icon: PenLine },
  { id: "highlighter", label: "荧光笔", mobileLabel: "标记", icon: Highlighter },
  { id: "pan", label: "平移", mobileLabel: "平移", icon: Hand },
];

function activate(id: EditorTool) {
  if (id === "import") {
    emit("import");
    return;
  }
  if (["text", "rectangle", "ellipse", "line", "arrow"].includes(id)) {
    store.addNode(id as "text" | "rectangle" | "ellipse" | "line" | "arrow");
    return;
  }
  store.setTool(id);
}
</script>

<template>
  <nav class="toolrail" aria-label="编辑工具">
    <button
      v-for="item in tools"
      :key="item.id"
      class="tool-button"
      :class="{ active: store.tool === item.id }"
      type="button"
      :title="item.label"
      @click="activate(item.id)"
    >
      <component :is="item.icon" :size="23" :stroke-width="1.8" />
      <span class="desktop-tool-label">{{ item.label }}</span>
      <span class="mobile-tool-label">{{ item.mobileLabel }}</span>
    </button>
  </nav>
</template>


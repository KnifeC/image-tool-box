import { createApp } from "vue";
import { createPinia } from "pinia";
import VueKonva from "vue-konva";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import { platformKey, resolvePlatform } from "./platform";
import "./styles.css";

const savedLocale = localStorage.getItem("imagetoolbox.locale");
const systemLocale = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";

const i18n = createI18n({
  legacy: false,
  locale: savedLocale || systemLocale,
  fallbackLocale: "en",
  messages: {
    zh: {
      select: "选择",
      import: "导入图片",
      crop: "裁剪",
      text: "文本",
      rectangle: "矩形",
      ellipse: "椭圆",
      line: "直线",
      arrow: "箭头",
      pen: "画笔",
      highlighter: "荧光笔",
      pan: "平移",
    },
    en: {
      select: "Select",
      import: "Import",
      crop: "Crop",
      text: "Text",
      rectangle: "Rectangle",
      ellipse: "Ellipse",
      line: "Line",
      arrow: "Arrow",
      pen: "Pen",
      highlighter: "Highlighter",
      pan: "Pan",
    },
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(VueKonva);
app.provide(platformKey, resolvePlatform());
app.mount("#app");


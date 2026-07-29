/// <reference types="vite/client" />

import type { DesktopBridge } from "@imagetoolbox/platform-api";

declare global {
  interface Window {
    imageToolBoxDesktop?: DesktopBridge;
  }
}

export {};


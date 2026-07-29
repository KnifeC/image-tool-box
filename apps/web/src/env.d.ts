/// <reference types="vite/client" />

import type { ImageToolBoxPlatform } from "@imagetoolbox/platform-api";

declare global {
  interface Window {
    imageToolBoxPlatform?: ImageToolBoxPlatform;
  }
}

export {};

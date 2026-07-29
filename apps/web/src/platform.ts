import type { InjectionKey } from "vue";
import {
  PLATFORM_API_VERSION,
  type ImageToolBoxPlatform,
  type OpenedFile,
  type SaveFileRequest,
} from "@imagetoolbox/platform-api";

export const platformKey = Symbol("platform") as InjectionKey<ImageToolBoxPlatform>;

const webPlatform: ImageToolBoxPlatform = {
  apiVersion: PLATFORM_API_VERSION,
  kind: "web",
  capabilities: {
    nativeFileDialogs: false,
    directFileWrite: false,
    desktopMenu: false,
    folderAccess: false,
    nativeImageCodec: false,
    backgroundTasks: false,
    largeImageMode: false,
    openOutputDirectory: false,
  },
  openFiles(options) {
    return new Promise<OpenedFile[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = options.accept;
      input.multiple = options.multiple;
      input.onchange = async () => {
        const files = [...(input.files ?? [])];
        resolve(
          await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              bytes: await file.arrayBuffer(),
            })),
          ),
        );
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  },
  async saveFile(request: SaveFileRequest) {
    const blob = new Blob([request.bytes], { type: request.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = request.suggestedName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return { saved: true };
  },
};

export function resolvePlatform(): ImageToolBoxPlatform {
  const bridge = window.imageToolBoxDesktop;
  if (!bridge || bridge.apiVersion !== PLATFORM_API_VERSION) return webPlatform;
  return {
    apiVersion: PLATFORM_API_VERSION,
    kind: "electron",
    capabilities: bridge.capabilities,
    openFiles: (options) => bridge.openFiles(options),
    saveFile: (request) => bridge.saveFile(request),
  };
}


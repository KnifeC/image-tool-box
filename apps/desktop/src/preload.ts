import { contextBridge, ipcRenderer } from "electron";
import type {
  ClipboardImageRequest,
  ImageToolBoxPlatform,
  MenuCommand,
  SaveFileRequest,
} from "@imagetoolbox/platform-api";
import { PLATFORM_API_VERSION } from "@imagetoolbox/platform-api";

const electronPlatform: ImageToolBoxPlatform = {
  apiVersion: PLATFORM_API_VERSION,
  capabilities: {
    nativeFileDialogs: true,
    directFileWrite: true,
    desktopMenu: true,
    folderAccess: false,
    nativeImageCodec: false,
    backgroundTasks: false,
    largeImageMode: false,
    openOutputDirectory: false,
  },
  openFiles(options) {
    return ipcRenderer.invoke("files:open", options);
  },
  saveFile(request: SaveFileRequest) {
    return ipcRenderer.invoke("files:save", request);
  },
  writeImageToClipboard(request: ClipboardImageRequest) {
    return ipcRenderer.invoke("clipboard:write-image", request);
  },
  setLocale(locale) {
    return ipcRenderer.invoke("locale:set", locale);
  },
  onMenuCommand(callback) {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand) =>
      callback(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
};

contextBridge.exposeInMainWorld("imageToolBoxPlatform", electronPlatform);

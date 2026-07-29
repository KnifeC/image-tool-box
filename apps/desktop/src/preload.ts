import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, SaveFileRequest } from "@imagetoolbox/platform-api";

const bridge: DesktopBridge = {
  apiVersion: 1,
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
  onMenuCommand(callback) {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
};

contextBridge.exposeInMainWorld("imageToolBoxDesktop", bridge);

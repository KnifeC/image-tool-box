export const PLATFORM_API_VERSION = 1 as const;

export type PlatformCapabilities = {
  nativeFileDialogs: boolean;
  directFileWrite: boolean;
  desktopMenu: boolean;
  folderAccess: boolean;
  nativeImageCodec: boolean;
  backgroundTasks: boolean;
  largeImageMode: boolean;
  openOutputDirectory: boolean;
};

export type OpenedFile = {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

export type SaveFileRequest = {
  suggestedName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export interface ImageToolBoxPlatform {
  readonly apiVersion: typeof PLATFORM_API_VERSION;
  readonly kind: "web" | "electron";
  readonly capabilities: PlatformCapabilities;
  openFiles(options: {
    accept: string;
    multiple: boolean;
  }): Promise<OpenedFile[]>;
  saveFile(request: SaveFileRequest): Promise<{ saved: boolean; path?: string }>;
}

export type DesktopBridge = {
  apiVersion: typeof PLATFORM_API_VERSION;
  capabilities: PlatformCapabilities;
  openFiles(options: {
    accept: string;
    multiple: boolean;
  }): Promise<OpenedFile[]>;
  saveFile(request: SaveFileRequest): Promise<{ saved: boolean; path?: string }>;
  onMenuCommand(callback: (command: string) => void): () => void;
};


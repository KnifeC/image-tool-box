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

export type OpenFileOptions = {
  accept: string;
  multiple: boolean;
};

export type SaveFileResult = {
  saved: boolean;
  path?: string;
};

export type MenuCommand =
  | "import"
  | "open-project"
  | "save-project"
  | "export"
  | "undo"
  | "redo";

export interface ImageToolBoxPlatform {
  readonly apiVersion: typeof PLATFORM_API_VERSION;
  readonly capabilities: PlatformCapabilities;
  openFiles(options: OpenFileOptions): Promise<OpenedFile[]>;
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>;
  onMenuCommand(callback: (command: MenuCommand) => void): () => void;
}

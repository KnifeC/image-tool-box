export const PLATFORM_API_VERSION = 3 as const;

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

export type ClipboardImageRequest = {
  mimeType: "image/png";
  bytes: ArrayBuffer;
};

export type MenuCommand =
  | "import"
  | "open-project"
  | "save-project"
  | "export"
  | "undo"
  | "redo"
  | "set-locale-zh"
  | "set-locale-en";

export type AppLocale = "zh" | "en";

export interface ImageToolBoxPlatform {
  readonly apiVersion: typeof PLATFORM_API_VERSION;
  readonly capabilities: PlatformCapabilities;
  openFiles(options: OpenFileOptions): Promise<OpenedFile[]>;
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>;
  writeImageToClipboard(request: ClipboardImageRequest): Promise<void>;
  setLocale(locale: AppLocale): Promise<void>;
  onMenuCommand(callback: (command: MenuCommand) => void): () => void;
}

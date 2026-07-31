import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeImage,
  protocol,
  session,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { MenuCommand } from "@imagetoolbox/platform-api";
import type { AppLocale } from "@imagetoolbox/platform-api";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

const openSchema = z.object({
  accept: z.string().max(512),
  multiple: z.boolean(),
});

const saveSchema = z.object({
  suggestedName: z.string().min(1).max(240),
  mimeType: z.string().max(128),
  bytes: z.instanceof(ArrayBuffer),
  filters: z
    .array(
      z.object({
        name: z.string().max(80),
        extensions: z.array(z.string().regex(/^[a-zA-Z0-9]+$/)).max(12),
      }),
    )
    .optional(),
});

const clipboardImageSchema = z.object({
  mimeType: z.literal("image/png"),
  bytes: z.instanceof(ArrayBuffer),
});

let mainWindow: BrowserWindow | null = null;
let currentLocale: AppLocale = "en";

function createWindow() {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.resolve(__dirname, "../build/icon.png");

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f1f3f7",
    icon: windowIcon,
    show: false,
    title: "ImageToolBox",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("http://127.0.0.1:")) {
      event.preventDefault();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && !app.isPackaged) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadURL("app://renderer/index.html");

  installMenu();
}

function installMenu() {
  const send = (command: MenuCommand) =>
    mainWindow?.webContents.send("menu:command", command);
  const zh = currentLocale === "zh";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: zh ? "文件" : "File",
        submenu: [
          { label: zh ? "导入图片…" : "Import Images…", accelerator: "CmdOrCtrl+O", click: () => send("import") },
          { label: zh ? "打开工程…" : "Open Project…", click: () => send("open-project") },
          { label: zh ? "保存工程…" : "Save Project…", accelerator: "CmdOrCtrl+S", click: () => send("save-project") },
          { type: "separator" },
          { label: zh ? "导出图片…" : "Export Image…", accelerator: "CmdOrCtrl+E", click: () => send("export") },
          { type: "separator" },
          { role: "quit", label: zh ? "退出" : "Quit" },
        ],
      },
      {
        label: zh ? "编辑" : "Edit",
        submenu: [
          { label: zh ? "撤销" : "Undo", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
          { label: zh ? "重做" : "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: () => send("redo") },
          { type: "separator" },
          { role: "cut", label: zh ? "剪切" : "Cut" },
          { role: "copy", label: zh ? "复制" : "Copy" },
          { role: "paste", label: zh ? "粘贴" : "Paste" },
        ],
      },
      {
        label: zh ? "视图" : "View",
        submenu: [
          { role: "reload", label: zh ? "重新载入" : "Reload" },
          { role: "togglefullscreen", label: zh ? "全屏" : "Toggle Full Screen" },
          ...(!app.isPackaged
            ? ([{ role: "toggleDevTools", label: zh ? "开发者工具" : "Developer Tools" }] as Electron.MenuItemConstructorOptions[])
            : []),
        ],
      },
      {
        label: zh ? "语言" : "Language",
        submenu: [
          {
            label: "中文",
            type: "radio",
            checked: zh,
            click: () => send("set-locale-zh"),
          },
          {
            label: "English",
            type: "radio",
            checked: !zh,
            click: () => send("set-locale-en"),
          },
        ],
      },
    ]),
  );
}

function validateSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? "";
  if (
    !url.startsWith("app://renderer/") &&
    !(process.env.VITE_DEV_SERVER_URL && url.startsWith("http://127.0.0.1:"))
  ) {
    throw new Error("Blocked IPC sender");
  }
}

function installIpc() {
  ipcMain.handle("locale:set", (event, locale: unknown) => {
    validateSender(event);
    if (locale !== "zh" && locale !== "en") {
      throw new Error("Unsupported locale");
    }
    currentLocale = locale;
    installMenu();
  });

  ipcMain.handle("files:open", async (event, rawOptions) => {
    validateSender(event);
    const options = openSchema.parse(rawOptions);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: options.multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filtersForAccept(options.accept),
    });
    if (result.canceled) return [];
    return Promise.all(
      result.filePaths.map(async (filePath) => {
        const data = await readFile(filePath);
        return {
          name: path.basename(filePath),
          mimeType: mimeForExtension(path.extname(filePath)),
          bytes: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        };
      }),
    );
  });

  ipcMain.handle("files:save", async (event, rawRequest) => {
    validateSender(event);
    const request = saveSchema.parse(rawRequest);
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: request.suggestedName,
      filters: request.filters,
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, Buffer.from(request.bytes));
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle("clipboard:write-image", (event, rawRequest) => {
    validateSender(event);
    const request = clipboardImageSchema.parse(rawRequest);
    const image = nativeImage.createFromBuffer(Buffer.from(request.bytes));
    if (image.isEmpty()) throw new Error("Invalid clipboard image");
    clipboard.writeImage(image);
  });
}

function filtersForAccept(accept: string) {
  if (accept.includes(".ibox")) {
    return [
      { name: "ImageToolBox Project", extensions: ["ibox"] },
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp"] },
    ];
  }
  return [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp"] }];
}

function mimeForExtension(extension: string) {
  const ext = extension.toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ibox") return "application/x-imagetoolbox-project";
  return "image/jpeg";
}

app.whenReady().then(async () => {
  currentLocale = app.getLocale().toLowerCase().startsWith("zh") ? "zh" : "en";
  const rendererRoot = path.resolve(process.resourcesPath, "renderer");
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const candidate = path.resolve(rendererRoot, relative);
    if (!candidate.startsWith(rendererRoot + path.sep) && candidate !== rendererRoot) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(candidate).toString());
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  installIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

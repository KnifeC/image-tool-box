# ImageToolBox

ImageToolBox 是一款本地优先的轻量图片编辑工具。同一套 Vue 前端既可以构建为纯静态 PWA，也可以由 Electron 轻量包装为桌面客户端。

## V1 功能

- 图片导入、拖放和多图画布
- 选择、缩放、旋转、移动和图层排序
- 非破坏性裁剪与常用比例
- 文本、矩形、椭圆、直线、箭头、画笔和荧光笔
- PNG、JPG、WebP 导出
- IndexedDB 自动保存
- `.ibox` 工程导入与导出
- 桌面端原生打开/保存对话框与菜单

所有图像处理均在本地完成。

## 开发

需要 Node.js、pnpm。

```bash
pnpm install
pnpm dev
```

启动带热更新的 Electron 开发环境：

```bash
pnpm dev:desktop
```

## 构建

```bash
pnpm build:web
pnpm dist:win
```

- 静态 Web/PWA 输出：`apps/web/dist`
- Windows x64 便携包输出：`out/ImageToolBox-0.1.0-win-x64-portable.exe`
- macOS 和 Linux 的打包配置已经保留，需在对应系统执行 `pnpm dist:mac` 或 `pnpm dist:linux`

## 架构

- `apps/web`：Vue、Pinia、Konva 编辑器与 PWA
- `apps/desktop`：Electron 主进程、预加载桥接与安全 IPC
- `packages/editor-core`：文档模型、命令与撤销/重做
- `packages/project-format`：IndexedDB 与 `.ibox` 工程格式
- `packages/platform-api`：版本化平台能力接口

Web 层只依赖 `platform-api`，不会直接访问 Node.js。未来可在 Electron 侧增加 Sharp、文件夹批处理、后台任务和大图模式，而不改动编辑器核心。

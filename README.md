# ImageToolBox

轻量、隐私友好的本地图片编辑器，同时支持 Web/PWA 与 Electron 桌面端。图片处理、工程存储和导出均在本地完成。

## 功能

- 导入、拖放或粘贴 JPEG、PNG、WebP、BMP 图片
- 移动、缩放、旋转、裁剪与多图层管理
- 添加文字、矩形、椭圆、直线、箭头、画笔和荧光笔
- 自定义画布尺寸、背景颜色或透明背景
- 自动恢复本地草稿，支持撤销、重做和 `.ibox` 工程文件
- 导出 PNG、JPG、WebP，支持 0.5×、1×、2×及仅导出选中对象
- 中英文界面、键盘快捷键和触屏缩放/平移

## 快速开始

建议使用 Node.js 22 和 pnpm 10.11.0。

```bash
pnpm install
pnpm dev
```

桌面端开发：

```bash
pnpm dev:desktop
```

## 常用命令

```bash
pnpm typecheck       # 类型检查
pnpm test            # 运行测试
pnpm build:web       # 构建 Web/PWA
pnpm dist:win        # Windows x64 便携版 EXE 和免安装 ZIP
pnpm dist:mac        # macOS DMG/ZIP（x64、arm64）
pnpm dist:linux      # Linux AppImage/DEB/RPM
```

## 项目结构

```text
apps/web                 Vue 3 编辑器与 PWA
apps/desktop             Electron 主进程和系统文件桥接
packages/editor-core     文档模型、几何计算、撤销/重做
packages/project-format  IndexedDB 存储与 .ibox 读写
packages/platform-api    Web/桌面端统一平台接口
```

完整操作说明见 [`doc/操作手册.md`](doc/操作手册.md)。

## 发布

推送到 `main` 会部署 GitHub Pages。手动运行 **Build Electron** 工作流可生成各平台安装包；推送 `v*` 标签会同时创建 GitHub Release。

当前版本：`0.1.0`

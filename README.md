# ImageToolBox

一个轻量、隐私友好的图片编辑工具。图片处理在本地完成，可直接运行在浏览器中，也可打包为桌面应用。

## 能做什么

- 导入或拖放多张图片，自由移动、缩放、旋转和调整图层
- 无损裁剪，支持常用画面比例
- 添加文字、矩形、椭圆、直线、箭头、画笔和荧光笔
- 自动保存编辑进度，支持撤销与重做
- 保存、打开 `.ibox` 工程文件
- 导出 PNG、JPG 或 WebP，可选择倍率和导出范围

## 本地运行

请先安装 Node.js 和 pnpm，然后执行：

```bash
pnpm install
pnpm dev
```

浏览器访问终端中显示的地址即可使用。运行桌面版开发环境：

```bash
pnpm dev:desktop
```

## 构建

```bash
pnpm build:web   # 构建 Web / PWA
pnpm dist:win    # Windows x64 便携版 EXE 和免安装 ZIP
```

macOS 和 Linux 可分别使用 `pnpm dist:mac`、`pnpm dist:linux`，需要在对应系统上执行。Linux 构建会生成 AppImage、DEB 和 RPM。

### GitHub Actions 多平台打包

在仓库的 **Actions → Build Electron → Run workflow** 中可以手动构建。构建完成后，可在该次运行的 Artifacts 中下载 Windows、macOS 和 Linux 安装包。

推送 `v` 开头的版本标签时（例如 `v0.1.0`），工作流还会自动创建对应的 GitHub Release 并上传所有平台的安装包：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 技术栈

Vue 3、TypeScript、Pinia、Konva、Vite、Electron，使用 pnpm workspace 管理。

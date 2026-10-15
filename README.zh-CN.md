<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>让答案留在页面旁边。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。从旧插件升级？请运行 `/plugin uninstall glimpselet@glimpselet` 与 `/plugin marketplace remove glimpselet`，再按下方步骤安装 Blinkling。

Blink 是屏幕角落的小伙伴。按住 Ctrl 并点击任何内容，就能向 Claude Code 提问。

> [!TIP]
> Blink 使用你已在同一台电脑登录的 Claude Code。

## 安装

1. 在 Claude Code 中安装插件：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. 唤醒 Blink。第一次会出现三步欢迎界面：

   ```text
   /blinkling:blinkling
   ```

3. 可选，用于页面结构、整页截取、原地翻译和 PDF 阅读器：运行 `/blinkling:install`，在 `chrome://extensions`（或 `edge://extensions`）开启**开发者模式**，选择 **Load unpacked**，再选取 `~/Blinkling-extension`。

> [!NOTE]
> 辅助扩展是可选的，没有它 Blink 也能工作。[安装与更新](docs/INSTALL.md)。

### 高级：从源代码加载

<details>
<summary>从源码启动与手动更新</summary>

从源代码运行插件需要 Node.js 22+ 和较新的 Claude Code。如果终端已经位于现有源代码仓库的根目录，请跳过前两条命令。请在终端执行以下命令：

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

两个版本检查命令都应显示 `2.1.0`，插件列表应显示 `blinkling@inline` 的版本为 `2.1.0`，且已在此会话中启用。在最后一个命令打开的 Claude Code 会话中运行 `/blinkling:blinkling`。`--plugin-dir` 只在当前会话加载这份源代码中的插件。每次从源代码启动 Claude Code 都要加上这个选项，重新构建后请重启该会话。构建好的扩展位于项目内的 `dist-extension`。

插件详情也应包含 `blinkling` 和 `install` 技能，以及 `blinkling` MCP 服务器。打包后的扩展位于 `bin/extension`，版本也应为 **2.1.0**。

浏览器辅助扩展是可选的。运行 `/blinkling:install`，会把构建好的扩展复制到固定文件夹 `~/Blinkling-extension`。在 Chrome 或 Edge 打开 `chrome://extensions` 或 `edge://extensions`，开启 **Developer mode**，选择 **Load unpacked**，再选取该文件夹。开发者提示会持续显示，新版本需要手动更新。

更新未打包扩展后，请再运行一次 `/blinkling:install` 刷新固定文件夹，然后在扩展页面的卡片上点“重新加载”。改用 `~/Blinkling-extension` 时，请移除旧扩展卡片，再加载这个文件夹一次。

已安装的插件请运行以下命令，再在 Claude Code 中运行 `/reload-plugins` 和 `/blinkling:blinkling`。确认插件列表与扩展卡片均为 **2.1.0**。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 边读边用

- **询问指针下的内容。**按住 Ctrl 点击，或拖动框选区域。它会飞进 Blink，并打开迷你输入框，按 Enter 发送。
- **和 Blink 对话。**点击 Blink，即可在迷你输入框接续上一段对话。消息较长或按 Shift+Enter 会展开完整输入框。
- **用气泡回答。**气泡会指向它所谈论的内容。在 Blink 上滚动滚轮可回看之前的气泡。
- **菜单。**鼠标移到 Blink 上即可展开：截图、导览、自动解说和设置。导览会在页面上标出步骤编号，并可保存为 Markdown。自动解说默认关闭，最多出现两个气泡，也不会画标记。
- **浏览器辅助扩展（可选）。**工具栏弹出窗口会显示连接状态，并有 **Wake Blink** 按钮。它让 Blink 读取页面结构、截取整页长图、原地翻译页面，并用阅读器打开 PDF。

截图也有全局快捷键 Ctrl+Shift+S（macOS 为 Cmd），可在设置中更改。

## 隐私

Blink 向你在这台电脑登录的 Claude Code 提问，你开口之前不会截取任何内容。没有遥测，也没有发行者运营的回答服务。你选择的内容和截图会交给 Claude Code 及其提供商，提供商条款和用量费用适用。辅助扩展只与 `127.0.0.1` 上的桥接器通信，绝不读取密码字段或输入值。自动解说在你开启之前保持关闭。

[隐私详情](docs/SECURITY.md) | [使用方法](docs/USAGE.md) | [功能一览](docs/FEATURES.md) | [版本说明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

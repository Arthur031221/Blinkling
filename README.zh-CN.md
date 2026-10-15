<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>让答案留在页面旁边。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。从旧插件升级？请运行 `/plugin uninstall glimpselet@glimpselet` 与 `/plugin marketplace remove glimpselet`，再按下方步骤安装 Blinkling。

一个小巧的 Claude Code 悬浮聊天窗口。询问页面、截取区域、跟随导览，或翻译一段文字。

> [!TIP]
> 使用你已登录的 Claude Code 账号，以及桌面版 Chrome 或 Edge。使用 Claude Code 不需要 API 密钥。

![Google Flights：先看页面导览，再询问如何预订往返航班。](assets/demo.gif)

_Google Flights：先看页面导览，再询问如何预订往返航班。_

## 安装

1. 在 Claude Code 中安装插件：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. 打开欢迎指南：

   ```text
   /blinkling:blinkling
   ```

3. 在 `chrome://extensions`（或 `edge://extensions`）开启**开发者模式**。选择 **Load unpacked**，并选中 **Show in Files / Finder** 打开的文件夹。欢迎页会自动连接，再单击工具栏中的 Blink 按钮，确认已连接。

> [!NOTE]
> 浏览器小助手是可选的：没有它，Blink 在任何窗口都能用。若要用于 Chrome 或 Edge，请运行 `/blinkling:install`，再按步骤 3 加载 `~/Blinkling-extension`。[安装与更新](docs/INSTALL.md)。

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

两条版本检查命令都应显示 `2.1.0`。插件列表应显示 `blinkling@inline` 的版本为 `2.1.0`，并已在此会话中启用。最后一条命令会打开 Claude Code。在这个会话中运行 `/blinkling:blinkling`，即可打开欢迎指南。`--plugin-dir` 只在当前会话加载这份源代码中的插件。每次启动时都要加上这个选项。重新执行 `npm run build:plugin` 构建后，请重启 Claude Code。构建好的扩展位于 `dist-extension`，欢迎指南会将它复制到下方的固定目录。

插件详情还应包含 `blinkling` 和 `install` 技能以及 `blinkling` MCP 服务器。打包后的扩展位于 `bin/extension`，版本也应为 **2.1.0**。如果 Claude Code 在远程主机上运行，请使用指南中的 SSH 命令，在浏览器所在的电脑下载扩展 ZIP，并加载解压后的文件夹。

如果浏览器和 Claude Code 在同一台电脑上运行，欢迎指南会把构建好的扩展复制到固定目录 `~/Blinkling-extension`。在 Chrome 或 Edge 中打开 `chrome://extensions` 或 `edge://extensions`，开启 **Developer mode**，选择 **Load unpacked**，然后选中该目录。开发者提示会一直显示。新版本需要手动更新。
更新未打包扩展时，先关闭旧浮动窗口，再运行 `/blinkling:blinkling` 刷新固定目录，然后在扩展页面的卡片点击"重新加载"。如果 Claude Code 在远程主机，请通过欢迎指南下载新版 ZIP，在浏览器所在电脑替换解压后的文件，再重新加载扩展。 改用 `~/Blinkling-extension` 时，请移除旧扩展卡片，再加载这个文件夹一次。

已安装的插件请执行以下命令，再在 Claude Code 执行 `/reload-plugins` 和 `/blinkling:blinkling`。确认插件列表与扩展卡片均为 **2.1.0** 后，再重新打开悬浮窗口。

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 边读边用

- **按住 Ctrl 并单击**屏幕上的段落、按钮或图片：Blink 会取下它，向 Claude Code 提问。**按住 Ctrl 并拖动**则改为取一个区域。
- 会弹出一个小输入框，带三个快速提问，按 Enter 发送高亮的那一个。随时单击 Blink 即可继续对话。
- 答案以气泡呈现，并指向它所谈论的内容。Blink 的菜单有截图、导览、自动解说（默认关闭）和设置。
- 可选的 Chrome/Edge 浏览器小助手会提供网页本身的结构，让 Blink 知道你指的是哪一段或哪个按钮，另有整页截图、原地翻译网页和 PDF 阅读器。工具栏按钮会显示是否已连接，并可唤醒 Blink。没有它，Blink 在每个窗口仍可使用。

## 快捷键

| 快捷键         | 操作             |
| -------------- | ---------------- |
| Ctrl + 单击    | 询问指针下的内容 |
| Ctrl + 拖动    | 取一个区域       |
| 设置中的快捷键 | 打开截图覆盖层   |

按键可在设置中更改。

## 会话与隐私

Blink 会把你选取的内容发送给你自己已登录的 Claude Code，并把答案显示在相关内容旁边。请避免同时在终端中使用同一个对话。

> [!IMPORTANT]
> 浏览器小助手只在你指向网页时读取该页。密码和支付字段一律不读取，并且只与你电脑上的 Blinkling 通信。自动解说在你开启之前保持关闭。

没有遥测，也没有发行者运营的回答服务。你选取的内容会发送到你的 Claude Code；适用提供方条款和用量费用。浏览器设置、扩展商店和浏览器内置的 PDF 查看器属于受保护页面：在那里 Blink 只根据屏幕画面回答。 [隐私](docs/SECURITY.md) | [使用说明](docs/USAGE.md) | [发布说明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

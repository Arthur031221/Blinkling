<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Blinkling</h1>

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

3. 在 `chrome://extensions`（或 `edge://extensions`）开启**开发者模式**。选择 **Load unpacked**，并选中 **Show in Files / Finder** 打开的文件夹。欢迎页会自动连接，再打开悬浮窗口。

> [!NOTE]
> 本机可用 **Try without installing** 打开独立 Chromium 配置文件。远程主机请在浏览器所在电脑执行显示的 SSH 命令。[安装与更新](docs/INSTALL.md)。

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

- **截取全屏幕**或**选取区域**。在支持的页面或悬浮窗口中按住 Shift 拖动。Enter 确认，Esc 取消。截取共享屏幕时，悬浮窗口会暂时移开，完成后恢复。
- **导览这页**提供页面概览，再用下一步／上一步浏览阅读区域和控件。
- 选择文字来提问、解释或翻译。页面原位翻译可还原。PDF 使用内置阅读器。
- **自动解说**最多建议三个问题，并总结变化。Alt+P 暂停。聊天可选 Opus、Sonnet 或 Haiku。

![arXiv：选取摘要、提问，再翻译成繁体中文。](assets/arxiv.gif)

_arXiv：选取摘要、提问，再翻译成繁体中文。_

使用真实扩展、在线网站和 Claude Code 回答录制。等待时间已缩短，页面内容和回答均未编排。

## 快捷键

| 快捷键       | 操作           |
| ------------ | -------------- |
| Alt+Shift+G  | 打开悬浮窗口   |
| Ctrl+Shift+S | 在浏览器中裁剪 |
| Ctrl+Shift+7 | 从其他应用裁剪 |

macOS 用 Cmd 代替 Ctrl。在 `chrome://extensions/shortcuts` 修改快捷键。Shift 仅在支持的页面和悬浮窗口内生效。

## 会话与隐私

Blinkling 优先使用已验证的 Claude Code 实时通道，否则在独立进程中继续项目最新的已保存对话。避免在终端同时操作同一份对话记录。[通道设置与限制](docs/DESIGN.md#the-running-claude-code-conversation)。

> [!IMPORTANT]
> **自动解说**在你同意并授予网站权限后，**无需共享屏幕**即可总结页面变化。密码字段和屏蔽列表会暂停自动摘要与问题建议。屏幕摘要使用共享浏览器标签页，并绑定到同一个已检查的标签页，执行相同检查。共享显示器或应用需要**每次共享单独同意**。无法检查这些像素中的密码字段或被屏蔽网站。来源不明时保持暂停。
> 加载中或无法访问的嵌入页面也会暂停自动页面请求。

无遥测，也没有发布者运营的回答服务。选定的上下文与截图发送到你的后端，适用提供商的条款和费用。原生应用只提供像素。浏览器设置、扩展商店与受保护页面不支持页面工具。原生窗口的透明度和点击穿透受浏览器限制。[隐私](docs/SECURITY.md) | [使用说明](docs/USAGE.md) | [发布说明](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>让答案留在页面旁边。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。从旧插件升级？请运行 `/plugin uninstall glimpselet@glimpselet` 与 `/plugin marketplace remove glimpselet`，再按下方步骤安装 Blinkling。

一个小巧的 Claude Code 悬浮聊天窗口。询问页面、截取区域、跟随导览，或翻译一段文字。

> [!TIP]
> 使用你已登录的 Claude Code 账号，以及桌面版 Chrome 或 Edge。使用 Claude Code 不需要 API 密钥。

![Google Flights：先看页面导览，再询问如何预订往返航班。](assets/demo.gif)

_Google Flights：先看页面导览，再询问如何预订往返航班。_

## 安装

需要已登录的 Claude Code。然后：

1. 把下面这一行粘贴到终端并按回车：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 在 Claude Code 中运行：

   ```text
   /blinkling:blinkling
   ```

3. 在 Mac 上，一次性允许 Blinkling 使用**屏幕录制**：系统设置，隐私与安全性。

> [!NOTE]
> 在 Windows PowerShell 5 中，用 `;` 代替 `&&`。适合你电脑的动画步骤：[安装指南](https://arthur031221.github.io/Blinkling/install/)。其他安装方式、更新和 Linux 沙盒：[docs/INSTALL.md](docs/INSTALL.md)。

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

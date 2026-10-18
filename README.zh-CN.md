<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink 住在屏幕角落。按住 Ctrl 点一下，答案就来。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。从旧插件升级？请运行 `/plugin uninstall glimpselet@glimpselet` 与 `/plugin marketplace remove glimpselet`，再按下方步骤安装 Blinkling。

Blinkling 让绿色小伙伴 Blink 待在屏幕角落，浮在所有程序之上。按住 **Ctrl**（macOS 上为 Control）点击想问的东西，或拖动框出一个区域。内容会飞进 Blink，你来提问，答案会在 Blink 旁边的聊天卡片中打开。

> **设计上就安全：** Blinkling 只看和讲解，绝不替你点击、打字或操作任何程序。

使用这台电脑上你已登录的 Claude Code。

<p align="center">
<img src="assets/pick.webp" alt="在 arXiv 页面按住 Ctrl 单击一个段落。它的截图飞进 Blink 的嘴里，聊天卡片打开，答案逐字出现。"><br>
论文：按住 Ctrl 单击一段，读答案。
</p>

<p align="center">
<img src="assets/translate.webp" alt="在阿拉伯文维基百科页面选一段文字，送进 Blink，点击翻译，答案用英文说明这段文字。"><br>
翻译：阿拉伯文段落，用英文说明。
</p>

<p align="center">
<img src="assets/tour.webp" alt="在内容密集的公开网页点击导览，Blink 标出页面各部分，拿着指示棒指向当前这一步，再用下一步往下走。"><br>
导览：难操作的页面，一步一步看。
</p>

## 安装

需要已登录的 Claude Code。然后：

1. 把下面这一行粘贴到终端并按回车：

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 在终端里用 Blink 频道启动 Claude Code：

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   这个标志让 Blink 的聊天能传到这个会话，Claude Code 会请你确认一次；没有它 Blink 照常工作，由自己的会话回答。

   然后在那个会话中运行：

   ```text
   /blinkling:blinkling
   ```

3. 在 Mac 上，一次性允许 Blinkling 使用**屏幕录制**：系统设置，隐私与安全性。macOS 还会询问一次**辅助功能**，这样按住 Ctrl 才能开始选取；在同一处允许即可。

在 macOS 和 Linux 上不需要自己安装 Node.js。这台电脑没有的话，Blinkling 第一次启动时会下载一份专用的 Node.js（约 45 MB，并用固定的 SHA-256 校验）。第一次启动若看到 Claude Code 提示 Blinkling 连接失败，请等一分钟，再运行 `/mcp` 重新连接。在 Windows 上请先从 nodejs.org 安装 Node.js 22 或更新版本，Blinkling 在那里不会下载。

> [!NOTE]
> 在 Windows PowerShell 5 中，用 `;` 代替 `&&`。适合你电脑的动画步骤：[安装指南](https://arthur031221.github.io/Blinkling/install/)。其他安装方式、更新和 Linux 沙盒：[docs/INSTALL.md](docs/INSTALL.md)。

## 边读边用

- **按住 Ctrl 并单击**段落、按钮或图片，Blink 就会取下它。
- **按住 Ctrl 并拖动**则改为取一个区域。
- 聊天卡片会在 Blink 旁边打开，带上你取的内容、三个快速提问，以及模型、强度和权限的选择，按 Enter 发送高亮的那一个。
- 随时单击 Blink 即可对话。聊天卡片会在 Blink 旁边打开，接着你们的对话。

![单击 Blink，输入问题，答案会流入聊天卡片。](assets/ask.webp)

- Blink 的菜单有截图、导览、自动解说（默认关闭）和设置。
- 可选的 Chrome/Edge 浏览器小助手会提供网页本身的结构，让 Blink 知道你指的是哪一段或哪个按钮，另有整页截图、原地翻译网页和 PDF 阅读器。工具栏按钮会显示是否已连接，并可唤醒 Blink。没有它，Blink 在每个窗口仍可使用。

## 快捷键

| 快捷键                 | 操作                                               |
| ---------------------- | -------------------------------------------------- |
| Ctrl + 单击            | 询问指针下的内容                                   |
| Ctrl + 拖动            | 取一个区域                                         |
| 设置中的快捷键         | 打开截图覆盖层                                     |
| Ctrl + Alt + Shift + B | 退出 Blink（Mac 上为 Ctrl + Option + Command + B） |

按键可在设置中更改。

## 会话与隐私

Blink 会把你选取的内容发送给你自己已登录的 Claude Code，并把答案显示在 Blink 旁边的聊天卡片中。在启动 Blink 的终端会话里输入的提问和完成的答案，会自动出现在 Blink 的聊天中。反方向，也就是让 Blink 的聊天出现在终端里，用的是 Claude Code 的实验性 channels，只能在启动时加载：用 `claude --dangerously-load-development-channels plugin:blinkling@blinkling` 启动 Claude Code（`/blinkling:blinkling` 会显示这条命令），两边就都能看到全部内容。不这样做时，Blink 用自己的会话回答。

> [!IMPORTANT]
> 浏览器小助手只在你指向网页时读取该页。密码和支付字段一律不读取，并且只与你电脑上的 Blinkling 通信。自动解说在你开启之前保持关闭。

没有遥测，也没有发行者运营的回答服务。你选取的内容会发送到你的 Claude Code；适用提供方条款和用量费用。浏览器设置、扩展商店和浏览器内置的 PDF 查看器属于受保护页面：在那里 Blink 只根据屏幕画面回答。 [隐私](docs/SECURITY.md) | [使用说明](docs/USAGE.md) | [发布说明](docs/releases/v3.2.6.md)

Assisted by Claude/Codex.

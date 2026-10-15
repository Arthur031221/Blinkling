<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink 住在屏幕角落。按住 Ctrl 点一下，答案就来。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet。从旧插件升级？请运行 `/plugin uninstall glimpselet@glimpselet` 与 `/plugin marketplace remove glimpselet`，再按下方步骤安装 Blinkling。

Blinkling 让绿色小伙伴 Blink 待在屏幕角落，浮在所有程序之上。按住 **Ctrl**（macOS 上为 Control）点击想问的东西，或拖动框出一个区域。内容会飞进 Blink，你来提问，答案以对话气泡出现在 Blink 旁边。

> **设计上就安全：** Blinkling 只看和讲解，绝不替你点击、打字或操作任何程序。

使用这台电脑上你已登录的 Claude Code。

![按住 Ctrl，在网页上单击一个段落。它会飞进 Blink，你来提问，答案出现在 Blink 旁边。](assets/pick.gif)

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

- **按住 Ctrl 并单击**段落、按钮或图片，Blink 就会取下它。
- **按住 Ctrl 并拖动**则改为取一个区域。
- 会弹出一个小输入框，带三个快速提问，按 Enter 发送高亮的那一个。
- 随时单击 Blink 即可对话。答案以气泡出现在 Blink 旁边。

![单击 Blink，输入问题，答案以气泡的形式回来。](assets/ask.gif)

- Blink 的菜单有截图、导览、自动解说（默认关闭）和设置。
- 可选的 Chrome/Edge 浏览器小助手会提供网页本身的结构，让 Blink 知道你指的是哪一段或哪个按钮，另有整页截图、原地翻译网页和 PDF 阅读器。工具栏按钮会显示是否已连接，并可唤醒 Blink。没有它，Blink 在每个窗口仍可使用。

## 快捷键

| 快捷键         | 操作             |
| -------------- | ---------------- |
| Ctrl + 单击    | 询问指针下的内容 |
| Ctrl + 拖动    | 取一个区域       |
| 设置中的快捷键 | 打开截图覆盖层   |

按键可在设置中更改。

## 会话与隐私

Blink 会把你选取的内容发送给你自己已登录的 Claude Code，并把答案以气泡显示在 Blink 旁边。请避免同时在终端中使用同一个对话。

> [!IMPORTANT]
> 浏览器小助手只在你指向网页时读取该页。密码和支付字段一律不读取，并且只与你电脑上的 Blinkling 通信。自动解说在你开启之前保持关闭。

没有遥测，也没有发行者运营的回答服务。你选取的内容会发送到你的 Claude Code；适用提供方条款和用量费用。浏览器设置、扩展商店和浏览器内置的 PDF 查看器属于受保护页面：在那里 Blink 只根据屏幕画面回答。 [隐私](docs/SECURITY.md) | [使用说明](docs/USAGE.md) | [发布说明](docs/releases/v3.0.0.md)

Assisted by Claude/Codex.

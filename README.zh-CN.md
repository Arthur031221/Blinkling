<h1 align="center"><img src="assets/blink-lazy.gif" width="110" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink住在屏幕角落，按住Ctrl点一下，答案就来。</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Blinkling让一个叫Blink的绿色小伙伴待在屏幕角落，浮在所有程序上面，按住Ctrl，macOS上是Control，再点一下想问的东西，或拖动框出一个区域，选到的内容会飞进Blink，你输入问题，答案就在Blink旁边的聊天卡片里打开。

Blinkling只看和讲解，不会在你的程序里点击或打字。

它使用这台电脑上你已经登录的Claude Code。

<p align="center">
<img src="assets/pick.webp" alt="在arXiv页面按住Ctrl点一个段落，它的截图飞进Blink的嘴里，聊天卡片打开，答案逐字出现"><br>
论文，按住Ctrl点一段，读答案。
</p>

<p align="center">
<img src="assets/translate.webp" alt="在阿拉伯文维基百科页面选一段文字，送进Blink，按下翻译，答案用英文说明这段文字"><br>
翻译，阿拉伯文段落用英文说明。
</p>

<p align="center">
<img src="assets/tour.webp" alt="在内容密集的公开网页按下导览，Blink标出页面各部分，拿着指示棒指向当前这一步，再按下一步往下走"><br>
导览，难读的页面一步一步看。
</p>

## 安装

你需要在这台电脑上登录好Claude Code，Windows上还要从nodejs.org安装Node.js 22或更新版本，Blinkling不会替你下载，macOS和Linux不需要其他东西。

安装完任何东西后，请关掉终端再开一个新的，这样它才找得到刚装好的程序。

1. 把下面这一行贴到终端，按Enter。

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. 用Blink的频道启动Claude Code。

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   这个标志让Blink的聊天和这个终端会话能互相看到，Claude Code会请你确认一次，没有标志的话Blink照常运行，只是改由自己的会话回答。

   接着在那个会话里运行下面这行。

   ```text
   /blinkling:blinkling
   ```

3. 在Mac上，到系统设置的隐私与安全性，一次性允许Blinkling使用屏幕录制，macOS也会问一次辅助功能，这样Ctrl键才能开始选取，同样在那里允许就好。

Mac或Linux电脑如果没有Node.js，Blinkling第一次启动时会自己获取一份专用的，大小约45 MB，并用固定的SHA-256核对，第一次启动时如果Claude Code说Blinkling连接失败，请等一分钟再运行`/mcp`。

> [!NOTE]
> 在Windows PowerShell 5里，两个命令请一个接一个运行，不要用`&&`串在一起，适合你电脑的动画步骤在[安装指南](https://arthur031221.github.io/Blinkling/install/)，其他安装方式、更新和Linux沙盒在[docs/INSTALL.md](docs/INSTALL.md)。

## 边读边用

- 按住Ctrl点一下段落、按钮或图片，Blink就会把它取下来。
- 按住Ctrl拖动，改为取一个区域。
- 聊天卡片会在Blink旁边打开，带着你取的内容、三个快速提问，以及模型、强度和权限的选择，按Enter发送高亮的那一个。
- 随时点Blink就能对话，卡片会带出你们之前的对话。

![点Blink，输入问题，答案会流进聊天卡片](assets/ask.webp)

- Blink的菜单有截图、导览、自动解说和设置，自动解说在你打开前一直是关的。
- 可选的Chrome或Edge浏览器小帮手会提供网页本身的结构，让Blink知道你指的是哪一段或哪个按钮，另外还有整页截图、原地翻译和PDF阅读器，工具栏按钮会显示是否已连接，也能唤醒Blink，没有它的话，Blink在每个窗口仍然能用。

## 快捷键

| 快捷键                 | 操作                                            |
| ---------------------- | ----------------------------------------------- |
| Ctrl加单击             | 询问指针下的内容                                |
| Ctrl加拖动             | 取一个区域                                      |
| 设置中的快捷键         | 打开截图覆盖层                                  |
| Ctrl + Alt + Shift + B | 退出Blink，Mac上改按Ctrl + Option + Command + B |

按键可以在设置里更改。

## 会话与隐私

Blink会把你选取的内容发给你自己已登录的Claude Code，答案显示在聊天卡片里，你在启动Blink的终端会话输入的内容和它的答案，也会出现在Blink的聊天中。

反方向，也就是让Blink的聊天出现在终端，走的是Claude Code实验性的channels，它们只在Claude Code启动时加载，所以请用`claude --dangerously-load-development-channels plugin:blinkling@blinkling`启动，`/blinkling:blinkling`也会打印出同一行命令。

> [!IMPORTANT]
> 浏览器小帮手只在你指向网页时才读那一页，不会读密码和付款字段，只和你电脑上的Blinkling通信，自动解说在你打开前一直是关的。

Blinkling没有遥测，也没有自己的回答服务，你选取的内容只会发到你的Claude Code，提供商的条款和用量费用照常适用，浏览器设置、扩展商店和浏览器内置的PDF查看器是受保护页面，在那里Blink只能依屏幕画面回答。

[隐私](docs/SECURITY.md) | [使用说明](docs/USAGE.md) | [版本说明](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.

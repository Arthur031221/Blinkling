# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

一个悬浮聊天窗口，让你向 Claude Code 询问当前页面或屏幕上的内容。阅读和翻译网页、获取页面控件指引，也可以截取区域后提问。

|           Glimpselet 悬浮聊天           |                 页面指引示例                  |
| :-------------------------------------: | :-------------------------------------------: |
| ![Glimpselet 悬浮聊天](assets/demo.gif) | ![页面指引示例](assets/screenshots/guide.png) |

准备条件：较新的 Claude Code、使用你自己的订阅账号登录，以及桌面版 Chromium 浏览器，例如 Chrome 或 Edge。

Glimpselet 默认创建专用对话。你也可以选择最近的 Claude Code 会话，在另一个进程中继续。要将请求发送到终端中已打开的交互会话，请启用 channel 预览功能。[Channel 设置](docs/DESIGN.md#the-running-claude-code-conversation)。

## 安装

1. 在 Claude Code 中添加市场并安装插件：

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. 运行 `/glimpselet:glimpse`。

3. 按照欢迎指南连接浏览器。在本地桌面上，可选择 **Try without installing**，也可以在自己的浏览器中加载并配对扩展。如果 Claude Code 运行在远程主机，请在有浏览器的电脑上运行指南提供的 SSH 命令，在该电脑下载 ZIP 并在浏览器中加载扩展。远程主机不支持免安装浏览器。配对成功后，Glimpselet 面板会显示连接模式和项目。

### 高级：从源代码加载

在自己的桌面浏览器中，扩展保存在固定目录 `~/.glimpselet/extension`。在 Chrome 或 Edge 中打开 `chrome://extensions` 或 `edge://extensions`，开启 **Developer mode**，选择 **Load unpacked**，然后选中该目录。开发者提示会一直显示。新版本需要手动更新。

## 可以做什么

- 使用 Opus、Sonnet 或 Haiku 获取流式回复并继续追问。
- 在全屏视图中捕获共享屏幕，或使用页面浮层裁剪区域。按住 Shift 拖动，然后按 Enter 捕获或按 Esc 取消。
- 查看随页面变化而刷新的建议问题。
- 可选开启 Passive 摘要，用 Alt+P 暂停，并查看每小时费用。
- 在页面实际控件上显示操作指引。可就地翻译文字，并用 Restore 恢复原文。
- 选择文字后可解释、翻译或提问。也可以在内置阅读器中打开 PDF 并提问。

![导览这个页面](assets/guide.gif)

![所选区域](assets/crop.gif)

| 快捷键                                 | 操作                                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| Alt+Shift+G                            | 打开 Glimpselet，选择 **Float** 打开悬浮聊天。                |
| Ctrl+Shift+S（macOS 上为 Cmd+Shift+S） | 裁剪当前页面或共享屏幕。                                      |
| Ctrl+Shift+7（macOS 上为 Cmd+Shift+7） | 从任意应用裁剪。可在 `chrome://extensions/shortcuts` 中修改。 |
| 按住 Shift                             | 在 Glimpselet 悬浮窗或页面中开始裁剪。                        |
| Alt+P                                  | 暂停 Passive 摘要。                                           |

在 macOS 上，Cmd+Shift+5 会打开系统截图工具。Shift 可在已授予 Glimpselet 访问权限的网页上使用。网页无法监听其他应用的按键。

第一个操作是 **Float**。使用需要页面访问权限的功能时，扩展会请求权限。使用你自己已登录的 Claude Code 会话时，不需要提供服务商 API 密钥。直接 API 模式是可选的，需要你自己的 API 密钥。

## Claude Code 会话

Channel 预览的命令和配置请参阅 [Claude Code 会话](docs/DESIGN.md#the-running-claude-code-conversation)。没有启用 channel 时，Glimpselet 可以在单独进程中继续所选会话。这是并行继续。请勿同时在终端中使用该会话，否则并发访问可能冲突。

## 限制与隐私

Glimpselet 支持桌面版 Chrome、Edge 和其他 Chromium 浏览器。商店发布前会显示开发者提示，更新需要手动完成。浏览器设置、扩展商店和受限页面等部分页面会阻止访问。Chrome 内置 PDF 查看器无法读取，请使用 Glimpselet 阅读器。原生应用只能提供像素画面，无法读取页面文字或显示叠加层。Shift 可在悬浮窗及已授予访问权限的网页上使用。在其他应用中，请使用全局裁剪快捷键。悬浮窗口不支持点击穿透。

只有在你同意后，自动建议问题才会使用页面内容。被动摘要是可选功能，需要共享可检查的浏览器标签页。如果共享来源是窗口、屏幕、原生应用、未知来源或无法访问的来源，自动摘要会暂停。手动提问和截图仍可使用。

[安装指南](docs/INSTALL.md) | [使用方法](docs/USAGE.md) | [设计](docs/DESIGN.md) | [隐私详情](docs/SECURITY.md)

Assisted by Claude/Codex.

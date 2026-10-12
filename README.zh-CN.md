# Glimpselet

Glimpselet 是一个始终显示在其他窗口上方的小型聊天窗口，可连接到现有的 Claude Code 会话。它可以读取和翻译可访问的网页，在真实页面上绘制指引，并截取网页区域或共享屏幕画面来回答问题。

![Glimpselet 浮动聊天演示](assets/demo.gif)

![绘制在真实页面上的指引圆圈](assets/screenshots/guide.png)

[打开静态演示](https://arthur031221.github.io/Glimpselet/)。演示使用示例图片和预录回答，不会调用服务商。

## 安装

在 Claude Code 中安装 Glimpselet 插件：

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

运行 `/glimpse` 并按照设置指南操作。安装和配对步骤以该指南为准。

### 高级：从源代码加载

1. 在 Chrome 或 Edge 中打开 `chrome://extensions`，启用**开发者模式**。
2. 选择**加载已解压的扩展程序**。
3. 选择设置指南提供的扩展程序文件夹。
   > **开发者模式：** Glimpselet 目前以开发者模式分发。在应用商店上架前，更新需要手动安装。

## 截取与快捷键

在浮动气泡或可访问的网页上按住 Shift，即可开始裁剪。Shift 无法监听其他应用中的按键。网页区域直接在当前页面上框选。分享屏幕时，画面会冻结并以全屏显示供你裁剪。按 Enter 确认，按 Esc 取消。

浏览器裁剪快捷键是 Ctrl+Shift+S，Mac 为 Cmd+Shift+S，可在浏览器中启动裁剪。全局快捷键默认为 Ctrl+Shift+7，因为 Chrome 的全局快捷键必须包含数字键。你可以在 `chrome://extensions/shortcuts` 修改，也可以改为 S。

## Claude Code 会话

有文档说明的 MCP channel 支持可将消息发送到正在运行的 Claude Code 会话。Glimpselet 会从 channel 回复工具的分块内容镜像回复。终端中的会话控制模型和权限。若要添加 Glimpselet 自定义 channel，请使用开发 channel 重启会话，然后运行 `/glimpse`：

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

没有 channel 时，Glimpselet 可通过另一个 print 模式进程使用 `claude --resume SESSION_ID -p` 继续同一会话。这是并行继续。请勿与终端中使用同一会话的进程同时运行，以免发生并发冲突。

## 限制

- 仅支持 Chrome、Edge 和其他 Chromium 浏览器。
- `chrome://` 等浏览器内部页面、扩展程序商店以及部分受管理页面会限制扩展程序访问。
- Glimpselet 无法在原生应用上绘图。可以分享屏幕并询问画面，但网页覆盖层和文本操作不可用。
- PDF 请使用 Glimpselet 随附的阅读器。Chrome 内置 PDF 查看器不是可访问的网页。
- 浏览器的 Document Picture-in-Picture API 不支持点击穿透，因此浮动窗口无法将点击传递到其他应用。浏览器也无法保证浮动窗口或自动弹出。使用浮动窗口时，请保持扩展程序页面打开。

## 隐私

不收集遥测数据。取得同意后，页面文字可能会发送以生成建议问题。提问和自愿启用的被动摘要也会发送相关文字和图像。画面保留在内存中，仅在截取或提问请求时发送到桥接服务。桥接模式会在主机运行 CLI，会话记录也保存在主机。直接 API 模式从扩展程序发送请求。API 密钥和桥接令牌保存在浏览器会话存储中。偏好设置保存在浏览器本地存储中。详见[安全与隐私](docs/SECURITY.md)。

## 更多信息

[安装](docs/INSTALL.md) | [使用](docs/USAGE.md) | [设计与集成](docs/DESIGN.md) | [商店准备](docs/STORE.md) | [发行说明](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

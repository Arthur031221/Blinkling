<p align="center"><img src="assets/logo.svg" width="72" alt="Glimpselet 的伙伴 Blink"><br><strong>Glimpselet</strong><br><em>Blink 等待。你指出画面。它来回答。</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> 在小型浮动窗口中，向你的编程助手询问正在共享的屏幕。

已检查的测试结果：20 项合成屏幕阅读任务全部通过，作者逐一检查了每个回答。通过集成插件使用 CLI Haiku 进行实测。中位数 2.609 秒，p95 为 3.263 秒。[结果与方法](assets/benchmark.json)。

| 操作前       | 操作后                               |
| ------------ | ------------------------------------ |
| 屏幕信息太多 | 冻结画面、裁剪或遮住细节，再提出问题 |

通过两个斜线命令安装插件：

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

然后运行 `/glimpselet:glimpse`。需要 Node.js 22 或更高版本，不需要浏览器扩展。

<p align="center"><img src="assets/demo.gif" width="800" alt="Glimpselet 使用清楚标注的测试画面和预录回答，不会调用模型"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">打开静态演示</a>  |  预录示例，不会发送供应商请求</p>

## 日常使用

```text
/glimpselet:glimpse
在浏览器选择器中选择屏幕、窗口或标签页。
冻结画面、裁剪区域，并用不透明遮罩盖住隐私内容。
提出问题，阅读流式回答，然后继续追问。
复制或固定回答，结束后清除本地会话。
```

提问或启用被动笔记前，画面只保留在本机。不透明遮罩会修改发出的图像。被动笔记每两秒采样一次，为变化画面发送简短描述请求，默认每个滚动分钟最多六次（每小时最多 360 次）。这是请求数量上限，不代表费用，也可以调低。

**何时分享由你决定，程序不会自行开始观看。**

## 详细说明

<details>
<summary>安装和打开</summary>

上方两个命令会添加并安装插件。运行 `/glimpselet:glimpse`，即可在随机端口打开本地面板。一次性链接在 60 秒后失效，且只能兑换一次，内存中的面板会话持续 30 分钟。浏览器选择器会让你选择显示器、应用窗口或标签页。

</details>

<details>
<summary>提问、追问和查看</summary>

可选择 `sonnet`、`opus` 或 `haiku` 模型别名。问题会通过已安装且受限的命令行工具流式处理，也可以由本地桥接程序发起可选 API 请求。受限 CLI 会移除常规命令工具，但企业管理的 hooks 仍可能执行，因此它不是操作系统级沙箱。仍需信任已安装的 CLI 及组织配置的策略 hooks。追问可以带入范围有限的近期上下文。面板提供裁剪、冻结、不透明遮罩、复制、固定、最近十分钟时间线、摘要和 Markdown 导出。摘要使用已有的被动笔记，不会另行发送新图像。清除会中止任务，并移除本地帧、笔记、历史和内存中的 API 密钥。

</details>

<details>
<summary>浮动窗口和浏览器支持</summary>

打开浮动面板需要用户操作。Chrome 和 Edge 116 及以上版本在支持时可以使用 Document Picture-in-Picture。如果此功能请求被拒绝，请再次点击 **Open popup** 以打开普通弹窗。弹窗不保证始终位于其他窗口之上。窗口位置由浏览器控制，浏览器也可能沿用之前的位置。此标签页会记住紧凑或展开的选择。浏览器和操作系统的捕获权限及选项各不相同。

</details>

<details>
<summary>从源码开发</summary>

需要 Node.js 22 或更高版本，然后运行 `npm ci`、`npm run build` 和 `npm run build:plugin`。完整检查请见[贡献指南](CONTRIBUTING.md)。静态演示使用测试图片和预录文字，不会请求模型回答。

</details>

## 限制

浏览器分享启用时，MCP 捕获会使用该分享来源。如果来源断开或无法响应，捕获会直接失败，不会替换为未应用遮罩的原生捕获。分享断开后，分享意图仍会保留，直到明确停止分享、清除本地数据或会话过期。在此之前不会使用原生捕获。分享意图结束后，原生捕获才可用，而且依赖平台工具和操作系统权限：macOS 支持屏幕、窗口和区域，Windows 支持屏幕，Linux 支持情况取决于 Wayland 或 X11 工具。普通弹窗不保证置顶。程序无法可靠识别密码、光标或窗口标题。发送前请检查每一帧。

另一个 `screen_watch_start` MCP 工具可按指定的 5 至 60 秒间隔连续采样，只保留有变化的帧，并且不调用模型。它与面板每两秒采样并生成描述的被动笔记不同。

更多内容：[使用方式](docs/USAGE.md)、[安装](docs/INSTALL.md)、[配置](docs/CONFIGURATION.md)、[架构](docs/ARCHITECTURE.md)、[安全与隐私](docs/SECURITY.md)、[插件结构](docs/PLUGIN.md)、[贡献](CONTRIBUTING.md)、[MIT 许可](LICENSE)。

## Disclosure

Assisted by Claude/Codex.

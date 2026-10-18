<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink는 화면 구석에 삽니다. Ctrl을 누른 채 클릭하면 답이 옵니다.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. 이전 플러그인을 쓰고 있다면 `/plugin uninstall glimpselet@glimpselet` 과 `/plugin marketplace remove glimpselet` 를 실행한 뒤 아래 단계로 Blinkling 을 설치하세요.

Blinkling은 Blink라는 작은 초록색 친구를 화면 모서리, 모든 앱 위에 둡니다. Ctrl(macOS에서는 Control)을 누른 채 묻고 싶은 것을 클릭하거나, 드래그해서 영역을 가져옵니다. 선택한 것이 Blink로 날아 들어가고, 질문을 입력하면 답이 Blink 옆 채팅 카드에 열립니다.

Blinkling은 보고 설명하기만 합니다. 앱에서 클릭하거나 입력하는 일은 절대 없습니다.

이 컴퓨터에서 이미 로그인한 Claude Code를 사용합니다.

<p align="center">
<img src="assets/pick.webp" alt="arXiv 페이지에서 Ctrl을 누른 채 문단을 클릭합니다. 스냅샷이 Blink의 입으로 날아들고 채팅 카드가 열리며 답이 흘러나옵니다."><br>
논문: Ctrl을 누르고 문단을 클릭해 답을 읽습니다.
</p>

<p align="center">
<img src="assets/translate.webp" alt="아랍어 위키백과 페이지에서 고른 문단을 Blink에 보내고 번역을 누르면, 답이 그 문단을 영어로 설명합니다."><br>
번역: 아랍어 문단을 영어로 설명합니다.
</p>

<p align="center">
<img src="assets/tour.webp" alt="내용이 빽빽한 공개 웹 페이지에서 안내를 누르면 페이지의 각 부분에 표시가 붙습니다. Blink는 지시봉으로 현재 단계를 가리키고, 다음으로 넘어갑니다."><br>
안내: 다루기 어려운 페이지를 한 단계씩.
</p>

## 설치

이 컴퓨터에 로그인된 Claude Code가 필요합니다. Windows에서는 nodejs.org의 Node.js 22 이상도 필요하며, Blinkling이 대신 내려받지 않습니다. macOS와 Linux는 다른 것이 필요 없습니다.

무언가를 설치했다면 터미널을 닫고 새로 열어 주세요. 그래야 새 프로그램을 찾습니다.

1. 다음 줄을 터미널에 붙여 넣고 Enter를 누릅니다.

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Blink 채널로 Claude Code를 시작합니다.

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   이 플래그는 Blink의 채팅과 이 터미널 세션이 서로를 볼 수 있게 합니다. Claude Code가 한 번 확인을 요청합니다. 플래그가 없어도 Blink는 동작하고 자기 세션에서 답합니다.

   그다음 그 세션에서 다음을 실행합니다.

   ```text
   /blinkling:blinkling
   ```

3. Mac에서는 시스템 설정의 개인정보 보호 및 보안에서 Blinkling에 화면 기록을 한 번 허용합니다. macOS는 손쉬운 사용도 한 번 묻는데, Ctrl 키로 선택을 시작하려면 필요하니 같은 곳에서 허용하세요.

Mac이나 Linux에 Node.js가 없으면 Blinkling이 처음 시작할 때 전용 사본을 받아 옵니다. 크기는 약 45 MB이고 고정된 SHA-256으로 확인합니다. 그 첫 시작에서 Claude Code가 Blinkling 연결에 실패했다고 하면 1분 기다렸다가 `/mcp`를 실행하세요.

> [!NOTE]
> Windows PowerShell 5에서는 두 명령을 `&&`로 잇지 말고 하나씩 차례로 실행하세요. 사용 중인 컴퓨터에 맞는 애니메이션 단계는 [설치 가이드](https://arthur031221.github.io/Blinkling/install/)에 있습니다. 다른 설치 방법, 업데이트, Linux 샌드박스는 [docs/INSTALL.md](docs/INSTALL.md)에 있습니다.

## 읽으면서 사용하기

- Ctrl을 누른 채 문단, 버튼, 그림을 클릭하면 Blink가 가져갑니다.
- Ctrl을 누른 채 드래그하면 대신 영역을 가져옵니다.
- 채팅 카드가 Blink 옆에 열리고, 선택한 것, 빠른 질문 세 개, 모델, 강도, 권한 선택기가 나옵니다. Enter는 강조된 질문을 보냅니다.
- 이야기하고 싶을 때 언제든 Blink를 클릭하세요. 카드가 지금까지의 대화와 함께 열립니다.

![Blink를 클릭하고 질문을 입력하면 답이 채팅 카드로 흘러 들어옵니다.](assets/ask.webp)

- Blink의 메뉴에는 캡처, 가이드, 자동 설명, 설정이 있습니다. 자동 설명은 켜기 전까지 꺼져 있습니다.
- Chrome이나 Edge용 선택형 브라우저 도우미는 페이지의 구조를 Blink에 알려 주므로, Blink가 가리킨 문단이나 버튼을 알 수 있습니다. 전체 페이지 캡처, 제자리 번역, PDF 리더도 더해집니다. 도구 모음 버튼은 연결 여부를 보여 주고 Blink를 깨웁니다. 없어도 Blink는 모든 창에서 동작합니다.

## 단축키

| 단축키                 | 동작                                              |
| ---------------------- | ------------------------------------------------- |
| Ctrl + 클릭            | 포인터 아래의 것에 대해 묻기                      |
| Ctrl + 드래그          | 영역 가져오기                                     |
| 설정의 단축키          | 캡처 오버레이 열기                                |
| Ctrl + Alt + Shift + B | Blink 종료(Mac에서는 Ctrl + Option + Command + B) |

키는 설정에서 바꿀 수 있습니다.

## 세션과 개인정보

Blink는 선택한 것을 로그인된 본인의 Claude Code로 보내고 답을 채팅 카드에 보여 줍니다. Blink를 시작한 터미널 세션에서 입력한 내용과 그 답도 Blink의 채팅에 나타납니다.

반대 방향, 곧 Blink의 채팅을 터미널에 보이게 하는 부분은 Claude Code의 실험적 채널을 씁니다. 채널은 Claude Code가 시작될 때만 불러오므로 `claude --dangerously-load-development-channels plugin:blinkling@blinkling`로 시작하세요. `/blinkling:blinkling`도 같은 명령을 보여 줍니다.

> [!IMPORTANT]
> 브라우저 도우미는 사용자가 페이지를 가리킬 때만 그 페이지를 읽습니다. 비밀번호와 결제 입력란은 읽지 않고, 사용자 컴퓨터의 Blinkling과만 통신합니다. 자동 설명은 켜기 전까지 꺼져 있습니다.

Blinkling에는 텔레메트리도, 자체 답변 서비스도 없습니다. 선택한 내용은 본인의 Claude Code로 가고, 제공자의 약관과 사용 요금이 적용됩니다. 브라우저 설정, 확장 프로그램 스토어, 브라우저 자체 PDF 뷰어는 보호된 페이지라서 그곳에서는 Blink가 화면을 보고 답합니다.

[개인정보](docs/SECURITY.md) | [사용법](docs/USAGE.md) | [릴리스 노트](docs/releases/v3.2.6.md)

Assisted by Claude/Codex.

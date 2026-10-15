<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink는 화면 구석에 삽니다. Ctrl을 누른 채 클릭하면 답이 옵니다.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. 이전 플러그인을 쓰고 있다면 `/plugin uninstall glimpselet@glimpselet` 과 `/plugin marketplace remove glimpselet` 를 실행한 뒤 아래 단계로 Blinkling 을 설치하세요.

Blinkling은 작은 초록색 친구 Blink를 화면 구석, 모든 앱 위에 둡니다. 궁금한 것을 **Ctrl**(macOS에서는 Control)을 누른 채 클릭하거나, 드래그해서 영역을 선택하세요. 선택한 내용이 Blink로 날아가고, 질문하면 답이 말풍선으로 돌아와 이야기하는 곳을 가리킵니다.

> **설계부터 안전합니다:** Blinkling은 보고 설명만 합니다. 클릭하거나 입력하거나 앱을 조작하지 않습니다.

이 컴퓨터에 로그인된 Claude Code를 사용합니다.

## 설치

로그인한 Claude Code가 필요합니다. 그다음:

1. 터미널에 아래 한 줄을 붙여넣고 Enter를 누르세요:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Claude Code에서 실행하세요:

   ```text
   /blinkling:blinkling
   ```

3. Mac에서는 Blinkling의 **화면 기록**을 한 번 허용하세요: 시스템 설정, 개인정보 보호 및 보안.

> [!NOTE]
> Windows PowerShell 5에서는 `&&` 대신 `;`을 사용하세요. 내 컴퓨터용 애니메이션 단계: [설치 안내](https://arthur031221.github.io/Blinkling/install/). 다른 설치 방법, 업데이트, Linux 샌드박스: [docs/INSTALL.md](docs/INSTALL.md).

## 읽으면서 사용하기

- **Ctrl을 누른 채 클릭**하면 화면의 문단, 버튼, 그림을 Blink가 가져가 Claude Code에 묻습니다. **Ctrl을 누른 채 드래그**하면 영역을 가져옵니다.
- 작은 입력창이 열리고 빠른 질문 세 개가 나타납니다. Enter는 강조된 질문을 보냅니다. Blink를 클릭하면 언제든 대화를 이어갈 수 있습니다.
- 답변은 이야기하는 대상을 가리키는 말풍선으로 도착합니다. Blink 메뉴에는 캡처, 가이드, 자동 설명(켜기 전까지 꺼짐), 설정이 있습니다.
- 선택 사항인 Chrome/Edge 브라우저 도우미는 페이지 자체의 구조를 제공해 Blink가 가리킨 문단이나 버튼을 알게 하고, 전체 페이지 캡처, 페이지 제자리 번역, PDF 리더도 더해 줍니다. 도구 모음 버튼은 연결 여부를 보여 주고 Blink를 깨웁니다. 도우미가 없어도 Blink는 모든 창에서 작동합니다.

## 단축키

| 단축키        | 동작                         |
| ------------- | ---------------------------- |
| Ctrl + 클릭   | 포인터 아래의 것에 대해 묻기 |
| Ctrl + 드래그 | 영역 가져오기                |
| 설정의 단축키 | 캡처 오버레이 열기           |

키는 설정에서 고를 수 있습니다.

## 세션과 개인정보

Blink는 고른 내용을 로그인된 본인의 Claude Code로 보내고, 답변을 해당 대상 옆에 보여 줍니다. 같은 대화를 터미널에서 동시에 사용하지 마세요.

> [!IMPORTANT]
> 브라우저 도우미는 사용자가 가리킬 때만 그 페이지를 읽습니다. 비밀번호와 결제 입력란은 절대 읽지 않으며, 사용자 컴퓨터의 Blinkling하고만 통신합니다. 자동 설명은 켜기 전까지 꺼져 있습니다.

원격 측정도, 게시자가 운영하는 답변 서비스도 없습니다. 고른 내용은 본인의 Claude Code로 전송되며 제공업체 약관과 사용 요금이 적용됩니다. 브라우저 설정, 확장 프로그램 스토어, 브라우저 내장 PDF 뷰어는 보호된 페이지이며, 그곳에서는 Blink가 화면만 보고 답합니다. [개인정보](docs/SECURITY.md) | [사용법](docs/USAGE.md) | [릴리스 노트](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

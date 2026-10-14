<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Blinkling</h1>

<p align="center"><strong>답을 읽고 있는 페이지 곁에.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. 이전 플러그인을 쓰고 있다면 `/plugin uninstall glimpselet@glimpselet` 과 `/plugin marketplace remove glimpselet` 를 실행한 뒤 아래 단계로 Blinkling 을 설치하세요.

작은 Claude Code 플로팅 채팅입니다. 페이지를 질문하고, 영역을 캡처하고, 가이드를 따라가거나 문장을 번역하세요.

> [!TIP]
> 로그인한 본인 Claude Code 계정과 데스크톱 Chrome 또는 Edge를 사용합니다. Claude Code에는 API 키가 필요 없습니다.

![Google Flights: 페이지 가이드를 보고 왕복 항공편 예약을 질문합니다.](assets/demo.gif)

_Google Flights: 페이지 가이드를 보고 왕복 항공편 예약을 질문합니다._

## 설치

1. Claude Code에서 플러그인을 설치합니다:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. 시작 안내를 엽니다:

   ```text
   /blinkling:blinkling
   ```

3. `chrome://extensions`(또는 `edge://extensions`)에서 **개발자 모드**를 켭니다. **Load unpacked**를 선택하고 **Show in Files / Finder**가 여는 폴더를 지정합니다. 시작 페이지가 자동으로 연결되면 버블을 엽니다.

> [!NOTE]
> 로컬 데스크톱에서는 **Try without installing**으로 별도 Chromium 프로필을 열 수 있습니다. 원격 호스트에서는 브라우저 컴퓨터에서 표시된 SSH 명령을 실행합니다. [설치와 업데이트](docs/INSTALL.md).

### 고급: 소스에서 불러오기

<details>
<summary>소스 실행과 수동 업데이트</summary>

소스에서 플러그인을 실행하려면 Node.js 22+와 최신 Claude Code가 필요합니다. 터미널이 이미 기존 소스 저장소의 루트 폴더에 있다면 처음 두 명령은 건너뛰세요. 터미널에서 다음 명령을 실행하세요.

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

두 버전 확인 명령 모두 `2.1.0`을 표시해야 합니다. 플러그인 목록에는 `blinkling@inline` 버전 `2.1.0`이 이 세션에서 활성화된 것으로 표시되어야 합니다. 마지막 명령으로 Claude Code가 열리면 그 세션에서 `/blinkling:blinkling`를 실행해 시작 안내를 여세요. `--plugin-dir`는 이 세션에서만 소스 플러그인을 불러옵니다. 시작할 때마다 이 옵션을 사용하고, `npm run build:plugin`으로 다시 빌드한 후에는 Claude Code를 다시 시작하세요. 빌드한 확장 프로그램은 `dist-extension`에 있으며, 시작 안내가 아래 고정 폴더로 복사합니다.

플러그인 세부 정보에는 `blinkling`와 `install` 스킬 및 `blinkling` MCP 서버도 있어야 합니다. 패키지 확장 프로그램은 `bin/extension`에 있으며 버전도 **2.1.0**이어야 합니다. Claude Code가 원격 호스트에 있으면 안내의 SSH 명령을 사용하고, 브라우저가 있는 컴퓨터에서 확장 프로그램 ZIP을 다운로드한 후 압축을 푼 폴더를 불러오세요.

브라우저와 Claude Code가 같은 컴퓨터에서 실행되면 시작 안내가 빌드한 확장 프로그램을 고정 폴더 `~/Blinkling-extension`에 복사합니다. Chrome 또는 Edge에서 `chrome://extensions` 또는 `edge://extensions`를 열고 **Developer mode**를 켠 뒤 **Load unpacked**를 선택하고 이 폴더를 지정합니다. 개발자 배너는 계속 표시됩니다. 새 버전은 수동으로 업데이트해야 합니다.

압축 해제한 확장 프로그램을 업데이트할 때는 기존 버블을 닫고 `/blinkling:blinkling`를 다시 실행해 고정 폴더를 갱신한 뒤 확장 프로그램 카드에서 새로고침을 누르세요. Claude Code가 원격 호스트에 있으면 안내에서 새 ZIP을 받아 브라우저 컴퓨터의 압축 해제한 파일을 교체하고 확장 프로그램을 새로고침하세요. `~/Blinkling-extension`으로 옮길 때는 기존 확장 프로그램 카드를 삭제하고 이 폴더를 한 번 로드하세요.

설치된 플러그인은 아래 명령으로 업데이트한 뒤 Claude Code에서 `/reload-plugins`와 `/blinkling:blinkling`를 실행합니다. 플러그인 목록과 확장 카드가 **2.1.0**인지 확인하고 버블을 다시 여세요.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 읽으면서 사용하기

- **전체 화면 캡처** 또는 **영역 선택**. 지원 페이지나 버블에서 Shift를 누르고 드래그하세요. Enter는 확인, Esc는 취소입니다. 공유 화면 캡처 중 버블이 물러났다가 돌아옵니다.
- **이 페이지 안내**는 개요와 다음/이전 탐색으로 읽기 영역과 컨트롤을 설명합니다.
- 텍스트를 선택해 질문, 설명, 번역을 요청하세요. 페이지 내 번역은 복원할 수 있고 PDF는 내장 리더에서 엽니다.
- **자동 설명**은 최대 세 질문을 제안하고 변화를 요약합니다. Alt+P로 일시 중지합니다. 채팅 모델은 Opus, Sonnet, Haiku 중 선택합니다.

![arXiv: 초록을 선택하고 질문한 뒤 중국어 번체로 번역합니다.](assets/arxiv.gif)

_arXiv: 초록을 선택하고 질문한 뒤 중국어 번체로 번역합니다._

실제 확장 프로그램과 공개 사이트, Claude Code 답변을 녹화했습니다. 대기 시간은 줄였으며 페이지 내용과 답변은 연출하지 않았습니다.

## 단축키

| 단축키       | 동작                |
| ------------ | ------------------- |
| Alt+Shift+G  | 버블 열기           |
| Ctrl+Shift+S | 브라우저에서 자르기 |
| Ctrl+Shift+7 | 다른 앱에서 자르기  |

macOS에서는 Ctrl 대신 Cmd를 사용합니다. `chrome://extensions/shortcuts`에서 변경하세요. Shift는 지원 페이지와 버블 안에서만 작동합니다.

## 세션과 개인정보

검증된 Claude Code 라이브 채널이 있으면 사용하고, 없으면 별도 프로세스에서 프로젝트의 최신 저장 대화를 이어갑니다. 같은 기록을 터미널에서 동시에 사용하지 마세요. [채널 설정과 제한](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> **자동 설명**은 동의와 사이트 접근 허용 후 **화면 공유 없이** 페이지 변화를 요약합니다. 비밀번호 필드와 차단 목록은 자동 요약과 질문 제안을 중지합니다. 화면 요약은 검사한 동일한 탭에 연결된 브라우저 탭 공유와 같은 검사를 사용합니다. 공유 모니터나 앱에는 **공유할 때마다 별도의 동의**가 필요합니다. 해당 픽셀의 비밀번호나 차단 사이트는 검사할 수 없습니다. 알 수 없는 공유 소스는 중지 상태를 유지합니다.
> 로딩 중이거나 접근할 수 없는 삽입 페이지도 자동 요청을 중지합니다.

텔레메트리나 게시자가 운영하는 답변 서비스는 없습니다. 선택한 문맥과 캡처는 본인 백엔드로 전송되며 제공자의 조건과 요금이 적용됩니다. 네이티브 앱은 픽셀만 제공합니다. 브라우저 설정, 확장 스토어, 보호된 페이지에서는 페이지 도구가 차단됩니다. 네이티브 창의 불투명도와 클릭 통과는 브라우저 제약을 받습니다. [개인정보](docs/SECURITY.md) | [사용법](docs/USAGE.md) | [릴리스 노트](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

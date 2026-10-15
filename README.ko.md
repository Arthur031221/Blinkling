<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

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

3. `chrome://extensions`(또는 `edge://extensions`)에서 **개발자 모드**를 켭니다. **Load unpacked**를 선택하고 **Show in Files / Finder**가 여는 폴더를 지정합니다. 시작 페이지가 자동으로 연결되면 도구 모음의 Blink 버튼을 눌러 연결 상태를 확인합니다.

> [!NOTE]
> 브라우저 도우미는 선택 사항입니다. 없어도 Blink는 모든 창에서 작동합니다. Chrome이나 Edge에서는 `/blinkling:install`을 실행한 뒤 3단계처럼 `~/Blinkling-extension`을 불러오세요. [설치 및 업데이트](docs/INSTALL.md).

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

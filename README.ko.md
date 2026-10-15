<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>답을 읽고 있는 페이지 곁에.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. 이전 플러그인을 쓰고 있다면 `/plugin uninstall glimpselet@glimpselet` 과 `/plugin marketplace remove glimpselet` 를 실행한 뒤 아래 단계로 Blinkling 을 설치하세요.

Blink는 화면 구석에 있는 작은 동반자입니다. Ctrl을 누른 채 무언가를 클릭하면 Claude Code에 물어볼 수 있습니다.

> [!TIP]
> Blink는 같은 컴퓨터에서 이미 로그인한 Claude Code를 사용합니다.

## 설치

1. Claude Code에서 플러그인을 설치합니다:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Blink를 깨웁니다. 처음에는 3단계 시작 안내가 나타납니다:

   ```text
   /blinkling:blinkling
   ```

3. 선택 사항, 페이지 구조·전체 페이지 캡처·제자리 번역·PDF 리더용: `/blinkling:install`을 실행하고, `chrome://extensions`(또는 `edge://extensions`)에서 **개발자 모드**를 켠 뒤 **Load unpacked**를 선택해 `~/Blinkling-extension`을 지정합니다.

> [!NOTE]
> 보조 확장 프로그램은 선택 사항이며, 없어도 Blink는 동작합니다. [설치 및 업데이트](docs/INSTALL.md).

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

두 버전 확인 명령은 모두 **2.1.0**을 출력해야 하고, 플러그인 목록에는 `blinkling@inline`이 **2.1.0**으로, 이 세션에서 활성화된 것으로 표시되어야 합니다. 마지막 명령으로 연 Claude Code 세션에서 `/blinkling:blinkling`을 실행합니다. `--plugin-dir`은 해당 세션에만 체크아웃을 불러옵니다. 소스에서 Claude Code를 실행할 때마다 지정하고, 다시 빌드한 뒤에는 세션을 재시작하세요. 빌드된 확장 프로그램은 체크아웃 안의 `dist-extension`에 있습니다.

플러그인 상세 정보에도 `blinkling`과 `install` 스킬, `blinkling` MCP 서버가 있어야 합니다. 패키지된 확장 프로그램은 `bin/extension`에 있으며 버전도 **2.1.0**이어야 합니다.

브라우저 보조 확장 프로그램은 선택 사항입니다. `/blinkling:install`을 실행하면 빌드된 확장 프로그램이 고정 폴더 `~/Blinkling-extension`에 복사됩니다. Chrome 또는 Edge에서 `chrome://extensions` 또는 `edge://extensions`를 열고 **Developer mode**를 켠 뒤 **Load unpacked**를 선택해 그 폴더를 지정합니다. 개발자 배너는 계속 표시되며, 새 버전이 나오면 직접 업데이트해야 합니다.

압축 해제된 확장 프로그램을 업그레이드한 뒤에는 `/blinkling:install`을 다시 실행해 고정 폴더를 갱신하고, 확장 프로그램 페이지의 카드에서 새로고침을 누릅니다. `~/Blinkling-extension`으로 옮길 때는 기존 확장 프로그램 카드를 제거하고 이 폴더를 한 번 불러오세요.

설치된 플러그인은 아래 명령을 실행한 뒤 Claude Code에서 `/reload-plugins`와 `/blinkling:blinkling`을 실행합니다. 플러그인 목록과 확장 프로그램 카드가 모두 **2.1.0**인지 확인하세요.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## 읽으면서 사용하기

- **포인터 아래의 것에 대해 묻기.** Ctrl을 누른 채 클릭하거나, 드래그해서 영역을 선택합니다. 선택한 것이 Blink로 날아 들어가고 미니 입력창이 열립니다. Enter로 보냅니다.
- **Blink와 대화하기.** Blink를 클릭하면 미니 입력창에서 직전 대화를 이어 갑니다. 긴 메시지나 Shift+Enter는 전체 입력창으로 넓혀 줍니다.
- **말풍선으로 답하기.** 말풍선은 이야기하는 대상을 가리킵니다. Blink 위에서 휠을 굴리면 이전 말풍선을 다시 볼 수 있습니다.
- **메뉴.** Blink에 포인터를 올리면 열립니다: 캡처, 가이드, 자동 설명, 설정. 가이드는 페이지에 단계 번호를 표시하고 Markdown으로 저장할 수 있습니다. 자동 설명은 기본으로 꺼져 있고, 말풍선은 최대 두 개이며 표시는 그리지 않습니다.
- **브라우저 보조 확장 프로그램(선택).** 도구 모음 팝업에서 연결 상태를 보여 주고 **Wake Blink** 버튼이 있습니다. Blink가 페이지 구조를 읽고, 전체 페이지를 캡처하고, 페이지를 제자리에서 번역하고, PDF를 리더로 열 수 있게 해 줍니다.

캡처에는 전역 단축키 Ctrl+Shift+S(macOS는 Cmd)도 있으며 설정에서 바꿀 수 있습니다.

## 개인정보

Blink는 이 컴퓨터에서 로그인한 Claude Code에 질문하며, 사용자가 요청하기 전에는 아무것도 캡처하지 않습니다. 원격 측정이나 배포자가 운영하는 답변 서비스는 없습니다. 선택한 컨텍스트와 캡처는 Claude Code와 그 제공업체로 전달되며, 제공업체의 약관과 사용 요금이 적용됩니다. 보조 확장 프로그램은 `127.0.0.1`의 브리지와만 통신하고 비밀번호 필드나 입력값은 읽지 않습니다. 자동 설명은 켜기 전까지 꺼져 있습니다.

[개인정보 상세](docs/SECURITY.md) | [사용법](docs/USAGE.md) | [기능 목록](docs/FEATURES.md) | [릴리스 노트](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

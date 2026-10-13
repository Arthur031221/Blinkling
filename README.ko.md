# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

현재 보고 있는 페이지나 화면에 관해 Claude Code에 질문할 수 있는 작은 플로팅 채팅입니다. 웹 페이지를 읽고 번역하거나, 페이지의 실제 버튼을 안내받고, 화면 일부를 캡처해 질문할 수 있습니다.

|           Glimpselet 플로팅 채팅           |                 페이지 안내 예시                  |
| :----------------------------------------: | :-----------------------------------------------: |
| ![Glimpselet 플로팅 채팅](assets/demo.gif) | ![페이지 안내 예시](assets/screenshots/guide.png) |

필요 사항: 최신 Claude Code, 본인 구독 계정 로그인, Chrome 또는 Edge 같은 데스크톱 Chromium 브라우저.

Glimpselet은 전용 대화를 시작합니다. 최근 Claude Code 세션을 선택하면 별도 프로세스에서 이어갈 수 있습니다. 터미널에 열려 있는 대화형 세션으로 요청을 보내려면 channel 미리보기를 활성화하세요. [Channel 설정](docs/DESIGN.md#the-running-claude-code-conversation).

## 설치

1. Claude Code에 마켓플레이스를 추가하고 플러그인을 설치합니다.

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. 터미널에서 `claude plugin list`에 Glimpselet **2.0.0**이 표시되는지 확인한 후 Claude Code에서 `/glimpselet:glimpse`를 실행합니다.

3. 시작 안내에 따라 브라우저를 연결합니다. 로컬 데스크톱에서는 **Try without installing**을 선택하거나 본인 브라우저에 확장 프로그램을 불러와 페어링하세요. Claude Code가 원격 호스트에서 실행 중이면 안내의 SSH 명령을 브라우저가 있는 컴퓨터에서 실행하고, 그 컴퓨터에서 ZIP을 다운로드해 확장 프로그램을 불러옵니다. 원격 호스트에서는 설치 없는 브라우저를 사용할 수 없습니다. 페어링이 완료되면 Glimpselet 패널에 연결 모드와 프로젝트가 표시됩니다.

### 고급: 소스에서 불러오기

본인 데스크톱 브라우저에서 확장 프로그램은 고정 폴더 `~/.glimpselet/extension`에 저장됩니다. Chrome 또는 Edge에서 `chrome://extensions` 또는 `edge://extensions`를 열고 **Developer mode**를 켠 뒤 **Load unpacked**를 선택하고 이 폴더를 지정합니다. 개발자 배너는 계속 표시됩니다. 새 버전은 수동으로 업데이트해야 합니다.

## v1에서 업그레이드

Glimpselet이 이미 설치되어 있다면 터미널에서 마켓플레이스를 새로 고치고 플러그인을 업데이트하세요:

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Claude Code를 다시 시작하거나 현재 세션에서 `/reload-plugins`를 실행하세요. `claude plugin list`에 Glimpselet **2.0.0**이 표시되는지 확인한 후 `/glimpselet:glimpse`를 다시 실행하면 시작 및 페어링 안내가 열립니다. 여전히 1.x라면 마켓플레이스 원본에 v2가 아직 공개되지 않았을 수 있습니다. 설치를 반복해도 캐시된 플러그인은 업데이트되지 않습니다.

압축 해제한 확장 프로그램을 사용하면 안내가 새 파일을 `~/.glimpselet/extension`에 복사합니다. `chrome://extensions` 또는 `edge://extensions`에서 Glimpselet을 새로 고치고 버전이 **2.0.0**인지 확인하세요. SSH로 사용한다면 브라우저가 있는 컴퓨터에서 안내의 새 ZIP을 다운로드하고 이전에 불러온 폴더에 압축을 푼 후 새로 고치세요. 원격 호스트에서는 사용자 컴퓨터의 무설치 브라우저를 열 수 없습니다.

## 할 수 있는 일

- Opus, Sonnet, Haiku의 스트리밍 답변을 받고 후속 질문을 할 수 있습니다.
- 공유 화면을 전체 화면 보기에서 캡처하거나 페이지 오버레이로 영역을 자를 수 있습니다. Shift를 누른 채 드래그한 다음 Enter로 캡처하고 Esc로 취소합니다.
- 페이지가 바뀌면 함께 갱신되는 추천 질문을 볼 수 있습니다.
- 선택 사항인 Passive 요약을 켜고 Alt+P로 일시 중지하며 시간당 비용을 확인할 수 있습니다.
- 페이지의 실제 컨트롤 위에 안내를 표시합니다. 페이지에서 바로 번역하고 Restore로 원문을 되돌릴 수 있습니다.
- 텍스트를 선택해 설명, 번역 또는 질문을 할 수 있습니다. 내장 리더에서 PDF를 열고 질문할 수도 있습니다.

![이 페이지 안내](assets/guide.gif)

![선택한 영역](assets/crop.gif)

| 단축키                                | 동작                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Alt+Shift+G                           | Glimpselet을 열고 **Float**를 선택해 플로팅 채팅을 엽니다.                           |
| Ctrl+Shift+S(macOS에서는 Cmd+Shift+S) | 현재 페이지 또는 공유 화면을 자릅니다.                                               |
| Ctrl+Shift+7(macOS에서는 Cmd+Shift+7) | 모든 앱에서 화면을 자릅니다. `chrome://extensions/shortcuts`에서 변경할 수 있습니다. |
| Shift 누르기                          | Glimpselet 버블 또는 페이지에서 자르기를 시작합니다.                                 |
| Alt+P                                 | Passive 요약을 일시 중지합니다.                                                      |

macOS에서 Cmd+Shift+5는 시스템 스크린샷 도구를 엽니다. 웹페이지의 Shift는 Glimpselet 페이지에서만 작동하며 다른 앱에서는 입력을 받을 수 없습니다.

첫 동작은 **Float**입니다. 페이지 접근이 필요한 기능을 사용할 때 확장 프로그램이 권한을 요청합니다. 본인 Claude Code 로그인 세션을 사용하면 제공자 API 키가 필요하지 않습니다. 직접 API 모드는 선택 사항이며 본인 API 키가 필요합니다.

## Claude Code 세션

Channel 미리 보기 명령과 설정은 [Claude Code 세션](docs/DESIGN.md#the-running-claude-code-conversation)을 참조하세요. channel이 없으면 선택한 세션을 별도 프로세스에서 이어갈 수 있습니다. 이는 병렬 이어쓰기입니다. 동시에 터미널에서 같은 세션을 사용하지 마세요. 동시 접근은 충돌을 일으킬 수 있습니다.

## 제한 및 개인정보

Glimpselet은 데스크톱 Chrome, Edge 및 기타 Chromium 브라우저에서 작동합니다. 스토어 배포 전까지 개발자 배너가 표시되고 업데이트는 수동입니다. 브라우저 설정, 확장 프로그램 스토어, 제한된 페이지 등 일부 페이지는 접근을 차단합니다. Chrome 내장 PDF 뷰어는 읽을 수 없으므로 Glimpselet 리더를 사용하세요. 네이티브 앱에서는 픽셀만 제공되며 페이지 텍스트나 오버레이는 사용할 수 없습니다. Shift는 Glimpselet 자체 브라우저 화면에서만 작동하며 다른 앱에서는 작동하지 않습니다. 플로팅 창은 클릭을 통과시키지 않습니다.

자동 질문 제안은 동의한 경우에만 페이지 정보를 사용합니다. 수동 요약 기능은 선택 사항이며 검사 가능한 브라우저 탭을 공유해야 합니다. 공유 소스가 창, 화면, 네이티브 앱, 알 수 없는 소스 또는 접근 불가 페이지라면 자동 요약이 일시 중지됩니다. 수동 질문과 캡처는 계속 사용할 수 있습니다.

[설치 안내](docs/INSTALL.md) | [사용법](docs/USAGE.md) | [설계](docs/DESIGN.md) | [개인정보 상세](docs/SECURITY.md)

Assisted by Claude/Codex.

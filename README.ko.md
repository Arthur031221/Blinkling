# Glimpselet

Glimpselet은 다른 창 위에 계속 표시되며 기존 Claude Code 세션에 연결되는 작은 채팅 창입니다. 접근 가능한 웹페이지를 읽고 번역하며, 실제 페이지 위에 안내 표시를 그리고, 질문을 위해 페이지 영역이나 공유 화면 프레임을 캡처할 수 있습니다.

![Glimpselet 플로팅 채팅](assets/demo.gif)

![실제 페이지 위에 그려진 안내 원](assets/screenshots/guide.png)

[정적 데모 열기](https://arthur031221.github.io/Glimpselet/). 예시 이미지와 녹화된 답변을 사용하며 서비스에 요청을 보내지 않습니다.

## 설치

Claude Code에 Glimpselet 플러그인을 설치합니다.

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

`/glimpse`를 실행하고 설정 안내를 따르세요. 설치와 페어링 방법은 이 안내를 기준으로 합니다.

### 고급: 소스에서 불러오기

1. Chrome 또는 Edge에서 `chrome://extensions`를 열고 **개발자 모드**를 켭니다.
2. **압축해제된 확장 프로그램을 로드**를 선택합니다.
3. 설정 안내에 표시된 확장 프로그램 폴더를 선택합니다.

> **개발자 모드:** Glimpselet은 현재 개발자 모드로 배포됩니다. 스토어 등록 전까지 업데이트를 수동으로 설치해야 합니다.

## 캡처와 단축키

플로팅 버블이나 접근 가능한 웹페이지에서 Shift를 누르면 영역 선택을 시작합니다. Shift는 다른 앱에서 키 입력을 감지할 수 없습니다. 웹페이지에서는 현재 페이지 위에 영역을 그립니다. 화면 공유 중에는 프레임을 고정하고 전체 화면으로 열어 자릅니다. Enter로 확정하고 Esc로 취소하세요.

브라우저 자르기 단축키는 Ctrl+Shift+S(Mac은 Cmd+Shift+S)입니다. 전역 단축키 기본값은 Ctrl+Shift+7입니다. Chrome 전역 단축키에는 숫자 키가 필요합니다. `chrome://extensions/shortcuts`에서 변경할 수 있으며 S로 지정할 수도 있습니다.

## Claude Code 세션

문서화된 MCP channel 기능으로 실행 중인 Claude Code 세션에 메시지를 보낼 수 있습니다. Glimpselet은 reply 도구의 응답 청크를 채팅에 표시합니다. 모델과 권한은 터미널의 세션이 관리합니다. Glimpselet 사용자 지정 channel을 추가하려면 개발 channel을 활성화해 세션을 다시 시작한 뒤 `/glimpse`를 실행하세요.

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

channel이 없으면 별도의 print 모드 프로세스에서 `claude --resume SESSION_ID -p`로 같은 세션을 이어갈 수 있습니다. 이는 병렬 이어쓰기입니다. 같은 세션을 사용하는 터미널 프로세스와 동시에 실행하면 충돌할 수 있습니다.

## 제한 사항

- Chrome, Edge 및 기타 Chromium 브라우저만 지원합니다.
- `chrome://` 같은 브라우저 내부 페이지, 확장 프로그램 스토어 및 일부 관리 페이지는 접근을 막습니다.
- 네이티브 앱 위에 그릴 수 없습니다. 화면을 공유해 이미지를 질문할 수 있지만 페이지 오버레이와 텍스트 기능은 사용할 수 없습니다.
- PDF는 Glimpselet에 포함된 리더를 사용하세요. Chrome 내장 PDF 뷰어는 접근 가능한 웹페이지가 아닙니다.
- 브라우저 Document Picture-in-Picture API는 클릭 통과를 지원하지 않아 플로팅 창에서 다른 앱으로 클릭을 전달할 수 없습니다. 플로팅 창이나 자동 팝아웃도 보장되지 않습니다. 사용하는 동안 확장 프로그램 페이지를 열어 두세요.

## 개인정보 보호

텔레메트리는 수집하지 않습니다. 동의하면 추천 질문 생성을 위해 페이지 텍스트가 전송될 수 있습니다. 질문과 선택형 수동 요약도 관련 텍스트와 이미지를 보낼 수 있습니다. 프레임은 메모리에 유지되며 캡처 또는 질문 요청 때만 브리지로 전송됩니다. 브리지 모드는 호스트에서 CLI를 실행하고 세션 기록도 호스트에 저장합니다. 직접 API 모드는 확장 프로그램에서 요청을 보냅니다. API 키와 브리지 토큰은 브라우저 세션 저장소에 유지됩니다. 설정은 브라우저 로컬 저장소에 저장됩니다. 자세한 내용은 [보안 및 개인정보](docs/SECURITY.md)를 참고하세요.

## 더 보기

[설치](docs/INSTALL.md) | [사용법](docs/USAGE.md) | [설계 및 통합](docs/DESIGN.md) | [스토어 준비](docs/STORE.md) | [릴리스 노트](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

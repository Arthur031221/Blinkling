<p align="center"><img src="assets/logo.svg" width="72" alt="Glimpselet의 동료 Blink"><br><strong>Glimpselet</strong><br><em>Blink는 기다립니다. 화면을 고르면 답합니다.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> 작은 플로팅 패널에서 선택한 화면에 관해 코딩 도우미에게 질문하세요. 프레임을 고정하고 자르거나 가린 뒤 질문할 수 있습니다.

<p align="center"><img src="assets/demo.gif" width="800" alt="테스트 화면과 녹화된 답변을 보여주는 Glimpselet 패널"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">정적 데모 열기</a>. 테스트 이미지와 녹화된 답변을 사용하며 답변 서비스에 요청하지 않습니다.</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="420 px 밝은 테마"><img src="assets/screenshots/dark-420.png" width="49%" alt="420 px 어두운 테마"></p>

<details>
<summary>여섯 가지 크기와 테마</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="밝은 테마 패널 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="밝은 테마 패널 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="밝은 테마 패널 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="어두운 테마 패널 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="어두운 테마 패널 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="어두운 테마 패널 520 px"></p>

</details>

플로팅 모드에는 데스크톱 Chromium 브라우저가 필요합니다. 설치 전에 Node.js 22 이상과 설치된 코딩 도우미를 준비하세요.

슬래시 명령 두 개로 플러그인을 설치합니다.

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

그다음 `/glimpselet:glimpse`를 실행하세요. Node.js 22 이상이 필요하며 브라우저 확장 기능은 없습니다.

## 평소 사용 방법

```text
/glimpselet:glimpse
브라우저 선택기에서 화면, 창 또는 탭을 고릅니다.
프레임을 고정하고 영역을 자른 뒤 불투명 마스크로 민감한 내용을 가립니다.
질문을 입력하고 스트리밍 답변을 읽은 뒤 후속 질문을 합니다.
답변을 복사하거나 고정하고 끝나면 로컬 세션을 지웁니다.
```

질문을 보내거나 자동 메모를 켜기 전까지 이미지는 기기에 남습니다. 불투명 마스크는 전송 이미지에 적용됩니다. 자동 메모는 2초마다 샘플링하고 달라진 프레임에 대해 짧은 설명을 요청합니다. 기본 제한은 분당 6회, 시간당 최대 360회입니다. 이는 요청 횟수 제한이지 비용 안내가 아닙니다. 더 낮은 제한을 설정할 수도 있습니다.

MCP 화면 도구는 호출될 때 코딩 세션에 이미지를 반환합니다. 패널 이미지는 자르기와 마스크 처리 후 긴 변 1536픽셀, 총 180만 픽셀로 제한됩니다. 작은 선택 영역은 원래 해상도를 유지합니다.

**화면 공유는 사용자가 시작하며 자동으로 화면을 보지 않습니다.**

## 자세히 보기

<details>
<summary>조작과 상태</summary>

패널 크기 조절 버튼이나 화살표 키로 크기를 바꾸세요. 브라우저가 허용하면 창 가장자리를 끌어 크기를 조정할 수 있습니다. 자르기 또는 마스크 모드에서 화살표는 선택 영역을 이동하고 Shift와 화살표는 크기를 바꿉니다. Enter는 적용하고 Escape는 취소합니다. 질문 입력란에서 Escape를 누르면 자동 메모를 일시 중지하고 입력한 문장을 유지한 채 현재 질문을 취소합니다. 설정은 모달 창으로 열립니다. 이전 답변의 고정을 해제할 수 있습니다. **Resume live view**는 자르기와 마스크를 유지합니다. 위로 스크롤하면 스트리밍 답변 따라가기가 멈춥니다. 패널은 공유, 모델, 자동 메모 상태를 표시합니다.

</details>

<details>
<summary>설치 및 열기</summary>

위 명령 두 개로 플러그인을 추가하고 설치합니다. `/glimpselet:glimpse`는 임의 포트에서 로컬 패널을 엽니다. 일회용 링크는 60초 후 만료되며 한 번만 교환할 수 있습니다. 메모리에 있는 패널 세션은 30분 동안 유지됩니다. 브라우저 선택기에서 디스플레이, 앱 창 또는 탭을 선택하세요.

</details>

<details>
<summary>질문, 후속 질문, 검토</summary>

질문은 설치된 코딩 도우미에서 처리하거나 로컬 브리지에서 선택형 API 요청으로 보낼 수 있습니다. 제한된 CLI는 일반 명령 도구를 제거하지만 기업에서 관리하는 hooks는 계속 실행될 수 있으므로 운영 체제 수준의 샌드박스가 아닙니다. 설치된 CLI와 조직에서 설정한 정책 hooks를 신뢰해야 합니다. 후속 질문에는 범위가 제한된 최근 대화 문맥이 포함될 수 있습니다. 자르기, 프레임 고정, 불투명 마스크, 복사, 고정, 최근 10분 타임라인, 요약과 Markdown 내보내기를 지원합니다. 요약은 기존의 수동 메모를 사용하며 새 이미지를 보내지 않습니다. **Clear**는 작업을 중단하고 로컬 프레임, 메모, 기록과 메모리의 API 키를 지웁니다.

</details>

<details>
<summary>플로팅 창과 브라우저 지원</summary>

지원되는 데스크톱 Chromium 브라우저에서 Document Picture-in-Picture를 사용할 수 있습니다. 이 창의 위치는 브라우저가 제어합니다. 브라우저가 허용하면 팝업 위치를 기억합니다. 컴팩트와 확장 크기는 따로 기억합니다.

</details>

<details>
<summary>소스에서 개발</summary>

Node.js 22 이상에서 `npm ci`, `npm run build`, `npm run build:plugin`을 실행하세요. 전체 검사 목록은 [기여 안내](CONTRIBUTING.md)를 확인하세요. 정적 데모는 테스트 이미지와 녹화된 문장을 사용하며 모델 답변을 요청하지 않습니다.

</details>

## 제한 사항

브라우저 공유가 활성화된 동안 MCP 캡처는 그 공유 화면을 사용합니다. 연결이 끊기거나 응답하지 않으면 실패로 처리하며 마스크가 적용되지 않은 네이티브 캡처로 대체하지 않습니다. 공유가 끊겨도 공유 의도는 유지되며, **Stop sharing**을 명시적으로 누르거나 **Clear**로 로컬 데이터를 지우거나 세션이 만료될 때까지 네이티브 캡처로 전환되지 않습니다. 공유 의도가 끝난 뒤에만 네이티브 캡처를 사용할 수 있으며 플랫폼 도구와 OS 권한에 따라 달라집니다. macOS는 화면, 창, 영역을 지원하고 Windows는 화면을 지원합니다. Linux는 Wayland 또는 X11 도구가 필요합니다. 일반 팝업이 항상 위에 유지된다는 보장은 없습니다. 암호, 커서 위치, 창 제목을 안정적으로 알아낼 수 없습니다. 전송하기 전 이미지를 확인하세요.

별도의 `screen_watch_start` MCP 도구는 5~60초 간격으로 순차 캡처하고 달라진 프레임만 보관하며 모델을 호출하지 않습니다. 2초 간격으로 설명을 만드는 패널 자동 메모와는 다른 기능입니다.

[사용법](docs/USAGE.md) | [설치](docs/INSTALL.md) | [설정](docs/CONFIGURATION.md) | [구조](docs/ARCHITECTURE.md) | [보안 및 개인정보](docs/SECURITY.md) | [플러그인 구성](docs/PLUGIN.md) | [기여](CONTRIBUTING.md) | [MIT 라이선스](LICENSE)

## Disclosure

Assisted by Claude/Codex.

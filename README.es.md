<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La respuesta, junto a la página.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. ¿Vienes del plugin anterior? Ejecuta `/plugin uninstall glimpselet@glimpselet` y `/plugin marketplace remove glimpselet`, y luego instala Blinkling con los pasos de abajo.

Un pequeño chat flotante de Claude Code. Pregunta sobre una página, captura una zona, sigue una guía o traduce un pasaje.

> [!TIP]
> Usa tu propia cuenta de Claude Code con sesión iniciada y Chrome o Edge de escritorio. Claude Code no necesita una clave API.

![Google Flights: una guía de la página y una pregunta sobre cómo reservar un viaje de ida y vuelta.](assets/demo.gif)

_Google Flights: una guía de la página y una pregunta sobre cómo reservar un viaje de ida y vuelta._

## Instalación

Necesitas Claude Code con la sesión iniciada. Después:

1. Pega esta línea en una terminal y pulsa Intro:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. En Claude Code, ejecuta:

   ```text
   /blinkling:blinkling
   ```

3. En un Mac, permite una vez la **Grabación de pantalla** para Blinkling: Ajustes del Sistema, Privacidad y seguridad.

> [!NOTE]
> En Windows PowerShell 5, usa `;` en lugar de `&&`. Pasos animados para tu equipo: [guía de instalación](https://arthur031221.github.io/Blinkling/install/). Otras formas de instalar, actualizaciones y el sandbox de Linux: [docs/INSTALL.md](docs/INSTALL.md).

## Mientras lees

- **Capturar pantalla** o **Elegir área**. Mantén Shift y arrastra en una página compatible o en la burbuja. Enter confirma y Esc cancela. La burbuja se aparta durante la captura compartida y vuelve después.
- **Guiar esta página** ofrece una vista general y un recorrido con Siguiente/Anterior por zonas de lectura y controles.
- Selecciona texto para preguntar, explicar o traducir. Traduce una página y restaura el original, o abre un PDF en el lector integrado.
- **Explicar automáticamente** propone hasta tres preguntas y resume cambios. Alt+P pausa. Elige Opus, Sonnet o Haiku para el chat.

![arXiv: seleccionar un resumen, preguntar sobre él y traducirlo al chino tradicional.](assets/arxiv.gif)

_arXiv: seleccionar un resumen, preguntar sobre él y traducirlo al chino tradicional._

Grabado con la extensión real en sitios en vivo y respuestas de Claude Code. Se acortan las esperas. El contenido y las respuestas no están preparados.

## Atajos

| Atajo        | Acción                         |
| ------------ | ------------------------------ |
| Alt+Shift+G  | Abrir la burbuja               |
| Ctrl+Shift+S | Recortar en el navegador       |
| Ctrl+Shift+7 | Recortar desde otra aplicación |

En macOS, usa Cmd en lugar de Ctrl. Configura los atajos en `chrome://extensions/shortcuts`. Shift solo funciona en páginas compatibles y en la burbuja.

## Sesiones y privacidad

Blinkling usa un canal activo verificado de Claude Code. Si no existe, continúa la última conversación guardada del proyecto en otro proceso. Evita usar ese mismo historial a la vez en el terminal. [Canal y límites](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> Explicar automáticamente resume cambios **sin compartir la pantalla** tras el consentimiento y el acceso al sitio. Los campos de contraseña y la lista de bloqueo pausan resúmenes y sugerencias automáticos. Los resúmenes de pantalla usan una pestaña del navegador vinculada a la misma pestaña inspeccionada y las mismas comprobaciones. Un monitor o una aplicación compartidos necesitan **consentimiento separado para cada sesión de uso compartido**. Sus píxeles no permiten comprobar contraseñas ni sitios bloqueados. Las fuentes desconocidas siguen en pausa.
> Las páginas incrustadas que están cargando o no son accesibles también pausan las solicitudes automáticas.

Sin telemetría ni servicio de respuestas del editor. El contexto y las capturas elegidos van a tu backend. Se aplican sus condiciones y costes. Las aplicaciones nativas solo aportan píxeles. Ajustes del navegador, tiendas de extensiones y páginas protegidas bloquean las herramientas. La opacidad y el paso de clics de la ventana nativa dependen del navegador. [Privacidad](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas de versión](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

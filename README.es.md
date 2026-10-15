<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink vive en la esquina de tu pantalla. Mantén Ctrl, haz clic en lo que sea y recibe la respuesta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. ¿Vienes del plugin anterior? Ejecuta `/plugin uninstall glimpselet@glimpselet` y `/plugin marketplace remove glimpselet`, y luego instala Blinkling con los pasos de abajo.

Blinkling pone a Blink, un pequeño compañero verde, en la esquina de tu pantalla, por encima de cualquier app. Mantén **Ctrl** (Control en macOS) y haz clic en lo que quieras preguntar, o arrastra para tomar una zona. Vuela hacia Blink, preguntas, y la respuesta llega en burbujas que señalan de qué hablan.

> **Seguro por diseño:** Blinkling solo mira y explica. Nunca hace clic, escribe ni controla tus apps.

Usa el Claude Code en el que ya iniciaste sesión en este equipo.

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

- **Mantén Ctrl y haz clic** en un párrafo, botón o imagen de tu pantalla: Blink lo toma y le pregunta a Claude Code. **Mantén Ctrl y arrastra** para tomar un área.
- Se abre un pequeño cuadro con tres preguntas rápidas. Enter envía la resaltada. Haz clic en Blink cuando quieras para retomar la conversación.
- Las respuestas llegan en burbujas que señalan aquello de lo que hablan. El menú de Blink tiene captura, guía, Explicar automáticamente (desactivado hasta que la actives) y ajustes.
- El ayudante opcional para Chrome o Edge aporta la estructura propia de la página, de modo que Blink sabe qué párrafo o botón señalaste, además de captura de página completa, traducción de la página en su sitio y un lector de PDF. Su botón de la barra muestra si está conectado y despierta a Blink. Sin él, Blink sigue funcionando en todas las ventanas.

## Atajos

| Atajo            | Acción                                   |
| ---------------- | ---------------------------------------- |
| Ctrl + clic      | Preguntar por lo que hay bajo el puntero |
| Ctrl + arrastrar | Tomar un área                            |
| Atajo en Ajustes | Abrir la superposición de captura        |

Elige las teclas en Ajustes.

## Sesiones y privacidad

Blink envía lo que elegiste a tu propio Claude Code con sesión iniciada y muestra la respuesta junto a aquello de lo que trata. Evita usar la misma conversación en una terminal al mismo tiempo.

> [!IMPORTANT]
> El ayudante del navegador solo lee una página cuando la señalas. Nunca lee campos de contraseña ni de pago, y solo se comunica con Blinkling en tu propio equipo. Explicar automáticamente está desactivado hasta que lo actives.

Sin telemetría ni servicio de respuestas operado por el editor. Lo que eliges va a tu Claude Code; se aplican las condiciones y los costes de uso del proveedor. Los ajustes del navegador, las tiendas de extensiones y el visor de PDF del propio navegador son páginas protegidas: allí Blink responde a partir de la pantalla. [Privacidad](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas de versión](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink vive en la esquina de tu pantalla. Mantén Ctrl, haz clic en lo que sea y recibe la respuesta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. ¿Vienes del plugin anterior? Ejecuta `/plugin uninstall glimpselet@glimpselet` y `/plugin marketplace remove glimpselet`, y luego instala Blinkling con los pasos de abajo.

Blinkling pone a Blink, un pequeño compañero verde, en la esquina de tu pantalla, por encima de cualquier app. Mantén **Ctrl** (Control en macOS) y haz clic en lo que quieras preguntar, o arrastra para tomar una zona. Vuela hacia Blink, preguntas, y la respuesta se abre en una tarjeta de chat junto a Blink.

> **Seguro por diseño:** Blinkling solo mira y explica. Nunca hace clic, escribe ni controla tus apps.

Usa el Claude Code en el que ya iniciaste sesión en este equipo.

<p align="center">
<img src="assets/pick.webp" alt="Ctrl y clic en un párrafo de una página de arXiv. Su captura vuela a la boca de Blink, se abre la tarjeta de chat y la respuesta llega poco a poco."><br>
Artículo: Ctrl y clic en un párrafo, y lee la respuesta.
</p>

<p align="center">
<img src="assets/translate.webp" alt="En una página de Wikipedia en árabe, un pasaje elegido entra en Blink, se pulsa Traducir y la respuesta explica el pasaje en inglés."><br>
Traducir: un pasaje en árabe, explicado en inglés.
</p>

<p align="center">
<img src="assets/tour.webp" alt="En una página pública muy densa, la guía marca las partes de la página. Blink sostiene un puntero sobre el paso actual y Siguiente avanza por los pasos."><br>
Guía: una página difícil, paso a paso.
</p>

## Instalación

Necesitas Claude Code con la sesión iniciada. En Windows también necesitas Node.js 22 o posterior desde nodejs.org, instalado antes del paso 1. macOS y Linux no necesitan nada más. Después:

1. Pega esta línea en una terminal y pulsa Intro:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. En una terminal, inicia Claude Code con el canal de Blink:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   La opción permite que el chat de Blink llegue a esta sesión. Claude Code pide confirmarla una vez. Sin ella, Blink funciona igual y responde desde su propia sesión.

   Después, en esa sesión, ejecuta:

   ```text
   /blinkling:blinkling
   ```

3. En un Mac, permite una vez la **Grabación de pantalla** para Blinkling: Ajustes del Sistema, Privacidad y seguridad. macOS también pide **Accesibilidad** una vez, para que la tecla Ctrl pueda iniciar una selección. Permítela en el mismo sitio.

En macOS y Linux no necesitas instalar Node.js. Si el equipo no lo tiene, Blinkling descarga una copia propia de Node.js (unos 45 MB, comprobada con un SHA-256 fijo) la primera vez que se inicia. Si en ese primer inicio Claude Code dice que Blinkling no pudo conectarse, espera un minuto y ejecuta `/mcp` para reconectar. En Windows, instala antes Node.js 22 o posterior desde nodejs.org. Blinkling no descarga uno allí.

> [!NOTE]
> En Windows PowerShell 5, usa `;` en lugar de `&&`. Pasos animados para tu equipo: [guía de instalación](https://arthur031221.github.io/Blinkling/install/). Otras formas de instalar, actualizaciones y el sandbox de Linux: [docs/INSTALL.md](docs/INSTALL.md).

## Mientras lees

- **Mantén Ctrl y haz clic** en un párrafo, botón o imagen. Blink lo toma.
- **Mantén Ctrl y arrastra** para tomar un área.
- La tarjeta de chat se abre junto a Blink con lo que tomaste, tres preguntas rápidas y las listas de modelo, esfuerzo y permiso. Enter envía la resaltada.
- Haz clic en Blink cuando quieras para hablar. La tarjeta de chat se abre junto a Blink con tu conversación.

![Haz clic en Blink, escribe una pregunta y la respuesta llega a la tarjeta de chat.](assets/ask.webp)

- El menú de Blink tiene captura, guía, Explicar automáticamente (desactivado hasta que la actives) y ajustes.
- El ayudante opcional para Chrome o Edge aporta la estructura propia de la página, de modo que Blink sabe qué párrafo o botón señalaste, además de captura de página completa, traducción de la página en su sitio y un lector de PDF. Su botón de la barra muestra si está conectado y despierta a Blink. Sin él, Blink sigue funcionando en todas las ventanas.

## Atajos

| Atajo                  | Acción                                             |
| ---------------------- | -------------------------------------------------- |
| Ctrl + clic            | Preguntar por lo que hay bajo el puntero           |
| Ctrl + arrastrar       | Tomar un área                                      |
| Atajo en Ajustes       | Abrir la superposición de captura                  |
| Ctrl + Alt + Shift + B | Cerrar Blink (en Mac, Ctrl + Option + Comando + B) |

Elige las teclas en Ajustes.

## Sesiones y privacidad

Blink envía lo que elegiste a tu propio Claude Code con sesión iniciada y muestra la respuesta en la tarjeta de chat junto a Blink. Un mensaje y una respuesta terminada de la sesión de terminal que inició Blink aparecen solos en el chat de Blink. La otra dirección, el chat de Blink en el terminal, usa los channels experimentales de Claude Code, que solo se cargan al iniciar: inicia Claude Code con `claude --dangerously-load-development-channels plugin:blinkling@blinkling` (`/blinkling:blinkling` lo muestra) y ambos sitios lo muestran todo. Sin eso, Blink responde desde su propia sesión.

> [!IMPORTANT]
> El ayudante del navegador solo lee una página cuando la señalas. Nunca lee campos de contraseña ni de pago, y solo se comunica con Blinkling en tu propio equipo. Explicar automáticamente está desactivado hasta que lo actives.

Sin telemetría ni servicio de respuestas operado por el editor. Lo que eliges va a tu Claude Code; se aplican las condiciones y los costes de uso del proveedor. Los ajustes del navegador, las tiendas de extensiones y el visor de PDF del propio navegador son páginas protegidas: allí Blink responde a partir de la pantalla. [Privacidad](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas de versión](docs/releases/v3.2.6.md)

Assisted by Claude/Codex.

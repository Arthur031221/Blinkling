<h1 align="center"><img src="assets/blink-wave.gif" width="80" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink vive en la esquina de tu pantalla. Mantén Ctrl, haz clic en lo que sea y recibe la respuesta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Blinkling pone a Blink, un pequeño compañero verde, en la esquina de tu pantalla, por encima de todas las apps. Mantén pulsada Ctrl (Control en macOS) y haz clic en lo que quieras preguntar, o arrastra para tomar un área. Lo que elegiste vuela hacia Blink, escribes tu pregunta y la respuesta se abre en una tarjeta de chat junto a Blink.

Blinkling solo mira y explica. Nunca hace clic ni escribe en tus apps.

Usa el Claude Code en el que ya has iniciado sesión en este ordenador.

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

Necesitas Claude Code con la sesión iniciada en este ordenador. En Windows también necesitas Node.js 22 o más reciente desde nodejs.org, que Blinkling no descarga por ti. macOS y Linux no necesitan nada más.

Cuando hayas instalado cualquier cosa, cierra la terminal y abre una nueva, para que encuentre el programa nuevo.

1. Pega esta línea en una terminal y pulsa Intro:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Inicia Claude Code con el canal de Blink:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   La opción permite que el chat de Blink y esta sesión de la terminal se vean entre sí. Claude Code te pide confirmarla una vez. Sin ella Blink sigue funcionando y responde desde su propia sesión.

   Después, en esa sesión, ejecuta:

   ```text
   /blinkling:blinkling
   ```

3. En un Mac, permite a Blinkling la Grabación de pantalla una vez, en Ajustes del Sistema, Privacidad y seguridad. macOS también pide Accesibilidad una vez, para que la tecla Ctrl pueda iniciar una selección. Permítela en el mismo sitio.

Si un Mac o un equipo Linux no tiene Node.js, Blinkling descarga su propia copia privada la primera vez que arranca. Son unos 45 MB, comprobados contra un SHA-256 fijado. Si en ese primer arranque Claude Code dice que falló la conexión con Blinkling, espera un minuto y ejecuta `/mcp`.

> [!NOTE]
> En Windows PowerShell 5, ejecuta los dos comandos uno después del otro en lugar de unirlos con `&&`. Los pasos animados para tu equipo están en la [guía de instalación](https://arthur031221.github.io/Blinkling/install/). Otras formas de instalar, las actualizaciones y el sandbox de Linux están en [docs/INSTALL.md](docs/INSTALL.md).

## Mientras lees

- Mantén pulsada Ctrl y haz clic en un párrafo, un botón o una imagen, y Blink lo toma.
- Mantén pulsada Ctrl y arrastra para tomar un área.
- La tarjeta de chat se abre junto a Blink con lo que elegiste, tres preguntas rápidas y los selectores de modelo, esfuerzo y permisos. Intro envía la pregunta resaltada.
- Haz clic en Blink cuando quieras hablar. La tarjeta se abre con tu conversación.

![Haz clic en Blink, escribe una pregunta y la respuesta llega a la tarjeta de chat.](assets/ask.webp)

- El menú de Blink tiene captura, guía, Explicar automáticamente y ajustes. La Explicar automáticamente sigue desactivada hasta que la actives.
- El ayudante de navegador opcional para Chrome o Edge le da a Blink la estructura de la página, así sabe a qué párrafo o botón señalaste. También añade captura de página completa, traducción en el sitio y un lector de PDF. El botón de la barra de herramientas muestra si está conectado y despierta a Blink. Sin él, Blink funciona en cualquier ventana.

## Atajos

| Atajo                  | Acción                                             |
| ---------------------- | -------------------------------------------------- |
| Ctrl + clic            | Preguntar por lo que hay bajo el puntero           |
| Ctrl + arrastrar       | Tomar un área                                      |
| Atajo en Ajustes       | Abrir la superposición de captura                  |
| Ctrl + Alt + Shift + B | Cerrar Blink (en Mac, Ctrl + Option + Comando + B) |

Puedes cambiar las teclas en Ajustes.

## Sesiones y privacidad

Blink envía lo que elegiste a tu propio Claude Code con la sesión iniciada y muestra la respuesta en la tarjeta de chat. Lo que escribes en la sesión de terminal que inició Blink, y su respuesta, también aparecen en el chat de Blink.

La otra dirección, el chat de Blink en la terminal, usa los canales experimentales de Claude Code. Solo se cargan al arrancar Claude Code, así que arráncalo con `claude --dangerously-load-development-channels plugin:blinkling@blinkling`. `/blinkling:blinkling` imprime ese mismo comando.

> [!IMPORTANT]
> El ayudante de navegador solo lee una página cuando la señalas. Nunca lee campos de contraseña ni de pago, y solo habla con Blinkling en tu propio ordenador. La opción Explicar automáticamente sigue desactivada hasta que la actives.

Blinkling no tiene telemetría ni un servicio de respuestas propio. Lo que eliges va a tu Claude Code, y se aplican las condiciones y los costes de uso del proveedor. Los ajustes del navegador, las tiendas de extensiones y el visor de PDF del propio navegador son páginas protegidas, así que ahí Blink responde a partir de la pantalla.

[Privacidad](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas de la versión](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.

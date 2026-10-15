<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La respuesta, junto a la página.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. ¿Vienes del plugin anterior? Ejecuta `/plugin uninstall glimpselet@glimpselet` y `/plugin marketplace remove glimpselet`, y luego instala Blinkling con los pasos de abajo.

Blink es un pequeño acompañante en la esquina de tu pantalla. Mantén pulsado Ctrl y haz clic en algo para preguntarle a Claude Code por ello.

> [!TIP]
> Blink usa el Claude Code con el que ya has iniciado sesión, en el mismo equipo.

## Instalación

1. Instala el plugin en Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Despierta a Blink. La primera vez aparece una bienvenida de tres pasos:

   ```text
   /blinkling:blinkling
   ```

3. Opcional, para la estructura de la página, la captura de página completa, la traducción en el sitio y el lector de PDF: ejecuta `/blinkling:install`, activa el **modo de desarrollador** en `chrome://extensions` (o `edge://extensions`), elige **Load unpacked** y selecciona `~/Blinkling-extension`.

> [!NOTE]
> El ayudante es opcional: Blink funciona sin él. [Detalles de instalación y actualización](docs/INSTALL.md).

### Avanzado: cargar desde el código fuente

<details>
<summary>Código fuente y actualizaciones manuales</summary>

Para ejecutar el plugin desde el código fuente, necesitas Node.js 22+ y una versión reciente de Claude Code. Si la terminal ya está en la carpeta raíz de una copia local del repositorio, omite los dos primeros comandos. Ejecuta estos comandos en la terminal:

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

Ambas comprobaciones de versión deben mostrar **2.1.0**, y la lista de plugins debe mostrar `blinkling@inline` en **2.1.0**, activado para esta sesión. En la sesión de Claude Code abierta por el último comando, ejecuta `/blinkling:blinkling`. La opción `--plugin-dir` carga tu copia de trabajo solo para esa sesión. Úsala cada vez que inicies Claude Code desde el código fuente y reinicia esa sesión después de recompilar. La extensión compilada está en `dist-extension`, dentro de la copia de trabajo.

Los detalles del plugin también deben incluir las skills `blinkling` e `install` y el servidor MCP `blinkling`. La extensión empaquetada está en `bin/extension` y su versión también debe ser **2.1.0**.

El ayudante del navegador es opcional. Ejecuta `/blinkling:install` para copiar la extensión compilada a la carpeta fija `~/Blinkling-extension`. En Chrome o Edge, abre `chrome://extensions` o `edge://extensions`, activa **Developer mode**, elige **Load unpacked** y selecciona esa carpeta. El aviso de desarrollador permanece visible y debes actualizar la extensión manualmente cuando haya una versión nueva.

Tras actualizar la extensión sin empaquetar, ejecuta `/blinkling:install` otra vez para renovar la carpeta fija y pulsa Recargar en su tarjeta de la página de extensiones. Al pasar a `~/Blinkling-extension`, elimina la tarjeta antigua y carga esta carpeta una vez.

Con el plugin instalado, ejecuta estos comandos y luego `/reload-plugins` y `/blinkling:blinkling` en Claude Code. Comprueba que la lista de plugins y la tarjeta de la extensión muestren la versión **2.1.0**.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Mientras lees

- **Pregunta por lo que hay bajo el puntero.** Mantén Ctrl y haz clic en algo, o arrastra para tomar un área. Vuela hacia Blink y se abre el compositor mini. Enter lo envía.
- **Habla con Blink.** Haz clic en Blink para retomar la última conversación en el compositor mini. Un mensaje largo o Shift+Enter abre el compositor completo.
- **Respuestas en globos.** Señalan aquello de lo que hablan. Gira la rueda sobre Blink para leer los anteriores.
- **El menú.** Pasa el puntero sobre Blink para abrirlo: captura, guía, explicar automáticamente y ajustes. Una guía numera sus pasos en la página y se puede guardar como Markdown. Explicar automáticamente está desactivado por defecto, añade como máximo dos globos y nunca dibuja marcas.
- **Ayudante del navegador (opcional).** Su ventana emergente de la barra de herramientas muestra qué está conectado y tiene un botón **Wake Blink**. Permite que Blink lea la estructura de la página, capture una página completa, traduzca una página en el sitio y abra PDF en un lector.

La captura también tiene un atajo global, Ctrl+Shift+S (Cmd en macOS), que puedes cambiar en los ajustes.

## Privacidad

Blink consulta al Claude Code con el que has iniciado sesión en este equipo, y no se captura nada hasta que lo pides. Sin telemetría ni servicio de respuestas operado por el editor. El contexto elegido y las capturas van a Claude Code y a su proveedor; se aplican las condiciones y los cargos de uso del proveedor. El ayudante solo habla con el puente en `127.0.0.1` y nunca lee campos de contraseña ni valores introducidos. Explicar automáticamente sigue desactivado hasta que lo actives.

[Detalles de privacidad](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Funciones](docs/FEATURES.md) | [Notas de la versión](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

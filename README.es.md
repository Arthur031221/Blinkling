<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>La respuesta, junto a la página.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. ¿Vienes del plugin anterior? Ejecuta `/plugin uninstall glimpselet@glimpselet` y `/plugin marketplace remove glimpselet`, y luego instala Blinkling con los pasos de abajo.

Un pequeño chat flotante de Claude Code. Pregunta sobre una página, captura una zona, sigue una guía o traduce un pasaje.

> [!TIP]
> Usa tu propia cuenta de Claude Code con sesión iniciada y Chrome o Edge de escritorio. Claude Code no necesita una clave API.

![Google Flights: una guía de la página y una pregunta sobre cómo reservar un viaje de ida y vuelta.](assets/demo.gif)

_Google Flights: una guía de la página y una pregunta sobre cómo reservar un viaje de ida y vuelta._

## Instalación

1. Instala el plugin en Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Abre la guía de bienvenida:

   ```text
   /blinkling:blinkling
   ```

3. Activa el **modo de desarrollador** en `chrome://extensions` (o `edge://extensions`). Elige **Load unpacked** y la carpeta que abre **Show in Files / Finder**. La página de bienvenida se conecta automáticamente. Después haz clic en el botón de Blink de la barra de herramientas para ver que está conectado.

> [!NOTE]
> El ayudante del navegador es opcional: Blink funciona en cualquier ventana sin él. Para Chrome o Edge, ejecuta `/blinkling:install` y carga `~/Blinkling-extension` como en el paso 3. [Detalles de instalación y actualización](docs/INSTALL.md).

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

Las dos comprobaciones de versión deben mostrar `2.1.0`. La lista de plugins debe mostrar `blinkling@inline` con la versión `2.1.0` habilitado para esta sesión. El último comando abre Claude Code. Ejecuta allí `/blinkling:blinkling` para abrir la guía de bienvenida. `--plugin-dir` carga esta copia del repositorio solo para esa sesión. Usa la opción cada vez que inicies Claude Code y reinícialo después de volver a ejecutar `npm run build:plugin`. La extensión compilada está en `dist-extension`. La guía de bienvenida la copia a la carpeta estable indicada abajo.

Los detalles del plugin también deben incluir las habilidades `blinkling` e `install` y el servidor MCP `blinkling`. La extensión empaquetada está en `bin/extension` y también debe tener la versión **2.1.0**. Si Claude Code está en un equipo remoto, usa el comando SSH de la guía, descarga el ZIP de la extensión en el equipo con el navegador y carga allí la carpeta extraída.

Si el navegador y Claude Code se ejecutan en el mismo equipo, la guía de bienvenida copia la extensión compilada a la carpeta estable `~/Blinkling-extension`. En Chrome o Edge, abre `chrome://extensions` o `edge://extensions`, activa **Developer mode**, elige **Load unpacked** y selecciona esa carpeta. El aviso de desarrollador seguirá visible y tendrás que actualizar la extensión manualmente cuando haya una nueva versión.

Para actualizar una extensión descomprimida, cierra la burbuja anterior y vuelve a ejecutar `/blinkling:blinkling` para actualizar la carpeta estable. Pulsa Recargar en la tarjeta de la extensión. Si Claude Code es remoto, descarga el nuevo ZIP desde la guía, reemplaza los archivos extraídos en el equipo con el navegador y recarga la extensión. Al cambiar a `~/Blinkling-extension`, elimina la tarjeta anterior y carga esta carpeta una vez.

Para actualizar el plugin instalado, ejecuta estos comandos y después `/reload-plugins` y `/blinkling:blinkling` en Claude Code. Comprueba **2.1.0** en la lista de plugins y la tarjeta de la extensión antes de volver a abrir la burbuja.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

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

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Blinkling</h1>

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

3. Activa el **modo de desarrollador** en `chrome://extensions` (o `edge://extensions`). Elige **Load unpacked** y la carpeta que abre **Show in Files / Finder**. La página de bienvenida se conecta automáticamente. Abre la burbuja.

> [!NOTE]
> En un escritorio local, **Try without installing** abre un perfil separado de Chromium. En un host remoto, ejecuta el comando SSH mostrado en el equipo del navegador. [Instalación y actualizaciones](docs/INSTALL.md).

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

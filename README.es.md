# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

Un chat flotante para preguntarle a Claude Code sobre la página o la pantalla que estás viendo. Lee y traduce páginas web, muestra cómo encontrar controles y captura un área para consultarla.

|           Chat flotante de Glimpselet           |                 Ejemplo de guía sobre la página                  |
| :---------------------------------------------: | :--------------------------------------------------------------: |
| ![Chat flotante de Glimpselet](assets/demo.gif) | ![Ejemplo de guía sobre la página](assets/screenshots/guide.png) |

Requisitos: una versión reciente de Claude Code, iniciar sesión con tu propia suscripción y un navegador Chromium de escritorio, como Chrome o Edge.

Glimpselet inicia una conversación dedicada. También puedes continuar una sesión reciente de Claude Code en un proceso separado. Para enviar solicitudes a la sesión interactiva que ya tienes abierta en la terminal, activa la vista previa de canales. [Configuración del canal](docs/DESIGN.md#the-running-claude-code-conversation).

## Instalación

1. Añade el marketplace e instala el plugin en Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. En tu terminal, comprueba que `claude plugin list` muestre Glimpselet **2.0.0** y ejecuta `/glimpselet:glimpse` en Claude Code.

3. Sigue la guía de bienvenida para conectar el navegador. En un escritorio local, elige **Try without installing** o carga y empareja la extensión en tu navegador. Si Claude Code está en un host remoto, ejecuta el comando SSH que muestra la guía en el equipo con el navegador. Descarga allí el ZIP y carga la extensión en ese navegador. La opción sin instalación no está disponible en el host remoto. Al completar el emparejamiento, el panel de Glimpselet muestra el modo de conexión y el proyecto.

### Avanzado: cargar desde el código fuente

Para ejecutar el plugin desde el código fuente, necesitas Node.js 22+ y una versión reciente de Claude Code. Si la terminal ya está en la carpeta raíz de una copia local del repositorio, omite los dos primeros comandos. Ejecuta estos comandos en la terminal:

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD"
```

Las dos comprobaciones de versión deben mostrar `2.0.0`. La lista de plugins debe mostrar `glimpselet@inline` con la versión `2.0.0` habilitado para esta sesión. El último comando abre Claude Code; ejecuta allí `/glimpselet:glimpse` para abrir la guía de bienvenida. `--plugin-dir` carga esta copia del repositorio solo para esa sesión. Usa la opción cada vez que inicies Claude Code y reinícialo después de volver a ejecutar `npm run build:plugin`. La extensión compilada está en `dist-extension`; la guía de bienvenida la copia a la carpeta estable indicada abajo.

En tu navegador de escritorio, la extensión se guarda en la carpeta estable `~/.glimpselet/extension`. En Chrome o Edge, abre `chrome://extensions` o `edge://extensions`, activa **Developer mode**, elige **Load unpacked** y selecciona esa carpeta. El aviso de desarrollador seguirá visible y tendrás que actualizar la extensión manualmente cuando haya una nueva versión.

Para actualizar una extensión descomprimida, cierra la burbuja anterior y vuelve a ejecutar `/glimpselet:glimpse` para actualizar la carpeta estable. Pulsa Recargar en la tarjeta de la extensión. Si Claude Code es remoto, descarga el nuevo ZIP desde la guía, reemplaza los archivos extraídos en el equipo con el navegador y recarga la extensión.

## ¿Ya tienes Glimpselet instalado?

Ejecuta estos comandos en una terminal del equipo donde funciona Claude Code. Actualizar solo el catálogo no garantiza que se actualice el plugin instalado.

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

En tu sesión de Claude Code, ejecuta `/reload-plugins` (o reinicia Claude Code) y después `/glimpselet:glimpse`. La lista debe mostrar `glimpselet@glimpselet` en **2.0.0** y el comando debe abrir la guía de bienvenida y vinculación. Comprueba también **2.0.0** en `chrome://extensions` o `edge://extensions` en el equipo con el navegador. Si sigue apareciendo 1.1.1, puede que v2 aún no esté publicada en el catálogo público; la antigua página de selección de pantalla no es la bienvenida de v2. [Verificación de actualización](docs/DESIGN.md#plugin-upgrades-and-release-verification).

Para la extensión sin empaquetar, la guía copia los archivos nuevos a `~/.glimpselet/extension`. Recarga Glimpselet en `chrome://extensions` o `edge://extensions` y comprueba que sea **2.0.0**. Con SSH, descarga el ZIP nuevo desde la guía en el equipo con tu navegador, extráelo en la carpeta que cargaste antes y recarga la extensión. El host remoto no puede abrir el navegador sin instalación en tu equipo.

## Qué puedes hacer

- Recibir respuestas en streaming y hacer preguntas de seguimiento con Opus, Sonnet o Haiku.
- Capturar una pantalla compartida en la vista a pantalla completa o recortar un área con la superposición de la página. Mantén Shift y arrastra. Pulsa Enter para capturar o Esc para cancelar.
- Ver preguntas sugeridas que se actualizan al cambiar de página.
- Activar los resúmenes opcionales Passive, pausarlos con Alt+P y consultar su coste por hora.
- Ver una guía sobre los controles reales de la página. Traduce el texto en el sitio y usa Restore para recuperarlo.
- Seleccionar texto para explicarlo, traducirlo o preguntar sobre él. También puedes abrir PDF en el lector incluido y hacer preguntas.

![Guiar esta página](assets/guide.gif)

![Área seleccionada](assets/crop.gif)

| Atajo                               | Acción                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Alt+Shift+G                         | Abre Glimpselet y elige **Float** para abrir el chat flotante.                    |
| Ctrl+Shift+S (Cmd+Shift+S en macOS) | Recorta la página actual o la pantalla compartida.                                |
| Ctrl+Shift+7 (Cmd+Shift+7 en macOS) | Recorta desde cualquier aplicación. Se cambia en `chrome://extensions/shortcuts`. |
| Mantener Shift                      | Inicia un recorte en una burbuja o página de Glimpselet.                          |
| Alt+P                               | Pausa los resúmenes Passive.                                                      |

En macOS, Cmd+Shift+5 abre la herramienta de captura del sistema. Shift funciona en las páginas a las que Glimpselet tiene acceso. Una página web no puede recibir esa tecla desde otra aplicación.

**Float** es la primera acción. La extensión solicita acceso a la página cuando usas una función que lo necesita. No hace falta una clave API si usas tu propia sesión iniciada de Claude Code. El modo API directo es opcional y requiere tu propia clave API.

## Sesiones de Claude Code

Consulta [Sesiones de Claude Code](docs/DESIGN.md#the-running-claude-code-conversation) para ver el comando y la configuración de la vista previa de canales. Sin el canal, Glimpselet puede continuar una sesión seleccionada en un proceso aparte. Esto es una continuación paralela. No uses esa sesión en el terminal al mismo tiempo, ya que el acceso concurrente puede causar conflictos.

## Límites y privacidad

Glimpselet funciona en Chrome, Edge y otros navegadores Chromium de escritorio. El aviso de desarrollador seguirá visible hasta que haya distribución en una tienda, y las actualizaciones son manuales. Algunas páginas, como la configuración del navegador, las tiendas de extensiones y páginas restringidas, bloquean el acceso. El visor PDF integrado de Chrome no es accesible. Usa el lector de Glimpselet. Las aplicaciones nativas solo aportan píxeles, sin texto ni superposiciones. Shift funciona en la burbuja y en las páginas con acceso autorizado. En otra aplicación, usa el atajo global de recorte. La ventana flotante no permite atravesarla con clics.

Las preguntas sugeridas automáticamente usan el contexto de la página solo con tu consentimiento. Passive es opcional: permite que Glimpselet acceda al sitio, activa **Passive** y navega o cambia la página inspeccionada para recibir resúmenes sin compartir pantalla. Los resúmenes de páginas usan el texto y la estructura de las páginas con acceso autorizado. Con la pantalla compartida, los resúmenes de cambios en la pantalla requieren una pestaña de navegador compartida y verificada que coincida con la página inspeccionada. Si la fuente es una ventana, la pantalla completa, una aplicación nativa, desconocida o inaccesible, estos resúmenes se pausan. Las páginas con campos de contraseña y los sitios bloqueados se excluyen de los resúmenes y las preguntas sugeridas automáticos. Las preguntas y capturas manuales siguen disponibles.

[Guía de instalación](docs/INSTALL.md) | [Uso](docs/USAGE.md) | [Diseño](docs/DESIGN.md) | [Detalles de privacidad](docs/SECURITY.md)

Assisted by Claude/Codex.

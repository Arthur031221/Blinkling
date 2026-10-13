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

2. Ejecuta `/glimpselet:glimpse`.

3. Sigue la guía de bienvenida para conectar el navegador. En un escritorio local, elige **Try without installing** o carga y empareja la extensión en tu navegador. Si Claude Code está en un host remoto, ejecuta el comando SSH que muestra la guía en el equipo con el navegador. Descarga allí el ZIP y carga la extensión en ese navegador. La opción sin instalación no está disponible en el host remoto. Al completar el emparejamiento, el panel de Glimpselet muestra el modo de conexión y el proyecto.

### Avanzado: cargar desde el código fuente

En tu navegador de escritorio, la extensión se guarda en la carpeta estable `~/.glimpselet/extension`. En Chrome o Edge, abre `chrome://extensions` o `edge://extensions`, activa **Developer mode**, elige **Load unpacked** y selecciona esa carpeta. El aviso de desarrollador seguirá visible y tendrás que actualizar la extensión manualmente cuando haya una nueva versión.

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

En macOS, Cmd+Shift+5 abre la herramienta del sistema para capturas de pantalla. Shift en una página web solo funciona en páginas de Glimpselet. No puede escuchar otras aplicaciones.

**Float** es la primera acción. La extensión solicita acceso a la página cuando usas una función que lo necesita. No hace falta una clave API si usas tu propia sesión iniciada de Claude Code. El modo API directo es opcional y requiere tu propia clave API.

## Sesiones de Claude Code

Consulta [Sesiones de Claude Code](docs/DESIGN.md#the-running-claude-code-conversation) para ver el comando y la configuración de la vista previa de canales. Sin el canal, Glimpselet puede continuar una sesión seleccionada en un proceso aparte. Esto es una continuación paralela. No uses esa sesión en el terminal al mismo tiempo, ya que el acceso concurrente puede causar conflictos.

## Límites y privacidad

Glimpselet funciona en Chrome, Edge y otros navegadores Chromium de escritorio. El aviso de desarrollador seguirá visible hasta que haya distribución en una tienda, y las actualizaciones son manuales. Algunas páginas, como la configuración del navegador, las tiendas de extensiones y páginas restringidas, bloquean el acceso. El visor PDF integrado de Chrome no es accesible. Usa el lector de Glimpselet. Las aplicaciones nativas solo aportan píxeles, sin texto ni superposiciones. Shift solo funciona en las superficies del navegador propias de Glimpselet, no en otra aplicación. La ventana flotante no permite atravesarla con clics.

Las preguntas sugeridas automáticamente usan el contexto de la página solo con tu consentimiento. Los resúmenes pasivos son opcionales y requieren compartir una pestaña inspeccionada. Si la fuente compartida es una ventana, una pantalla, una aplicación nativa, desconocida o inaccesible, los resúmenes automáticos se pausan. Las preguntas y capturas manuales siguen disponibles.

[Guía de instalación](docs/INSTALL.md) | [Uso](docs/USAGE.md) | [Diseño](docs/DESIGN.md) | [Detalles de privacidad](docs/SECURITY.md)

Assisted by Claude/Codex.

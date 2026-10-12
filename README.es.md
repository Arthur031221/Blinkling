# Glimpselet

Glimpselet es un chat pequeño que permanece sobre otras ventanas y se conecta a una sesión existente de Claude Code. Puede leer y traducir páginas web accesibles, dibujar guías sobre la página real y capturar zonas de páginas o fotogramas de pantalla compartida para hacer preguntas.

![Chat flotante de Glimpselet](assets/demo.gif)

![Círculos guía dibujados sobre la página real](assets/screenshots/guide.png)

[Abrir la demostración estática](https://arthur031221.github.io/Glimpselet/). Usa una imagen de ejemplo y una respuesta grabada. No envía solicitudes a proveedores.

## Instalación

Instala el plugin de Glimpselet en Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Ejecuta `/glimpse` y sigue la guía de configuración. Esa guía es la fuente de referencia para la instalación y el emparejamiento.

### Avanzado: cargar desde el código fuente

1. Abre `chrome://extensions` en Chrome o Edge y activa el **modo de desarrollador**.
2. Pulsa **Cargar descomprimida**.
3. Selecciona la carpeta de la extensión indicada por la guía de configuración.
   > **Modo de desarrollador:** Glimpselet se distribuye actualmente en modo de desarrollador. Hasta que haya una ficha en una tienda, las actualizaciones deben instalarse manualmente.

## Capturas y atajos

Mantén pulsada la tecla Shift en la burbuja flotante o en una página accesible para iniciar un recorte. Shift no puede detectar pulsaciones en otras aplicaciones. En una página web, selecciona la zona directamente sobre la página actual. Al compartir pantalla, se congela la imagen y se abre a pantalla completa para recortarla. Pulsa Enter para confirmar o Esc para cancelar.

El atajo del navegador es Ctrl+Shift+S, o Cmd+Shift+S en Mac. Inicia el recorte desde el navegador. El atajo global independiente es Ctrl+Shift+7 de forma predeterminada, porque Chrome exige una tecla numérica para los atajos globales. Puedes cambiarlo, incluso a S, en `chrome://extensions/shortcuts`.

## Sesiones de Claude Code

La compatibilidad documentada con MCP channels permite enviar mensajes a una sesión de Claude Code que ya esté en ejecución. Glimpselet muestra las respuestas a partir de los fragmentos de la herramienta de respuesta del canal. El modelo y los permisos los controla la sesión de la terminal. Para añadir el channel personalizado de Glimpselet, reinicia la sesión con el channel de desarrollo habilitado y ejecuta `/glimpse`:

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

Sin el channel, Glimpselet puede continuar la misma sesión en un proceso separado en modo print con `claude --resume SESSION_ID -p`. Es una continuación paralela. No lo ejecutes a la vez que el proceso de terminal que usa esa sesión. El acceso simultáneo puede causar conflictos.

## Límites

- Solo Chrome, Edge y otros navegadores Chromium.
- Las páginas internas del navegador, como `chrome://`, la tienda de extensiones y algunas páginas administradas bloquean el acceso.
- Glimpselet no puede dibujar sobre aplicaciones nativas. Puedes compartir su pantalla para preguntar sobre la imagen, pero no tendrás superposiciones de página ni acciones sobre texto.
- Abre los PDF con el lector incluido de Glimpselet. El visor PDF integrado de Chrome no es una página accesible para la extensión.
- La API Document Picture-in-Picture del navegador no admite el paso de clics, así que la ventana flotante no puede transferirlos a otra aplicación. El navegador puede no garantizar la ventana flotante ni su apertura automática. Mantén abierta la página de la extensión mientras uses la ventana flotante.

## Privacidad

No se recopila telemetría. Con tu consentimiento, el texto de la página puede enviarse para crear preguntas sugeridas. Las preguntas y los resúmenes pasivos opcionales también pueden enviar texto e imágenes pertinentes. Los fotogramas permanecen en memoria y solo se envían al puente al capturar o hacer una pregunta. En modo puente, la CLI se ejecuta en el host y guarda allí las transcripciones. El modo API directa envía solicitudes desde la extensión. Las claves API y los tokens del puente permanecen en el almacenamiento de sesión del navegador. Las preferencias se guardan en el almacenamiento local. Consulta [seguridad y privacidad](docs/SECURITY.md) para ver los flujos de datos.

## Más información

[Instalación](docs/INSTALL.md) | [Uso](docs/USAGE.md) | [Diseño e integración](docs/DESIGN.md) | [Preparación para tiendas](docs/STORE.md) | [Notas de versión](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

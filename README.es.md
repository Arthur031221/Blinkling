<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, compañero de Glimpselet"><br><strong>Glimpselet</strong><br><em>Blink espera. Tú señalas. Te responde.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a>  |  <a href="README.pt-BR.md">Português (Brasil)</a></p>

> Pregunta a tu asistente de programación sobre una pantalla que elijas, desde un panel flotante compacto. Congela una imagen, recórtala, tapa los datos privados y pregunta.

<p align="center"><img src="assets/demo.gif" width="800" alt="Imagen de prueba y respuesta grabada en el panel Glimpselet"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Abrir la demo estática</a>. Muestra una imagen de prueba y una respuesta grabada. No hace llamadas a proveedores.</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="Tema claro a 420 px"><img src="assets/screenshots/dark-420.png" width="49%" alt="Tema oscuro a 420 px"></p>

<details>
<summary>Los seis tamaños y temas</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="Panel claro 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="Panel claro 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="Panel claro 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="Panel oscuro 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="Panel oscuro 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="Panel oscuro 520 px"></p>

</details>

El modo flotante requiere un navegador Chromium de escritorio. Antes de instalar, ten Node.js 22 o posterior y un asistente de programación instalado.

Instala el complemento con dos comandos de barra:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Después ejecuta `/glimpselet:glimpse`. Necesitas Node.js 22 o posterior. No hace falta una extensión del navegador.

## Uso habitual

```text
/glimpselet:glimpse
Elige una pantalla, ventana o pestaña en el selector del navegador.
Congela un fotograma, recorta una zona y tapa lo privado con máscaras opacas.
Haz una pregunta, lee la respuesta en streaming y continúa con otra.
Copia o fija la respuesta y borra la sesión local al terminar.
```

La imagen permanece en tu equipo hasta que haces una pregunta o activas las notas pasivas. Las máscaras opacas modifican la imagen enviada. Las notas pasivas muestrean cada dos segundos y solicitan una descripción breve de los fotogramas que cambian. El límite predeterminado es de seis solicitudes por minuto móvil, hasta 360 por hora. Es un límite de solicitudes, no un cálculo de coste, puedes reducirlo.

Las herramientas MCP de pantalla devuelven imágenes a la sesión de programación cuando se solicitan. Las capturas del panel se limitan a 1536 píxeles en el lado más largo y a 1,8 millones de píxeles después del recorte y las máscaras. Las áreas seleccionadas más pequeñas conservan su resolución original.

**Tú decides cuándo compartir la pantalla, nunca empieza a observar por su cuenta.**

## Detalles

<details>
<summary>Controles y estado</summary>

Cambia el tamaño con el control del panel o las flechas. También puedes arrastrar los bordes de la ventana cuando el navegador lo permita. En el modo de recorte o máscara, las flechas mueven la selección, Mayús más flechas la redimensionan, Enter la aplica y Escape cancela. Escape en el campo de pregunta pausa las notas pasivas y cancela la pregunta actual sin borrar su texto. Ajustes se abre en un cuadro modal. Puedes quitar la fijación de una respuesta anterior. **Resume live view** conserva el recorte y las máscaras. Al desplazarte hacia arriba, se detiene el seguimiento de la respuesta transmitida. El panel muestra el estado de compartir, del modelo y de las notas pasivas.

</details>

<details>
<summary>Instalar y abrir</summary>

Los dos comandos anteriores añaden e instalan el complemento integrado. `/glimpselet:glimpse` abre un panel local en un puerto aleatorio. El enlace de un solo uso caduca a los 60 segundos, la sesión en memoria dura 30 minutos. El selector del navegador te permite elegir una pantalla, una ventana de aplicación o una pestaña.

</details>

<details>
<summary>Preguntar, continuar y revisar</summary>

Las preguntas se procesan en el asistente de programación instalado o, de forma opcional, mediante una solicitud API desde el puente local. El CLI restringido elimina las herramientas de comandos habituales, pero los hooks gestionados por la empresa aún pueden ejecutarse. Por tanto, no es un aislamiento del sistema operativo. Debes confiar en el CLI instalado y en las políticas configuradas por tu organización. Las preguntas de seguimiento pueden incluir contexto reciente y acotado. El panel ofrece recorte, congelación, máscaras opacas, copiar, fijar, una línea temporal de diez minutos, resumen y exportación Markdown. El resumen usa las notas pasivas existentes y no envía una imagen nueva. **Clear** cancela los trabajos y elimina fotogramas, notas, historial y la clave API guardada en memoria.

</details>

<details>
<summary>Ventana flotante y navegadores</summary>

Document Picture-in-Picture está disponible en los navegadores Chromium de escritorio compatibles. El navegador controla la posición de esta ventana. La posición del popup se recuerda cuando el navegador lo permite. Las dimensiones compacta y expandida se recuerdan por separado.

</details>

<details>
<summary>Desarrollar desde el código fuente</summary>

Con Node.js 22 o posterior, ejecuta `npm ci`, `npm run build` y `npm run build:plugin`. Consulta las [instrucciones para contribuir](CONTRIBUTING.md) para ver todas las comprobaciones. La demo estática usa una imagen de prueba y texto grabado, no solicita una respuesta a ningún modelo.

</details>

## Límites

Mientras haya una pantalla compartida en el navegador, las capturas MCP usan esa fuente. Si se desconecta o no responde, la captura falla y no se sustituye por una captura nativa sin las máscaras. La intención de compartir sigue activa tras la desconexión hasta que detengas explícitamente la compartición, borres los datos locales con **Clear** o venza la sesión. Hasta entonces no se usa la captura nativa. Cuando termina esa intención, la captura nativa depende de las herramientas de cada plataforma y de los permisos del sistema. macOS admite pantalla, ventana y región. Windows admite pantalla. En Linux depende de las herramientas de Wayland o X11. No se garantiza que una ventana emergente quede siempre encima. No se pueden detectar con fiabilidad contraseñas, posiciones del cursor ni títulos de ventana. Revisa cada imagen antes de enviarla.

La herramienta MCP independiente `screen_watch_start` toma muestras en serie cada 5 a 60 segundos, conserva solo fotogramas modificados y no llama a ningún modelo. Es distinta de las notas pasivas del panel, que muestrean cada dos segundos y generan descripciones.

[Uso](docs/USAGE.md) | [Instalación](docs/INSTALL.md) | [Configuración](docs/CONFIGURATION.md) | [Arquitectura](docs/ARCHITECTURE.md) | [Seguridad](docs/SECURITY.md) | [Estructura del complemento](docs/PLUGIN.md) | [Contribuir](CONTRIBUTING.md) | [Licencia MIT](LICENSE)

## Disclosure

Assisted by Claude/Codex.

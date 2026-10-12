<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, companheiro do Glimpselet"><br><strong>Glimpselet</strong><br><em>Blink espera. Você aponta. Ele responde.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a></p>

> Pergunte ao seu assistente de programação sobre uma tela escolhida, em um painel flutuante compacto. Congele um quadro, recorte, cubra detalhes privados e pergunte.

<p align="center"><img src="assets/demo.gif" width="800" alt="Imagem de teste e resposta gravada no painel Glimpselet"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Abrir a demonstração estática</a>. Ela mostra uma imagem de teste e uma resposta gravada. Não faz chamadas a provedores.</p>

<p align="center"><img src="assets/screenshots/light-420.png" width="49%" alt="Tema claro em 420 px"><img src="assets/screenshots/dark-420.png" width="49%" alt="Tema escuro em 420 px"></p>

<details>
<summary>Os seis tamanhos e temas</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="Painel claro 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="Painel claro 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="Painel claro 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="Painel escuro 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="Painel escuro 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="Painel escuro 520 px"></p>

</details>

O modo flutuante requer um navegador Chromium para desktop. Antes de instalar, tenha Node.js 22 ou mais recente e um assistente de programação instalado.

Instale o plugin com dois comandos de barra:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Depois execute `/glimpselet:glimpse`. É necessário Node.js 22 ou mais recente. Não há extensão de navegador.

## No dia a dia

```text
/glimpselet:glimpse
Escolha uma tela, janela ou aba no seletor do navegador.
Congele um quadro, recorte uma região e cubra detalhes privados com máscaras opacas.
Faça uma pergunta, leia a resposta em streaming e continue com outra.
Copie ou fixe a resposta e limpe a sessão local quando terminar.
```

A imagem fica no seu computador até você fazer uma pergunta ou ativar as notas passivas. Máscaras opacas alteram a imagem enviada. As notas passivas coletam uma amostra a cada dois segundos e pedem uma descrição curta quando a imagem muda. O padrão é de até seis solicitações por minuto móvel, no máximo 360 por hora. Esse é um limite de solicitações, não uma estimativa de custo. É possível escolher um limite menor.

As ferramentas MCP de tela retornam imagens à sessão de programação quando solicitadas. As capturas do painel são limitadas a 1536 pixels no lado mais longo e a 1,8 milhão de pixels após o recorte e as máscaras. Áreas selecionadas menores mantêm a resolução original.

**Você decide quando compartilhar, nada começa a observar por conta própria.**

## Detalhes

<details>
<summary>Controles e status</summary>

Redimensione pelo controle do painel ou pelas setas. Você também pode arrastar as bordas da janela quando o navegador permitir. No modo de recorte ou máscara, as setas movem a seleção, Shift mais as setas redimensionam, Enter aplica e Escape cancela. Escape no campo de pergunta pausa as notas passivas e cancela a pergunta atual sem apagar o texto. Configurações abre em uma janela modal. É possível desafixar uma resposta antiga. **Resume live view** mantém o recorte e as máscaras. Ao rolar para cima, o acompanhamento da resposta em streaming para. O painel mostra o estado do compartilhamento, do modelo e das notas passivas.

</details>

<details>
<summary>Instalar e abrir</summary>

Os dois comandos acima adicionam e instalam o plugin integrado. `/glimpselet:glimpse` abre um painel local em uma porta aleatória. O link de uso único expira em 60 segundos, a sessão em memória dura 30 minutos. Escolha uma tela, janela de aplicativo ou aba no seletor do navegador.

</details>

<details>
<summary>Perguntar, continuar e revisar</summary>

As perguntas passam pelo assistente de programação instalado ou, opcionalmente, por uma solicitação de API feita pela ponte local. O CLI restrito remove as ferramentas de comando comuns, mas hooks gerenciados pela empresa ainda podem ser executados. Portanto, ele não é um sandbox no nível do sistema operacional. É preciso confiar no CLI instalado e nos hooks de política configurados pela organização. Perguntas seguintes podem incluir contexto recente limitado. O painel oferece recorte, congelamento, máscaras opacas, cópia, fixação, linha do tempo dos últimos dez minutos, resumo e exportação Markdown. O resumo usa as notas passivas existentes e não envia uma nova imagem. **Clear** cancela trabalhos ativos e remove quadros locais, notas, histórico e a chave de API da memória.

</details>

<details>
<summary>Janela flutuante e navegadores</summary>

Document Picture-in-Picture está disponível em navegadores Chromium compatíveis para desktop. O navegador controla a posição dessa janela. A posição do pop-up é lembrada quando o navegador permite. As dimensões compacta e expandida são lembradas separadamente.

</details>

<details>
<summary>Desenvolver a partir do código-fonte</summary>

Com Node.js 22 ou mais recente, execute `npm ci`, `npm run build` e `npm run build:plugin`. Consulte o [guia de contribuição](CONTRIBUTING.md) para todas as verificações. A demonstração estática usa uma imagem de teste e texto gravado, não solicita resposta a modelo.

</details>

## Limites

Com um compartilhamento ativo no navegador, as capturas MCP usam essa fonte. Se ela desconectar ou não responder, a captura falha e não é substituída por uma captura nativa sem máscaras. Após a desconexão, a intenção de compartilhar continua ativa até que você pare explicitamente o compartilhamento, limpe os dados locais com **Clear** ou a sessão expire. Até lá, a captura nativa não será usada. Quando essa intenção terminar, a captura nativa dependerá das ferramentas da plataforma e das permissões do sistema. O macOS aceita tela, janela e região. O Windows aceita tela. No Linux, depende das ferramentas de Wayland ou X11. Não há garantia de que uma janela pop-up fique sempre no topo. Não é possível detectar com confiança senhas, posições do cursor ou títulos de janelas. Confira cada imagem antes de enviá-la.

A ferramenta MCP separada `screen_watch_start` captura em série a cada 5 a 60 segundos, mantém somente quadros alterados e não chama modelos. Ela é diferente das notas passivas do painel, que coletam amostras a cada dois segundos e geram descrições.

[Uso](docs/USAGE.md) | [Instalação](docs/INSTALL.md) | [Configuração](docs/CONFIGURATION.md) | [Arquitetura](docs/ARCHITECTURE.md) | [Segurança](docs/SECURITY.md) | [Estrutura do plugin](docs/PLUGIN.md) | [Contribuição](CONTRIBUTING.md) | [Licença MIT](LICENSE)

## Disclosure

Assisted by Claude/Codex.

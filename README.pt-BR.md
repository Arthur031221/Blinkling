<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, companheiro do Glimpselet"><br><strong>Glimpselet</strong><br><em>Blink espera. Você aponta. Ele responde.</em></p>

<p align="center"><a href="README.md">English</a>  |  <a href="README.zh-TW.md">繁體中文</a>  |  <a href="README.zh-CN.md">简体中文</a>  |  <a href="README.ja.md">日本語</a>  |  <a href="README.ko.md">한국어</a>  |  <a href="README.es.md">Español</a>  |  <a href="README.fr.md">Français</a>  |  <a href="README.de.md">Deutsch</a></p>

> Pergunte ao seu assistente de programação sobre a tela compartilhada, em uma pequena janela flutuante.

Resultado nos fixtures: 20/20 tarefas sintéticas de leitura de tela passaram. O autor conferiu cada resposta. Execução real do plugin integrado com CLI Haiku. Mediana: 2,609 s, p95: 3,263 s. [Resultados e método](assets/benchmark.json).

| Antes                      | Depois                                                |
| -------------------------- | ----------------------------------------------------- |
| Uma tela cheia de detalhes | Congele um quadro, recorte ou oculte áreas e pergunte |

Instale o plugin com dois comandos de barra:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Depois execute `/glimpselet:glimpse`. É necessário Node.js 22 ou mais recente. Não há extensão de navegador.

<p align="center"><img src="assets/demo.gif" width="800" alt="Demonstração com imagem de teste identificada e resposta gravada, nenhum modelo é chamado"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Abrir a demonstração estática</a>  |  amostra gravada, sem solicitações a provedores</p>

## No dia a dia

```text
/glimpselet:glimpse
Escolha uma tela, janela ou aba no seletor do navegador.
Congele um quadro, recorte uma região e cubra detalhes privados com máscaras opacas.
Faça uma pergunta, leia a resposta em streaming e continue com outra.
Copie ou fixe a resposta e limpe a sessão local quando terminar.
```

A imagem fica no seu computador até você fazer uma pergunta ou ativar as notas passivas. Máscaras opacas alteram a imagem enviada. As notas passivas coletam uma amostra a cada dois segundos e pedem uma descrição curta quando a imagem muda. O padrão é de até seis solicitações por minuto móvel, no máximo 360 por hora. Esse é um limite de solicitações, não uma estimativa de custo. É possível escolher um limite menor.

**Você decide quando compartilhar, nada começa a observar por conta própria.**

## Detalhes

<details>
<summary>Instalar e abrir</summary>

Os dois comandos acima adicionam e instalam o plugin integrado. `/glimpselet:glimpse` abre um painel local em uma porta aleatória. O link de uso único expira em 60 segundos, a sessão em memória dura 30 minutos. Escolha uma tela, janela de aplicativo ou aba no seletor do navegador.

</details>

<details>
<summary>Perguntar, continuar e revisar</summary>

Escolha o alias de modelo `sonnet`, `opus` ou `haiku`. As perguntas passam pelo CLI instalado e restrito ou por uma solicitação opcional de API feita pela ponte local. O CLI restrito remove as ferramentas de comando comuns, mas hooks gerenciados pela empresa ainda podem ser executados. Portanto, ele não é um sandbox no nível do sistema operacional. É preciso confiar no CLI instalado e nos hooks de política configurados pela organização. Perguntas seguintes podem incluir contexto recente limitado. O painel oferece recorte, congelamento, máscaras opacas, cópia, fixação, linha do tempo dos últimos dez minutos, resumo e exportação Markdown. O resumo usa as notas passivas existentes e não envia uma nova imagem. **Clear** cancela trabalhos ativos e remove quadros locais, notas, histórico e a chave de API da memória.

</details>

<details>
<summary>Janela flutuante e navegadores</summary>

É preciso uma ação do usuário para abrir o painel flutuante. Chrome e Edge 116 ou mais recentes podem usar Document Picture-in-Picture quando disponível. Se a solicitação for rejeitada, faça um segundo gesto e clique em **Open popup** para abrir uma janela pop-up comum, que talvez não fique acima das demais. O navegador controla a posição e pode reutilizar a posição anterior. Esta aba memoriza a opção compacta ou expandida. Permissões e opções de captura variam conforme o navegador e o sistema operacional.

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

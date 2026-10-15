<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>O Blink mora no canto da sua tela. Segure Ctrl, clique em qualquer coisa e receba a resposta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vindo do plugin antigo? Execute `/plugin uninstall glimpselet@glimpselet` e `/plugin marketplace remove glimpselet` e depois instale o Blinkling pelos passos abaixo.

O Blinkling coloca o Blink, um pequeno companheiro verde, no canto da sua tela, acima de todos os apps. Segure **Ctrl** (Control no macOS) e clique no que quiser perguntar, ou arraste para pegar uma área. Ele voa para o Blink, você pergunta, e a resposta volta em balões que apontam para o que estão explicando.

> **Seguro por design:** O Blinkling só olha e explica. Nunca clica, digita nem controla seus apps.

Usa o Claude Code em que você já está conectado neste computador.

## Instalação

1. Instale o plugin no Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Abra o guia de boas-vindas:

   ```text
   /blinkling:blinkling
   ```

3. Ative o **modo de desenvolvedor** em `chrome://extensions` (ou `edge://extensions`). Escolha **Load unpacked** e a pasta aberta por **Show in Files / Finder**. A página de boas-vindas conecta automaticamente. Abra a bolha.

> [!NOTE]
> No desktop local, **Try without installing** abre um perfil separado do Chromium. Em um host remoto, execute o comando SSH exibido no computador do navegador. [Instalação e atualizações](docs/INSTALL.md).

### Avançado: carregar do código-fonte

<details>
<summary>Código-fonte e atualizações manuais</summary>

Para executar o plugin a partir do código-fonte, você precisa de Node.js 22+ e uma versão recente do Claude Code. Se o terminal já estiver na pasta raiz de uma cópia local do repositório, pule os dois primeiros comandos. Execute estes comandos no terminal:

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

As duas verificações de versão devem mostrar `2.1.0`. A lista de plugins deve mostrar `blinkling@inline` na versão `2.1.0`, ativado para esta sessão. O último comando abre o Claude Code. Execute `/blinkling:blinkling` nessa sessão para abrir o guia de boas-vindas. `--plugin-dir` carrega esta cópia do repositório apenas para essa sessão. Use a opção a cada inicialização e reinicie o Claude Code depois de executar `npm run build:plugin` novamente. A extensão compilada fica em `dist-extension`. O guia de boas-vindas a copia para a pasta estável indicada abaixo.

Os detalhes do plugin também devem incluir as habilidades `blinkling` e `install` e o servidor MCP `blinkling`. A extensão empacotada fica em `bin/extension` e também deve estar na versão **2.1.0**. Se o Claude Code estiver em um host remoto, use o comando SSH do guia, baixe o ZIP da extensão no computador com o navegador e carregue a pasta extraída ali.

Se o navegador e o Claude Code rodam no mesmo computador, o guia de boas-vindas copia a extensão compilada para a pasta estável `~/Blinkling-extension`. No Chrome ou Edge, abra `chrome://extensions` ou `edge://extensions`, ative **Developer mode**, escolha **Load unpacked** e selecione essa pasta. O aviso de desenvolvedor continuará visível. As atualizações precisam ser feitas manualmente.

Para atualizar uma extensão descompactada, feche a bolha antiga e execute `/blinkling:blinkling` novamente para atualizar a pasta estável. Clique em Recarregar no cartão da extensão. Se o Claude Code for remoto, baixe o novo ZIP pelo guia, substitua os arquivos extraídos no computador com o navegador e recarregue a extensão. Ao mudar para `~/Blinkling-extension`, remova o cartão anterior e carregue esta pasta uma vez.

Para atualizar o plugin instalado, execute estes comandos e depois `/reload-plugins` e `/blinkling:blinkling` no Claude Code. Confira **2.1.0** na lista de plugins e no cartão da extensão antes de reabrir a bolha.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Enquanto você lê

- **Capturar tela inteira** ou **Escolher área**. Segure Shift e arraste em uma página compatível ou na bolha. Enter confirma e Esc cancela. A bolha sai do caminho durante a captura compartilhada e volta depois.
- **Guiar esta página** oferece uma visão geral e um percurso Próximo/Voltar por áreas de leitura e controles.
- Selecione texto para perguntar, explicar ou traduzir. Traduza uma página e restaure o original, ou abra um PDF no leitor integrado.
- **Explicação automática** sugere até três perguntas e resume mudanças. Alt+P pausa. Escolha Opus, Sonnet ou Haiku para o chat.

![arXiv: selecionar um resumo, perguntar sobre ele e traduzir para chinês tradicional.](assets/arxiv.gif)

_arXiv: selecionar um resumo, perguntar sobre ele e traduzir para chinês tradicional._

Gravado com a extensão real em sites ao vivo e respostas do Claude Code. As esperas foram encurtadas. Conteúdo e respostas não foram preparados.

## Atalhos

| Atalho       | Ação                         |
| ------------ | ---------------------------- |
| Alt+Shift+G  | Abrir a bolha                |
| Ctrl+Shift+S | Recortar no navegador        |
| Ctrl+Shift+7 | Recortar de outro aplicativo |

No macOS, use Cmd em vez de Ctrl. Remapeie em `chrome://extensions/shortcuts`. Shift funciona apenas em páginas compatíveis e na bolha.

## Sessões e privacidade

O Blinkling usa um canal ativo verificado do Claude Code. Caso contrário, continua a última conversa salva do projeto em outro processo. Evite usar o mesmo histórico simultaneamente no terminal. [Canal e limites](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> Explicação automática resume mudanças **sem compartilhar a tela** após consentimento e acesso ao site. Campos de senha e a lista de bloqueio pausam resumos e sugestões automáticos. Resumos de tela usam uma guia compartilhada vinculada à mesma guia inspecionada, com as mesmas verificações. Um monitor ou aplicativo compartilhado precisa de **consentimento separado para cada compartilhamento**. Seus pixels não permitem verificar senhas ou sites bloqueados. Fontes desconhecidas continuam pausadas.
> Páginas incorporadas carregando ou inacessíveis também pausam solicitações automáticas.

Sem telemetria nem serviço de respostas do editor. Contexto e capturas escolhidos vão ao seu backend. Os termos e custos dele se aplicam. Aplicativos nativos fornecem apenas pixels. Configurações, lojas de extensões e páginas protegidas bloqueiam ferramentas. Opacidade e passagem de cliques da janela nativa dependem do navegador. [Privacidade](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas da versão](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

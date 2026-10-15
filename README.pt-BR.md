<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>O Blink mora no canto da sua tela. Segure Ctrl, clique em qualquer coisa e receba a resposta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vindo do plugin antigo? Execute `/plugin uninstall glimpselet@glimpselet` e `/plugin marketplace remove glimpselet` e depois instale o Blinkling pelos passos abaixo.

O Blinkling coloca o Blink, um pequeno companheiro verde, no canto da sua tela, acima de todos os apps. Segure **Ctrl** (Control no macOS) e clique no que quiser perguntar, ou arraste para pegar uma área. Ele voa para o Blink, você pergunta, e a resposta volta em balões que apontam para o que estão explicando.

> **Seguro por design:** O Blinkling só olha e explica. Nunca clica, digita nem controla seus apps.

Usa o Claude Code em que você já está conectado neste computador.

## Instalação

Você precisa do Claude Code com a sessão iniciada. Depois:

1. Cole esta linha em um terminal e pressione Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. No Claude Code, execute:

   ```text
   /blinkling:blinkling
   ```

3. No Mac, permita uma vez a **Gravação de Tela** para o Blinkling: Ajustes do Sistema, Privacidade e Segurança.

> [!NOTE]
> No Windows PowerShell 5, use `;` em vez de `&&`. Passos animados para o seu computador: [guia de instalação](https://arthur031221.github.io/Blinkling/install/). Outras formas de instalar, atualizações e o sandbox do Linux: [docs/INSTALL.md](docs/INSTALL.md).

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

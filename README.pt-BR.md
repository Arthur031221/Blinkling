<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>A resposta fica ao lado da página.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vindo do plugin antigo? Execute `/plugin uninstall glimpselet@glimpselet` e `/plugin marketplace remove glimpselet` e depois instale o Blinkling pelos passos abaixo.

Um pequeno chat flutuante do Claude Code. Pergunte sobre a página, capture uma área, siga um guia ou traduza um trecho.

> [!TIP]
> Use sua própria conta conectada do Claude Code e Chrome ou Edge no desktop. O Claude Code não precisa de chave de API.

![Google Flights: um guia da página e uma pergunta sobre reservar uma viagem de ida e volta.](assets/demo.gif)

_Google Flights: um guia da página e uma pergunta sobre reservar uma viagem de ida e volta._

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

3. Ative o **modo de desenvolvedor** em `chrome://extensions` (ou `edge://extensions`). Escolha **Load unpacked** e a pasta aberta por **Show in Files / Finder**. A página de boas-vindas conecta automaticamente. Depois clique no botão do Blink na barra de ferramentas para ver que está conectado.

> [!NOTE]
> O assistente do navegador é opcional: o Blink funciona em qualquer janela sem ele. No Chrome ou no Edge, execute `/blinkling:install` e carregue `~/Blinkling-extension` como no passo 3. [Detalhes de instalação e atualização](docs/INSTALL.md).

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

- **Segure Ctrl e clique** em um parágrafo, botão ou imagem da tela: o Blink o pega e pergunta ao Claude Code. **Segure Ctrl e arraste** para pegar uma área.
- Um pequeno campo se abre com três perguntas rápidas. Enter envia a destacada. Clique no Blink quando quiser para retomar a conversa.
- As respostas chegam em balões que apontam para o assunto delas. O menu do Blink tem captura, guia, Explicação automática (desligada até você ligar) e configurações.
- O assistente opcional para Chrome ou Edge traz a estrutura da própria página, para o Blink saber qual parágrafo ou botão você apontou, além de captura da página inteira, tradução da página no lugar e um leitor de PDF. O botão da barra de ferramentas mostra se ele está conectado e acorda o Blink. Sem ele, o Blink continua funcionando em todas as janelas.

## Atalhos

| Atalho                   | Ação                                      |
| ------------------------ | ----------------------------------------- |
| Ctrl + clique            | Perguntar sobre o que está sob o ponteiro |
| Ctrl + arrastar          | Pegar uma área                            |
| Atalho nas Configurações | Abrir a sobreposição de captura           |

Escolha as teclas nas Configurações.

## Sessões e privacidade

O Blink envia o que você escolheu ao seu próprio Claude Code com sessão iniciada e mostra a resposta ao lado do assunto. Evite usar a mesma conversa em um terminal ao mesmo tempo.

> [!IMPORTANT]
> O assistente do navegador só lê uma página quando você a aponta. Ele nunca lê campos de senha ou de pagamento e só se comunica com o Blinkling no seu próprio computador. Explicação automática fica desligada até você ligar.

Sem telemetria nem serviço de respostas operado pelo editor. O que você escolhe vai para o seu Claude Code; valem os termos e os custos de uso do provedor. As configurações do navegador, as lojas de extensões e o visualizador de PDF do próprio navegador são páginas protegidas: ali o Blink responde a partir da tela. [Privacidade](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas da versão](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>A resposta fica ao lado da página.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vindo do plugin antigo? Execute `/plugin uninstall glimpselet@glimpselet` e `/plugin marketplace remove glimpselet` e depois instale o Blinkling pelos passos abaixo.

O Blink é um pequeno companheiro no canto da sua tela. Segure Ctrl e clique em algo para perguntar sobre isso ao Claude Code.

> [!TIP]
> O Blink usa o Claude Code em que você já está conectado, no mesmo computador.

## Instalação

1. Instale o plugin no Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Acorde o Blink. Na primeira vez aparece uma boas-vindas em três passos:

   ```text
   /blinkling:blinkling
   ```

3. Opcional, para estrutura da página, captura de página inteira, tradução no lugar e leitor de PDF: execute `/blinkling:install`, ative o **modo de desenvolvedor** em `chrome://extensions` (ou `edge://extensions`), escolha **Load unpacked** e selecione `~/Blinkling-extension`.

> [!NOTE]
> O auxiliar é opcional: o Blink funciona sem ele. [Detalhes de instalação e atualização](docs/INSTALL.md).

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

As duas verificações de versão devem exibir **2.1.0**, e a lista de plugins deve mostrar `blinkling@inline` em **2.1.0**, ativado para esta sessão. Na sessão do Claude Code aberta pelo último comando, execute `/blinkling:blinkling`. A opção `--plugin-dir` carrega seu checkout somente nessa sessão. Use-a toda vez que iniciar o Claude Code a partir do código-fonte e reinicie a sessão depois de recompilar. A extensão compilada fica em `dist-extension`, dentro do checkout.

Os detalhes do plugin também devem listar as skills `blinkling` e `install` e o servidor MCP `blinkling`. A extensão empacotada fica em `bin/extension` e sua versão também deve ser **2.1.0**.

O auxiliar do navegador é opcional. Execute `/blinkling:install` para copiar a extensão compilada para a pasta fixa `~/Blinkling-extension`. No Chrome ou no Edge, abra `chrome://extensions` ou `edge://extensions`, ative **Developer mode**, escolha **Load unpacked** e selecione essa pasta. O aviso de desenvolvedor continua visível e as atualizações são manuais quando houver uma nova versão.

Depois de atualizar a extensão não empacotada, execute `/blinkling:install` de novo para renovar a pasta fixa e clique em Recarregar no cartão dela na página de extensões. Ao mudar para `~/Blinkling-extension`, remova o cartão antigo e carregue esta pasta uma vez.

Com o plugin instalado, execute estes comandos e depois `/reload-plugins` e `/blinkling:blinkling` no Claude Code. Confirme que a lista de plugins e o cartão da extensão mostram a versão **2.1.0**.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## Enquanto você lê

- **Pergunte sobre o que está sob o ponteiro.** Segure Ctrl e clique em algo, ou arraste para pegar uma área. Ela voa para o Blink e o compositor mini se abre. Enter envia.
- **Converse com o Blink.** Clique no Blink para continuar a última conversa no compositor mini. Uma mensagem longa ou Shift+Enter abre o compositor completo.
- **Respostas em balões.** Eles apontam para aquilo de que falam. Gire a roda sobre o Blink para ler os anteriores.
- **O menu.** Passe o ponteiro sobre o Blink para abri-lo: captura, guia, explicação automática e configurações. Um guia numera seus passos na página e pode ser salvo como Markdown. A explicação automática vem desativada, acrescenta no máximo dois balões e nunca desenha marcas.
- **Auxiliar do navegador (opcional).** O pop-up da barra de ferramentas mostra o que está conectado e tem um botão **Wake Blink**. Ele permite que o Blink leia a estrutura da página, capture uma página inteira, traduza uma página no lugar e abra PDFs em um leitor.

A captura também tem um atalho global, Ctrl+Shift+S (Cmd no macOS), que você pode mudar nas configurações.

## Privacidade

O Blink pergunta ao Claude Code em que você está conectado neste computador, e nada é capturado até você pedir. Sem telemetria nem serviço de respostas operado pelo editor. O contexto escolhido e as capturas vão para o Claude Code e seu provedor; valem os termos e as cobranças de uso do provedor. O auxiliar só fala com a ponte em `127.0.0.1` e nunca lê campos de senha nem valores digitados. A explicação automática permanece desativada até você ativá-la.

[Detalhes de privacidade](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Recursos](docs/FEATURES.md) | [Notas da versão](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.

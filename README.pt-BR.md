<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>O Blink mora no canto da sua tela. Segure Ctrl, clique em qualquer coisa e receba a resposta.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Vindo do plugin antigo? Execute `/plugin uninstall glimpselet@glimpselet` e `/plugin marketplace remove glimpselet` e depois instale o Blinkling pelos passos abaixo.

O Blinkling põe o Blink, um pequeno companheiro verde, no canto da sua tela, acima de todos os apps. Segure Ctrl (Control no macOS) e clique no que quiser perguntar, ou arraste para pegar uma área. A seleção voa para dentro do Blink, você digita a pergunta e a resposta abre num cartão de chat ao lado do Blink.

O Blinkling só olha e explica. Ele nunca clica nem digita nos seus apps.

Ele usa o Claude Code em que você já está conectado neste computador.

<p align="center">
<img src="assets/pick.webp" alt="Ctrl e clique em um parágrafo de uma página do arXiv. A captura voa para a boca do Blink, o cartão de chat abre e a resposta chega aos poucos."><br>
Artigo: Ctrl e clique em um parágrafo, e leia a resposta.
</p>

<p align="center">
<img src="assets/translate.webp" alt="Em uma página da Wikipédia em árabe, um trecho escolhido entra no Blink, Traduzir é pressionado e a resposta explica o trecho em inglês."><br>
Traduzir: um trecho em árabe, explicado em inglês.
</p>

<p align="center">
<img src="assets/tour.webp" alt="Em uma página pública bem densa, o guia marca as partes da página. O Blink segura um bastão apontador no passo atual e Próximo avança pelos passos."><br>
Guia: uma página difícil, passo a passo.
</p>

## Instalação

Você precisa do Claude Code, conectado neste computador. No Windows, também precisa do Node.js 22 ou mais novo, de nodejs.org, que o Blinkling não baixa por você. macOS e Linux não precisam de mais nada.

Depois de instalar qualquer coisa, feche o terminal e abra um novo, para que ele encontre o programa novo.

1. Cole esta linha em um terminal e aperte Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Inicie o Claude Code com o canal do Blink:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   A opção deixa o chat do Blink e esta sessão do terminal enxergarem um ao outro. O Claude Code pede para você confirmar uma vez. Sem ela o Blink continua funcionando e responde pela sessão dele.

   Depois, nessa sessão, execute:

   ```text
   /blinkling:blinkling
   ```

3. No Mac, permita uma vez a Gravação de Tela para o Blinkling, em Ajustes do Sistema, Privacidade e Segurança. O macOS também pergunta uma vez sobre Acessibilidade, para que a tecla Ctrl possa iniciar uma seleção. Permita no mesmo lugar.

Se um Mac ou um computador Linux não tem Node.js, o Blinkling baixa uma cópia privada própria na primeira vez que inicia. São cerca de 45 MB, conferidos contra um SHA-256 fixo. Se, nessa primeira inicialização, o Claude Code disser que a conexão com o Blinkling falhou, espere um minuto e execute `/mcp`.

> [!NOTE]
> No Windows PowerShell 5, execute os dois comandos um depois do outro em vez de juntá-los com `&&`. Os passos animados para o seu computador estão no [guia de instalação](https://arthur031221.github.io/Blinkling/install/). Outras formas de instalar, atualizações e a sandbox do Linux estão em [docs/INSTALL.md](docs/INSTALL.md).

## Enquanto você lê

- Segure Ctrl e clique em um parágrafo, um botão ou uma imagem, e o Blink pega.
- Segure Ctrl e arraste para pegar uma área.
- O cartão de chat abre ao lado do Blink com a sua seleção, três perguntas rápidas e os seletores de modelo, esforço e permissão. Enter envia a pergunta destacada.
- Clique no Blink a qualquer momento para conversar. O cartão abre com a sua conversa.

![Clique no Blink, digite uma pergunta e a resposta chega ao cartão de chat.](assets/ask.webp)

- O menu do Blink tem captura, guia, Explicação automática e configurações. A Explicação automática fica desligada até você ligar.
- O ajudante de navegador opcional para Chrome ou Edge dá ao Blink a estrutura da página, assim ele sabe a qual parágrafo ou botão você apontou. Ele também traz captura de página inteira, tradução na própria página e um leitor de PDF. O botão da barra de ferramentas mostra se está conectado e acorda o Blink. Sem ele, o Blink funciona em qualquer janela.

## Atalhos

| Atalho                   | Ação                                                |
| ------------------------ | --------------------------------------------------- |
| Ctrl + clique            | Perguntar sobre o que está sob o ponteiro           |
| Ctrl + arrastar          | Pegar uma área                                      |
| Atalho nas Configurações | Abrir a sobreposição de captura                     |
| Ctrl + Alt + Shift + B   | Sair do Blink (no Mac, Ctrl + Option + Command + B) |

Você pode mudar as teclas nas Configurações.

## Sessões e privacidade

O Blink envia o que você selecionou para o seu próprio Claude Code conectado e mostra a resposta no cartão de chat. O que você digita na sessão de terminal que iniciou o Blink, e a resposta a isso, também aparecem no chat do Blink.

O outro sentido, o chat do Blink no terminal, passa pelos canais experimentais do Claude Code. Eles só carregam quando o Claude Code inicia, então inicie com `claude --dangerously-load-development-channels plugin:blinkling@blinkling`. `/blinkling:blinkling` mostra o mesmo comando.

> [!IMPORTANT]
> O ajudante de navegador só lê uma página quando você aponta para ela. Ele nunca lê campos de senha nem de pagamento e só fala com o Blinkling no seu próprio computador. O recurso Explicação automática fica desligado até você ligar.

O Blinkling não tem telemetria nem serviço de respostas próprio. O que você seleciona vai para o seu Claude Code, e valem os termos e os custos de uso do provedor. As configurações do navegador, as lojas de extensões e o visualizador de PDF do próprio navegador são páginas protegidas, então o Blink responde ali a partir da tela.

[Privacidade](docs/SECURITY.md) | [Uso](docs/USAGE.md) | [Notas da versão](docs/releases/v3.2.6.md)

Assisted by Claude/Codex.

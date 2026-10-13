# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

Um chat flutuante para perguntar ao Claude Code sobre a página ou a tela que você está vendo. Leia e traduza páginas da web, receba orientação sobre os controles da página e capture uma área para fazer perguntas.

|           Chat flutuante do Glimpselet           |                 Exemplo de orientação na página                  |
| :----------------------------------------------: | :--------------------------------------------------------------: |
| ![Chat flutuante do Glimpselet](assets/demo.gif) | ![Exemplo de orientação na página](assets/screenshots/guide.png) |

Requisitos: uma versão recente do Claude Code, login com sua própria assinatura e um navegador Chromium para desktop, como Chrome ou Edge.

Glimpselet inicia uma conversa dedicada. Você também pode continuar uma sessão recente do Claude Code em um processo separado. Para enviar solicitações à sessão interativa já aberta no terminal, ative a prévia de canais. [Configuração do canal](docs/DESIGN.md#the-running-claude-code-conversation).

## Instalação

1. Adicione o marketplace e instale o plugin no Claude Code:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. No terminal, confira se `claude plugin list` mostra Glimpselet **2.0.0** e execute `/glimpselet:glimpse` no Claude Code.

3. Siga o guia de boas-vindas para conectar o navegador. Em um desktop local, escolha **Try without installing** ou carregue e pareie a extensão no seu navegador. Se o Claude Code estiver em um host remoto, execute o comando SSH exibido pelo guia no computador com o navegador. Baixe o ZIP nesse computador e carregue a extensão no navegador. A opção sem instalação não está disponível no host remoto. Após o pareamento, o painel do Glimpselet mostra o modo de conexão e o projeto.

### Avançado: carregar do código-fonte

No seu navegador de desktop, a extensão fica na pasta estável `~/.glimpselet/extension`. No Chrome ou Edge, abra `chrome://extensions` ou `edge://extensions`, ative **Developer mode**, escolha **Load unpacked** e selecione essa pasta. O aviso de desenvolvedor continuará visível. As atualizações precisam ser feitas manualmente.

## Atualizar a partir da v1

Se o Glimpselet já estiver instalado, atualize o catálogo e o plugin pelo terminal:

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Reinicie o Claude Code ou execute `/reload-plugins` na sessão aberta. Confira se `claude plugin list` mostra Glimpselet **2.0.0** e execute `/glimpselet:glimpse` novamente. O guia de boas-vindas e pareamento deve abrir. Se a versão continuar em 1.x, a v2 pode ainda não estar publicada na origem do catálogo; repetir a instalação não atualiza um plugin em cache.

Para a extensão descompactada, o guia copia os novos arquivos para `~/.glimpselet/extension`. Recarregue o Glimpselet em `chrome://extensions` ou `edge://extensions` e confira a versão **2.0.0**. Com SSH, baixe o novo ZIP pelo guia no computador com seu navegador, extraia na pasta carregada anteriormente e recarregue a extensão. O host remoto não pode abrir o navegador sem instalação no seu computador.

## O que você pode fazer

- Receber respostas em streaming e fazer perguntas de acompanhamento com Opus, Sonnet ou Haiku.
- Capturar uma tela compartilhada na visualização em tela cheia ou recortar uma área com a sobreposição da página. Segure Shift e arraste. Pressione Enter para capturar ou Esc para cancelar.
- Ver perguntas sugeridas que são atualizadas junto com a página.
- Ativar os resumos Passive opcionais, pausá-los com Alt+P e consultar o custo por hora.
- Ver um guia sobre os controles reais da página. Traduza o texto no próprio lugar e use Restore para recuperá-lo.
- Selecionar um texto para explicar, traduzir ou perguntar sobre ele. Também é possível abrir PDFs no leitor incluído e fazer perguntas.

![Guiar esta página](assets/guide.gif)

![Área selecionada](assets/crop.gif)

| Atalho                              | Ação                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Alt+Shift+G                         | Abre o Glimpselet. Escolha **Float** para abrir o chat flutuante.                   |
| Ctrl+Shift+S (Cmd+Shift+S no macOS) | Recorta a página atual ou a tela compartilhada.                                     |
| Ctrl+Shift+7 (Cmd+Shift+7 no macOS) | Recorta a partir de qualquer aplicativo. Altere em `chrome://extensions/shortcuts`. |
| Segurar Shift                       | Inicia um recorte em uma bolha ou página do Glimpselet.                             |
| Alt+P                               | Pausa os resumos Passive.                                                           |

No macOS, Cmd+Shift+5 abre a ferramenta de captura de tela do sistema. Shift em uma página só funciona nas páginas do Glimpselet. Não pode receber teclas em outros aplicativos.

**Float** é a primeira ação. A extensão pede acesso à página quando você usa um recurso que precisa dele. Não é necessária uma chave de API do provedor quando você usa sua própria sessão conectada do Claude Code. O modo de API direta é opcional e exige sua própria chave de API.

## Sessões do Claude Code

Veja [Sessões do Claude Code](docs/DESIGN.md#the-running-claude-code-conversation) para o comando e a configuração da prévia de channels. Sem o channel, o Glimpselet pode continuar uma sessão selecionada em outro processo. Isso é uma continuação paralela. Não use essa sessão no terminal ao mesmo tempo, pois o acesso simultâneo pode causar conflitos.

## Limites e privacidade

O Glimpselet funciona no Chrome, Edge e outros navegadores Chromium para desktop. O aviso de desenvolvedor permanece até a distribuição em uma loja, e as atualizações são manuais. Algumas páginas, como configurações do navegador, lojas de extensões e páginas restritas, bloqueiam o acesso. O leitor de PDF integrado do Chrome não é acessível. Use o leitor do Glimpselet. Aplicativos nativos fornecem apenas pixels, sem texto de página ou sobreposições. Shift funciona somente nas superfícies de navegador do próprio Glimpselet, não em outro aplicativo. A janela flutuante não permite que cliques passem por ela.

As perguntas sugeridas automaticamente usam o contexto da página somente com seu consentimento. Resumos passivos são opcionais e exigem o compartilhamento de uma guia inspecionada. Se a origem compartilhada for uma janela, tela, aplicativo nativo, origem desconhecida ou inacessível, os resumos automáticos pausam. Perguntas e capturas manuais continuam disponíveis.

[Guia de instalação](docs/INSTALL.md) | [Uso](docs/USAGE.md) | [Design](docs/DESIGN.md) | [Detalhes de privacidade](docs/SECURITY.md)

Assisted by Claude/Codex.

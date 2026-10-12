# Glimpselet

O Glimpselet é um chat pequeno que fica acima das outras janelas e se conecta a uma sessão existente do Claude Code. Ele pode ler e traduzir páginas acessíveis, desenhar guias na página real e capturar áreas da página ou quadros da tela compartilhada para perguntas.

![Chat flutuante do Glimpselet](assets/demo.gif)

![Círculos de orientação desenhados na página real](assets/screenshots/guide.png)

[Abrir a demonstração estática](https://arthur031221.github.io/Glimpselet/). Ela usa uma imagem de exemplo e uma resposta gravada, sem enviar solicitações a provedores.

## Instalação

Instale o plugin Glimpselet no Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Execute `/glimpse` e siga o guia de configuração. Ele é a referência para instalação e pareamento.

### Avançado: carregar do código-fonte

1. Abra `chrome://extensions` no Chrome ou Edge e ative o **modo do desenvolvedor**.
2. Escolha **Carregar sem compactação**.
3. Selecione a pasta da extensão indicada pelo guia de configuração.
   > **Modo de desenvolvedor:** O Glimpselet ainda é distribuído em modo de desenvolvedor. Até haver uma listagem em uma loja, as atualizações precisam ser instaladas manualmente.

## Capturas e atalhos

Mantenha Shift pressionado na bolha flutuante ou em uma página acessível para iniciar um recorte. O Shift não detecta teclas em outros aplicativos. Em páginas web, a seleção é feita diretamente sobre a página atual. Durante o compartilhamento de tela, o quadro é congelado e aberto em tela cheia para o recorte. Pressione Enter para confirmar ou Esc para cancelar.

O atalho do navegador é Ctrl+Shift+S (Cmd+Shift+S no Mac). Ele inicia o recorte no navegador. O atalho global padrão é Ctrl+Shift+5, pois o Chrome exige uma tecla numérica nos atalhos globais. Você pode alterá-lo, inclusive para S, em `chrome://extensions/shortcuts`.

## Sessões do Claude Code

O suporte documentado a MCP channels permite enviar mensagens para uma sessão do Claude Code já em execução. O Glimpselet mostra as respostas a partir dos blocos da ferramenta de resposta do channel. O modelo e as permissões continuam sob controle da sessão no terminal. Para adicionar o channel personalizado do Glimpselet, reinicie a sessão com o channel de desenvolvimento ativado e execute `/glimpse`:

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

Sem o channel, o Glimpselet pode continuar a mesma sessão em outro processo no modo print com `claude --resume SESSION_ID -p`. Essa é uma continuação em paralelo. Não execute enquanto o processo do terminal estiver usando a mesma sessão. o acesso simultâneo pode gerar conflitos.

## Limites

- Somente Chrome, Edge e outros navegadores Chromium.
- Páginas internas do navegador, como `chrome://`, a loja de extensões e algumas páginas gerenciadas bloqueiam o acesso.
- O Glimpselet não desenha sobre aplicativos nativos. Você pode compartilhar a tela e perguntar sobre a imagem, mas não há sobreposições de página nem ações em texto.
- Abra PDFs no leitor Glimpselet incluído. O visualizador de PDF integrado ao Chrome não é uma página acessível.
- A API Document Picture-in-Picture do navegador não oferece passagem de cliques, então a janela flutuante não pode encaminhar cliques para outro aplicativo. O navegador pode não garantir a janela flutuante nem a abertura automática. Mantenha a página da extensão aberta enquanto usar a janela flutuante.

## Privacidade

Não há telemetria. Com consentimento, o texto da página pode ser enviado para gerar perguntas sugeridas. Perguntas e resumos passivos opcionais também podem enviar texto e imagens relevantes. Os quadros ficam na memória e só são enviados à ponte em solicitações de captura ou pergunta. No modo ponte, a CLI é executada no host e os registros da sessão ficam lá. O modo de API direta envia solicitações pela extensão. Chaves de API e tokens da ponte ficam no armazenamento de sessão do navegador. As preferências ficam no armazenamento local. Consulte [segurança e privacidade](docs/SECURITY.md) para os fluxos de dados.

## Mais informações

[Instalação](docs/INSTALL.md) | [Uso](docs/USAGE.md) | [Design e integração](docs/DESIGN.md) | [Preparação para lojas](docs/STORE.md) | [Notas da versão](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.

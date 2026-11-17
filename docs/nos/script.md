<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Comando

> Roda um comando de terminal num container

## O que faz

Roda um comando de terminal num container, no workspace do item ou num container isolado, e diz se deu certo. Nunca roda na sua máquina. O comando recebe as variáveis FORJA_RUN_ID, FORJA_PROJECT_BASE_BRANCH e FORJA_ITERATION; com item, também FORJA_ITEM_ID, FORJA_ITEM_NUMBER, FORJA_ITEM_TITLE, FORJA_ITEM_BRANCH e FORJA_ITEM_URL; e FORJA_INPUT_&lt;ENTRADA&gt; com o JSON de cada entrada. Os valores de {{...}} entram no comando entre aspas, como um único argumento, sem risco de injeção.

## Quando usar

- Para rodar os testes, o lint ou o build depois que um agente mexeu no código.
- Para preparar o workspace, como instalar dependências.
- Para medir algo do repositório (cobertura, tamanho) e decidir com o resultado.

## Quando não usar

- Para tarefas que pedem raciocínio: use um Agente.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | sim | O item em cujo workspace o comando roda. Só é obrigatória com "Onde roda" no workspace do item. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Resultado | `result` | `json` | sim | O código de saída (exitCode), se passou (passed), o fim do stdout e do stderr, a duração (durationMs) e, se pedido, o JSON lido da saída (data). Ligue numa Decisão para seguir caminhos diferentes. |
| Saída | `output` | `text` | sim | O texto impresso pelo comando (últimas 200 linhas), para o contexto de um Agente. |

## Campos

### Comando (`command`)

O comando de terminal a rodar, como npm test. Aceita {{...}} com os dados do fluxo, como {{item.number}}.

### Onde roda (`runIn`)

Em qual container o comando roda.

- Padrão: Workspace do item
- Opções:
  - `item` — Workspace do item: No container do item, com o código e o branch dele.
  - `isolated` — Container isolado: Num container novo, só com o repositório para leitura. Não precisa de item e, fora de um Map, roda uma vez por execução.

### Se o comando falhar (`onFailure`)

O que acontece quando o código de saída não é 0.

- Padrão: Falhar o nó
- Opções:
  - `fail` — Falhar o nó: O nó fica vermelho e tenta de novo, conforme as retentativas do projeto.
  - `continue` — Continuar: O nó termina bem com passed falso, para uma Decisão ou um Loop julgar.

### Ler a saída como JSON (`parseOutput`)

Transforma o stdout em dados em result.data. Se não for JSON válido, data fica vazio e o nó não falha.

- Padrão: Não
- Opções:
  - `none` — Não: A saída fica só como texto.
  - `json` — Saída inteira: O stdout inteiro é um JSON.
  - `lastLineJson` — Última linha: A última linha não vazia do stdout é um JSON.

### Variáveis de ambiente (`env`) · avançado

Nome e valor de cada variável. O valor aceita {{...}} ou vem de uma credencial do cofre, que nunca aparece nos logs. Sobrescrevem as FORJA_*, menos FORJA_RUN_ID.

- Padrão: Nenhuma

### Diretório (`workingDir`) · avançado

Onde o comando roda, relativo à raiz do repositório.

- Padrão: A raiz do repositório

### Shell (`shell`) · avançado

O shell que interpreta o comando.

- Padrão: bash
- Opções:
  - `bash` — bash: Aceita a sintaxe do bash.
  - `sh` — sh: Para imagens sem bash, como as baseadas em Alpine.

### Imagem (`image`) · avançado

A imagem Docker do container isolado. Vazio usa a imagem do agente do projeto.

- Padrão: A imagem do agente do projeto

### Tempo máximo (minutos) (`timeoutMinutes`) · avançado

Depois desse tempo o comando é interrompido e o nó falha. Mínimo de 1.

- Padrão: 15 minutos

## Exemplos

### Rodar os testes

Roda a suíte de testes depois do Dev; o nó falha se algum teste quebrar.

```json
{
  "command": "npm test",
  "onFailure": "fail"
}
```

### Testes que um Loop julga

Continua mesmo com testes quebrados, para o Loop repetir o Dev até passarem.

```json
{
  "command": "npm test",
  "onFailure": "continue"
}
```

### Medir a cobertura

A última linha imprime {"coverage": 81}; uma Decisão lê result.data.coverage.

```json
{
  "command": "npm run coverage --silent | tail -n 1",
  "parseOutput": "lastLineJson"
}
```

### Publicar com um token do cofre

Roda num container isolado, com o token vindo de uma credencial.

```json
{
  "command": "npm publish",
  "runIn": "isolated",
  "env": [
    {
      "name": "NPM_TOKEN",
      "credentialId": "<credencial>"
    }
  ]
}
```

## Erros comuns

- Usar "Falhar o nó" num teste que um Loop deve julgar: o nó para o fluxo em vez de seguir com passed falso. Use "Continuar".
- Pôr aspas em volta de {{...}}: o valor já entra entre aspas.

## Relacionados

- [Agente](agent.md)
- [Decisão](condition.md)

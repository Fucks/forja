<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Decisão

> Escolhe o caminho do item: Sim/Não ou vários caminhos com Senão

## O que faz

Avalia regras sobre os dados disponíveis: a entrada, as saídas dos nós anteriores, o item atual, o projeto e a execução. A regra aparece como uma frase, como “Se Reviewer › approved é verdadeiro”. Em Sim/Não, se a regra for verdadeira o item segue por Sim; senão, por Não. Em Vários caminhos, os caminhos são avaliados em ordem e o item segue pelo primeiro verdadeiro; se nenhum for, segue por Senão. Sem Senão, os caminhos são pulados e o item fica em Precisa de humano. O que chegou na entrada passa adiante pelo caminho escolhido, e o item segue sempre por um caminho só.

## Quando usar

- Para seguir caminhos diferentes conforme o Reviewer aprovar ou reprovar.
- Para triar itens em vários caminhos, como bug, feature ou dúvida, sem encadear Decisões.
- Para checar se os testes passaram antes de abrir o PR.
- Para dar um tratamento diferente aos itens com uma label, como urgente.

## Quando não usar

- Para esperar a decisão de uma pessoa: use uma Aprovação humana.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| O que passa adiante | `value` | `json` | sim | Os dados avaliados pela regra, normalmente o Resultado de um Agente ou de um Comando. Seguem pelo caminho escolhido. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Sim | `true` | `any` | sim | Por onde o item segue quando a regra é verdadeira. |
| Não | `false` | `any` | sim | Por onde o item segue quando a regra é falsa. |
| Senão | `otherwise` | `any` | sim | Em Vários caminhos, por onde o item segue quando nenhum caminho se aplica. Cada caminho tem a sua própria saída, com o nome dele, antes de Senão. |

## Campos

### Tipo de decisão (`mode`)

Sim/Não testa uma regra e tem duas saídas. Vários caminhos tem até 10 caminhos em ordem, cada um com nome e regras, mais Senão. Trocar para Vários caminhos transforma a regra atual no primeiro caminho; voltar para Sim/Não usa a regra do primeiro caminho e remove os demais.

- Padrão: Sim/Não
- Opções:
  - `if` — Sim/Não: Uma regra, saídas Sim e Não.
  - `switch` — Vários caminhos: Segue pelo primeiro caminho cuja regra é verdadeira.

### Caminhos (`branches`)

Os caminhos de Vários caminhos, na ordem em que são avaliados. Cada um tem um nome, que aparece na saída do nó, e regras montadas como em Sim/Não. Suba ou desça um caminho para mudar a ordem; remover um caminho remove as ligações dele.

### Senão (`otherwise`)

Em Vários caminhos, a saída usada quando nenhum caminho se aplica. Desligado, o item fica em Precisa de humano com o motivo “Nenhum caminho da Decisão se aplicou”.

- Padrão: ligado

### Regra (`condition`)

Escolha o dado e o editor mostra só os operadores que servem para o tipo dele: sim/não, número, texto, texto com opções fechadas, lista ou objeto. O valor é pedido com o controle certo, e dá para juntar várias regras com “e” ou “ou”. “Testar com o último run” mostra o caminho que a regra tomaria com os dados reais.

- Padrão: inputs.value.approved é verdadeiro
- Opções:
  - `eq` — é verdadeiro / é falso / é igual a / =: O dado é exatamente o valor; para sim/não, é verdadeiro ou falso.
  - `neq` — é diferente de / ≠: O dado não é o valor.
  - `gt, gte, lt, lte` — &gt; / ≥ / &lt; / ≤: Compara números.
  - `contains, notContains` — contém / não contém: Procura um trecho num texto ou um elemento numa lista.
  - `startsWith` — começa com: O texto começa com o trecho.
  - `in` — é um de: O dado é uma das opções escolhidas; serve para campos com opções.
  - `isEmpty, isNotEmpty` — está vazio / não está vazio: Texto, lista ou objeto vazio; um dado que não existe conta como vazio.
  - `minLength` — tem pelo menos N: A lista (ou o texto) tem pelo menos N elementos (ou caracteres).
  - `exists` — existe / não existe: O dado está presente, mesmo que seja nulo.

## Exemplos

### Reviewer aprovou?

Liga o Resultado do Reviewer na entrada e testa se approved é verdadeiro.

```json
{
  "mode": "if",
  "condition": {
    "op": "eq",
    "path": "nodes.reviewer.result.approved",
    "value": true
  }
}
```

### Resultado da revisão em três caminhos

Aprovado quando approved é verdadeiro, Ajustes quando há notes, e Senão para o resto, que vai para uma pessoa.

```json
{
  "mode": "switch",
  "branches": [
    {
      "port": "approved",
      "label": "Aprovado",
      "condition": {
        "op": "eq",
        "path": "nodes.reviewer.result.approved",
        "value": true
      }
    },
    {
      "port": "changes",
      "label": "Ajustes",
      "condition": {
        "op": "isNotEmpty",
        "path": "nodes.reviewer.result.notes"
      }
    }
  ],
  "otherwise": true
}
```

### Testes passaram?

Escolhe Testes › Resultado › passed, de um Comando, e testa se é verdadeiro.

```json
{
  "mode": "if",
  "condition": {
    "op": "eq",
    "path": "nodes.testes.result.passed",
    "value": true
  }
}
```

### Tem a label urgente?

Escolhe Item atual › labels e testa se contém urgente.

```json
{
  "mode": "if",
  "condition": {
    "op": "contains",
    "path": "item.labels",
    "value": "urgente"
  }
}
```

## Erros comuns

- Ler um campo que o agente não devolve: defina o Formato da resposta no Agente.
- Usar um operador que não serve para o tipo do dado, como “contém” num sim/não: o fluxo mostra o erro e sugere os operadores certos.
- Deixar a porta Não (ou Senão) sem ligação e o item parar sem destino.
- Pôr um caminho amplo antes de um específico: o primeiro verdadeiro vence, então o específico nunca é escolhido.

## Relacionados

- [Agente](agent.md)
- [Comando](script.md)
- [Loop](loop.md)

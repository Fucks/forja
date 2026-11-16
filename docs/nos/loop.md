<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Loop

> Repete os nós de dentro até a condição de parada valer

## O que faz

Repete os nós de dentro até a condição de parada ser verdadeira ou acabarem as voltas. Quando as voltas acabam sem a condição valer, o item sai por Esgotou as voltas.

## Quando usar

- Para devolver o trabalho ao Dev até o Reviewer aprovar.

## Quando não usar

- Para processar vários itens: use um Map.

## Entradas

Nenhuma.

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Esgotou as voltas | `exhausted` | `loopExhausted` | não | Por onde o item sai quando o limite de voltas é atingido sem a condição ficar verdadeira. Normalmente vai para uma Saída "Precisa de humano". |

## Campos

### Parar quando (`until`)

A condição de parada, montada como a regra da Decisão. É avaliada no fim de cada volta.

### Máximo de voltas (`maxIterations`)

Quantas voltas o grupo dá, de 1 a 50.

- Padrão: 3

### Levar para a próxima volta (`carry`)

As saídas que passam de uma volta para a próxima, como as notas do Reviewer para o Dev.

- Padrão: Nada

## Exemplos

### Revisar até aprovar

Dev e Reviewer dentro de um Loop que para quando o Reviewer aprova e leva as notas para a próxima volta.

```json
{
  "maxIterations": 3,
  "carry": [
    "notes"
  ]
}
```

## Erros comuns

- Deixar Esgotou as voltas sem ligação e o item parar sem destino.
- Esquecer de levar as notas e o Dev repetir o mesmo erro.

## Relacionados

- [Agente](agent.md)
- [Decisão](condition.md)
- [Map](map.md)

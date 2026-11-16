<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Fonte

> Busca as issues do GitHub ou os itens locais a processar

## O que faz

Busca os itens de trabalho que o fluxo vai processar: issues do GitHub ou itens locais do board. Ao entrar num grupo Map, a lista vira um item por vez.

## Quando usar

- Para escolher quais issues o fluxo vai processar.
- Para trabalhar com itens criados no board, sem GitHub.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Sinal de início | `trigger` | `any` | não | Opcional. Só ordena a execução: a Fonte roda depois do nó ligado aqui. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Itens | `items` | `workItemList` | sim | A lista de itens encontrados. Ao entrar num grupo Map, vira um item por vez. |

## Campos

### De onde buscar (`provider`)

A origem dos itens de trabalho.

- Opções:
  - `github` — GitHub: Issues abertas do repositório do projeto.
  - `local` — Local: Itens criados no board.

### Label (`label`)

Só busca issues com essa label, por exemplo Sandcastle.

- Padrão: Vazio (qualquer label)

### Situação (`state`)

Só busca itens abertos. Este valor é fixo.

- Padrão: Abertos

### Máximo de itens (`limit`)

Quantos itens entram em cada run, de 1 a 100.

- Padrão: 20

### Pular bloqueadas (`skipBlocked`)

Pula issues bloqueadas por outras ainda abertas, como uma issue que diz "depends on #12" enquanto a #12 não fecha.

- Padrão: Ligado

## Exemplos

### Pegar até 5 bugs

Busca até 5 issues abertas com a label bug.

```json
{
  "provider": "github",
  "label": "bug",
  "limit": 5
}
```

## Erros comuns

- Esquecer a label e buscar todas as issues abertas do repositório.
- Esperar issues bloqueadas com "Pular bloqueadas" ligado.

## Relacionados

- [Gatilho](trigger.md)
- [Map](map.md)

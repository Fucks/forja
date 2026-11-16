<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Saída

> Encerra o caminho do item e diz onde ele fica no board

## O que faz

Encerra o caminho do item e diz onde ele fica no board. Pode também comentar na issue com o resultado.

## Quando usar

- No fim de cada caminho do fluxo, como "Concluído" ou "Precisa de humano".

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | sim | O item que termina aqui. |

## Saídas

Nenhuma.

## Campos

### Mover o item para (`moveItemTo`)

A coluna do board onde o item fica no fim.

- Padrão: Vazio (não move)
- Opções:
  - `done` — Concluído: O trabalho terminou.
  - `needs_human` — Precisa de humano: Alguém precisa olhar o item.

### Comentar na issue (`commentOnIssue`)

Comenta na issue com o resultado, o link do PR e o motivo. Se uma entrada trouxer notes, reason ou failureSummary, esse texto vira o motivo.

- Padrão: Desligado

## Exemplos

### Precisa de humano

Move o item e comenta na issue o motivo de o Reviewer reprovar.

```json
{
  "moveItemTo": "needs_human",
  "commentOnIssue": true
}
```

## Erros comuns

- Esperar um comentário na issue com "Comentar na issue" desligado.

## Relacionados

- [Git](git.md)
- [Aprovação humana](gate.md)

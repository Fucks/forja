<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Gatilho

> Ponto de partida: define quando o fluxo roda

## O que faz

É o ponto de partida do fluxo. Define quando o fluxo roda e entrega a lista de itens com que o run começou.

## Quando usar

- Todo fluxo tem exatamente um gatilho.

## Quando não usar

- Para buscar issues ou itens do board: quem busca é o nó Fonte.

## Entradas

Nenhuma.

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Itens | `items` | `workItemList` | não | Os itens do run. Vem preenchida quando o run nasce de um card arrastado no board; num disparo manual sem itens, chega vazia. |

## Campos

### Tipo de disparo (`kind`)

Quando o fluxo começa. A configuração detalhada fica na tela Gatilhos, e o inspector traz o link para ela.

- Padrão: Manual
- Opções:
  - `manual` — Manual: Roda quando alguém clica em "Executar".
  - `schedule` — Agendado: Roda em horários definidos por uma expressão cron.
  - `event` — Por evento: Roda quando algo acontece, como "limite de uso resetou".
  - `webhook` — Webhook: Roda quando uma URL local recebe uma chamada.
  - `board_column` — Coluna do board: Roda ao soltar um card numa coluna do board.

## Exemplos

### Rodar toda noite

Gatilho agendado que processa as issues abertas às 2h da manhã.

```json
{
  "kind": "schedule"
}
```

## Erros comuns

- Achar que o gatilho busca issues. Quem busca é o nó Fonte.

## Relacionados

- [Fonte](source.md)

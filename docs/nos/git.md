<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Git

> Atualiza a branch do item, envia ou abre o PR

## O que faz

Executa uma ação de git na branch do item: atualiza com a base, envia a branch ou abre o PR. O resultado traz o link do PR e o nome da branch.

## Quando usar

- Para abrir o PR depois que o código foi revisado e testado.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | sim | O item cuja branch recebe a ação. |
| Texto do PR | `body` | `text` | não | Opcional. O texto usado na descrição do PR. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Resultado | `result` | `json` | sim | O link do PR, a branch e os detalhes da ação. |

## Campos

### Ação (`action`)

O que fazer com a branch do item.

- Opções:
  - `rebase` — Rebase: Atualiza a branch com a base. Se houver conflito, um agente resolve.
  - `push` — Push: Envia a branch para o GitHub.
  - `open_pr` — Abrir PR: Faz push e abre o PR.

### Branch base (`baseBranch`)

A branch de onde o item parte e para onde o PR aponta.

- Padrão: Vazio (usa a do projeto)

### Rascunho (`draft`)

Abre o PR como rascunho.

- Padrão: Desligado

### Texto do PR vem de (`bodyFrom`) · avançado

De qual entrada vem o texto do PR.

- Padrão: Vazio (texto padrão)

## Exemplos

### Abrir PR em rascunho

Abre o PR como rascunho, com o resumo do Dev como descrição.

```json
{
  "action": "open_pr",
  "draft": true
}
```

## Erros comuns

- Abrir o PR antes de rodar os testes.

## Relacionados

- [Aprovação humana](gate.md)
- [Saída](output.md)

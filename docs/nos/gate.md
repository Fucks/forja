<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Aprovação humana

> Pausa o item até alguém aprovar ou rejeitar

## O que faz

Pausa o item até alguém aprovar ou rejeitar na tela Aprovações. O item segue só pelo caminho escolhido.

## Quando usar

- Antes de abrir um PR, para uma pessoa conferir o diff.
- Quando uma decisão não pode ser automática.

## Quando não usar

- Para regras que o fluxo pode checar sozinho: use uma Decisão.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | sim | O item que espera a aprovação. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Aprovado | `approved` | `workItem` | sim | Por onde o item segue quando a pessoa aprova. |
| Rejeitado | `rejected` | `workItem` | sim | Por onde o item segue quando a pessoa rejeita. |

## Campos

### Mensagem (`message`)

O que a pessoa deve verificar antes de decidir.

### O que mostrar (`show`)

O que aparece na tela Aprovações para ajudar a decidir.

- Padrão: Diff, artefatos e logs
- Opções:
  - `diff` — Diff: As mudanças no código do item.
  - `artifacts` — Artefatos: Os arquivos gerados pelos nós anteriores.
  - `logs` — Logs: O registro do que os nós fizeram.

### Prazo (horas) (`timeoutHours`)

Quanto tempo a aprovação espera. Ao vencer, o item vai para "Precisa de humano".

- Padrão: Sem prazo

## Exemplos

### Conferir antes do PR

Mostra o diff e pede para conferir se a mudança atende a issue.

```json
{
  "message": "A mudança atende a issue?",
  "show": [
    "diff"
  ]
}
```

## Erros comuns

- Deixar a porta Rejeitado sem ligação e o item parar sem destino.

## Relacionados

- [Decisão](condition.md)
- [Git](git.md)

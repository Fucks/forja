<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Decisão

> Se a regra for verdadeira, segue por Sim; senão, por Não

## O que faz

Avalia uma regra sobre os dados que chegam na entrada. Se a regra for verdadeira, o item segue por Sim; senão, por Não. O que chegou na entrada passa adiante pelo caminho escolhido.

## Quando usar

- Para seguir caminhos diferentes conforme o Reviewer aprovar ou reprovar.
- Para checar se os testes passaram antes de abrir o PR.

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

## Campos

### Regra (`condition`)

A comparação feita sobre os dados da entrada, como "approved é igual a verdadeiro". Dá para juntar várias regras com "e" ou "ou".

- Padrão: approved é igual a verdadeiro

## Exemplos

### Reviewer aprovou?

Liga o Resultado do Reviewer na entrada e testa se approved é verdadeiro.

```json
{
  "condition": {
    "op": "eq",
    "path": "approved",
    "value": true
  }
}
```

### Testes passaram?

Liga o Resultado de um Comando e testa se exitCode é igual a 0.

```json
{
  "condition": {
    "op": "eq",
    "path": "exitCode",
    "value": 0
  }
}
```

## Erros comuns

- Ler um campo que o agente não devolve: defina o Formato da resposta no Agente.
- Deixar a porta Não sem ligação e o item parar sem destino.

## Relacionados

- [Agente](agent.md)
- [Comando](script.md)
- [Loop](loop.md)

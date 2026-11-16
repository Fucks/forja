<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Comando

> Roda um comando de terminal no workspace do item

## O que faz

Roda um comando de terminal num container, no workspace do item, e diz se deu certo. Nunca roda na sua máquina. O resultado traz o código de saída e o texto impresso.

## Quando usar

- Para rodar os testes, o lint ou o build depois que um agente mexeu no código.
- Para preparar o workspace, como instalar dependências.

## Quando não usar

- Para tarefas que pedem raciocínio: use um Agente.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | sim | O item em cujo workspace o comando roda. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Resultado | `result` | `json` | sim | O resultado do comando, com o código de saída e o texto impresso. Ligue numa Decisão para seguir caminhos diferentes quando ele falha. |

## Campos

### Comando (`command`)

O comando de terminal a rodar, como npm test.

### Tempo máximo (minutos) (`timeoutMinutes`) · avançado

Depois desse tempo o comando é interrompido. Mínimo de 1.

- Padrão: 15 minutos

### Onde roda (`workspace`) · avançado

O comando roda no container do item, com o código do item. É fixo.

- Padrão: Workspace do item

## Exemplos

### Rodar os testes

Roda a suíte de testes depois do Dev; uma Decisão olha o resultado.

```json
{
  "command": "npm test"
}
```

## Erros comuns

- Esperar que o nó falhe quando o comando falha: o resultado segue adiante e uma Decisão precisa julgá-lo.

## Relacionados

- [Agente](agent.md)
- [Decisão](condition.md)

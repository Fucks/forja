<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->

# Agente

> Roda um prompt num Claude Code novo, sem memória dos outros nós

## O que faz

Roda um prompt num Claude Code novo, sem memória dos outros nós. O agente só sabe o que está no prompt e o que chega pelas entradas. A resposta sai como texto e, se houver Formato da resposta, como dados que uma Decisão consegue ler.

## Quando usar

- Para escrever ou revisar código, planejar uma tarefa ou resumir uma issue.
- Para gerar uma resposta estruturada que uma Decisão vai avaliar.

## Quando não usar

- Para rodar testes ou outro comando fixo: use um Comando, que é mais rápido.

## Entradas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Item atual | `item` | `workItem` | não | O item em que o agente trabalha. Dentro de um Map, chega sozinho. |
| Contexto extra | `context` | `text` | não | Texto de outro nó, como o resumo do agente anterior. |

## Saídas

| Porta | Nome técnico | Tipo | Obrigatória | Descrição |
| --- | --- | --- | --- | --- |
| Resultado | `result` | `json` | sim | Os dados que seguem o Formato da resposta. É o que as Decisões leem. |
| Resumo em texto | `summary` | `text` | sim | A última mensagem do agente. |

## Campos

### Prompt (`prompt`)

O que o agente deve fazer. Aceita variáveis como {{item.title}}, trocadas pelos dados do item.

### Modelo (`model`)

O modelo do Claude que roda o prompt.

- Padrão: Vazio (usa o do projeto)

### Esforço (`effort`)

Quanto o modelo pensa. Mais esforço custa mais e é mais lento.

- Padrão: Vazio (usa o do projeto)
- Opções:
  - `low` — Baixo: Rápido e barato.
  - `medium` — Médio: Equilíbrio entre custo e cuidado.
  - `high` — Alto: Pensa mais antes de agir.
  - `xhigh` — Muito alto: Para tarefas difíceis.
  - `max` — Máximo: O mais cuidadoso e o mais caro.

### Workspace (`workspace`)

Se o agente trabalha com o código do item ou só com texto.

- Padrão: Workspace do item
- Opções:
  - `item` — Workspace do item: Uma cópia do código do item, para editar arquivos.
  - `none` — Sem workspace: Só pensa ou escreve texto. É mais rápido.

### Repetições do prompt (`maxIterations`)

Quantas vezes o mesmo prompt é repetido até o agente avisar que terminou, no estilo "Ralph". Até 200.

- Padrão: 1 (roda uma vez)

### Sinal de conclusão (`completionSignal`)

O texto que o agente escreve para dizer que terminou, como &lt;promise&gt;COMPLETE&lt;/promise&gt;. Encerra as repetições.

- Padrão: Vazio

### Formato da resposta (`outputSchema`)

Os campos que o agente devolve no Resultado, cada um com nome e tipo (sim/não, número, texto, lista ou uma das opções). As Decisões seguintes leem esses campos; sem eles, a resposta é só texto e não há o que comparar.

- Padrão: Vazio (resposta livre)

### Máximo de ações (`maxTurns`) · avançado

Limite de ações do agente em cada execução, até 500.

- Padrão: Sem limite

### Teto de custo (US$) (`maxBudgetUsd`) · avançado

O agente para quando o custo passa desse valor.

- Padrão: Sem teto

### Novas tentativas (`retries`) · avançado

Quantas vezes o nó roda de novo se falhar, até 5. Não repete quando a resposta é ruim.

- Padrão: 1

### Tempo máximo (minutos) (`timeoutMinutes`) · avançado

Depois desse tempo o agente é interrompido.

- Padrão: 60 minutos

### Tempo máximo parado (minutos) (`idleTimeoutMinutes`) · avançado

O agente é interrompido se ficar esse tempo sem fazer nada.

- Padrão: 10 minutos

### Ferramentas (`toolProfileId`) · avançado

O que o agente pode usar: só leitura, CodeGraph, servidores MCP e outros.

- Padrão: Vazio (usa o do projeto)

### Credencial (`credentialId`) · avançado

A conta do Claude usada por este agente.

- Padrão: Vazio (usa a do projeto)

### Expandir comandos do prompt (`expandPromptCommands`) · avançado

Troca cada !`comando` do prompt pelo que o comando imprime, antes de enviar ao agente.

- Padrão: Ligado

## Exemplos

### Reviewer que devolve aprovado + notas

Revisa as mudanças do item e devolve approved (sim/não, obrigatório) e notes (texto). Use o preset Aprovação; a Decisão seguinte olha approved.

```json
{
  "prompt": "Revise as mudanças de {{item.title}}.",
  "workspace": "item",
  "outputSchema": {
    "type": "object",
    "properties": {
      "approved": {
        "type": "boolean"
      },
      "notes": {
        "type": "string"
      }
    },
    "required": [
      "approved"
    ]
  }
}
```

## Erros comuns

- Confundir repetições do prompt com novas tentativas.
- Esperar que o agente lembre do nó anterior sem ligar Resumo em texto → Contexto extra.

## Relacionados

- [Decisão](condition.md)
- [Comando](script.md)
- [Loop](loop.md)

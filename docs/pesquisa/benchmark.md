# Benchmark — Forja

Data da pesquisa: 2026-11-03

Fontes: READMEs, documentação oficial e artigos (lista no fim). Nenhum produto foi instalado e executado;
afirmações de páginas de marketing estão marcadas como tal.

## Resumo executivo

O mercado de orquestração de agentes de código se divide em quatro famílias que não se encontram:
**motores sem interface** (Sandcastle, claude-flow), **control planes em forma de board/organograma**
(Paperclip, Vibe Kanban, Claude Squad, agent teams do próprio Claude Code), **canvases que desenham mas
operam pouco** (RondoFlow, Claude Workflow Composer, CC Workflow Studio, Opaal — este já arquivado) e
**agentes autônomos fechados** (Devin, Factory, Copilot coding agent). Construtores visuais genéricos (n8n,
LangGraph Studio) resolvem muito bem a UX de "ver e depurar uma execução nó a nó", mas não conhecem
repositório, worktree, PR nem limite de uso do Claude Code.

O espaço da Forja: **um canvas editável que é a própria linha de montagem em execução** — com itens
(issues) fluindo como fichas, concorrência limitada visível (Dev ×3, Reviewer ×1), loops com teto, logs por
nó, board derivado do fluxo e operação AFK que sobrevive a limites de uso. A Forja tem **motor e runtime próprios**
(worktree + Docker por item + adaptador direto do `claude -p` stream-json), aproveitando do Sandcastle as ideias que deram
certo no pipeline atual (workspace por branch, iterações com sinal de conclusão, comandos de contexto no prompt), mas sem
depender dele — decisão do produto para poder mudar o funcionamento e acrescentar recursos no futuro (2026-11-04).

## Sistemas analisados

### Sandcastle — motor/biblioteca — github.com/mattpocock/sandcastle (npm `@ai-hero/sandcastle`)

- O que é: biblioteca TypeScript (MIT) para rodar agentes de código em sandbox. Versão usada pelo autor do
  projeto: 0.12.0 (pipeline em produção em `auto-development/.sandcastle/main.mts`).
- Como modela fluxo: em código. `createSandbox({ branch, sandbox: docker({ env }), hooks })` cria um
  container com o worktree montado; `sandbox.run({ agent: claudeCode(model, { effort, permissionMode }),
promptFile, promptArgs, maxIterations, idleTimeoutSeconds, output: Output.object({ tag, schema }),
logging: { type: "file", path, onAgentStreamEvent }, signal })` roda um agente; vários `run` compartilham
  o mesmo sandbox/branch. Paralelismo e loops ficam a cargo de quem escreve o script.
- Observabilidade: arquivo de log por run e callback `onAgentStreamEvent` (`text`, `toolCall`, `raw`) —
  exatamente o necessário para logs ao vivo. `IterationResult` traz `sessionId` e `usage` (input, output,
  cache read/creation). `resume()` continua a sessão.
- Pontos fortes: isolamento real (Docker/Podman/nativo/nuvem), branch strategies, saída estruturada,
  hooks (`npm i`, `codegraph init`), cancelamento por `AbortSignal`, multiagente (Claude Code, Codex, OpenCode...).
- Pontos fracos: sem UI, sem schedule, sem board, sem persistência de estado; o usuário mantém um script
  de ~800 linhas com guarda de limite de uso escrita à mão (`usage_guard.mts`).
- O que vale copiar: o modelo de workspace por branch montado em container, iterações em contexto limpo até um sinal de
  conclusão, comandos de contexto no prompt, saída estruturada validada, hooks de setup (`npm i`, `codegraph init`). Decisão:
  **reimplementar no runtime próprio da Forja** em vez de usar como dependência (controle total sobre o funcionamento).

### Paperclip — control plane — github.com/paperclipai/paperclip (`npx paperclipai onboard`)

- O que é: app Node + React (MIT) que gerencia agentes como empresa: organograma, metas, tickets,
  orçamento mensal por agente, "heartbeats" (agentes acordam em intervalos), humano como "board" que aprova.
  Tração alta (relatos de ~70 mil estrelas em 2026).
- Fluxo: hierarquia e delegação (CTO delega a engenheiros); sem DAG, loop ou concorrência explícitos — o
  próprio guia diz que ele "não define como a tarefa é feita".
- Execução: progresso no dashboard e na aba de issues; audit log; Postgres embutido.
- Pontos fortes: orçamento por agente, governança/aprovação, adaptadores (Claude Code, Codex, HTTP).
- Pontos fracos: não mostra o fluxo; overhead para pipelines simples; resenha de 2026 diz que "a orquestração
  funciona, a promessa de empresa autônoma ainda não".
- O que vale copiar: orçamento por agente com parada automática; aprovações como cidadãs de primeira classe.

### RondoFlow — canvas para Claude Code — rondoflow-landing.pages.dev (landing; código não verificado)

- O que é: canvas local (MIT) para orquestrar Claude Code: nós de agente, skill, policy, MCP, webhook,
  HTTP; DAG paralelo com condições; papéis Planner (antes), Director (durante), Advisor (depois); cron.
- Stack: Next.js, React Flow, Fastify, PostgreSQL/Prisma, Socket.IO; `docker compose up`.
- Execução: "status ao vivo em streaming", feed de atividade, audit log, reanexar a uma execução.
- Pontos fortes: concorrente mais direto; políticas de segurança por agente ("mais restritivo vence").
- Pontos fracos (da própria página): Windows só via WSL; exige Docker e Postgres; loops, limites de
  concorrência e board de itens não descritos.
- O que vale copiar: políticas por nó; reanexar a execução; Director como ideia Pós-MVP.

### Claude Workflow Composer — canvas + export — github.com/fayzan123/claude-workflow-composer

- O que é: servidor local Express + UI React Flow (`npx claude-cwc`), MIT, ~37 estrelas.
- Fluxo: arquivo `.cwc` (nós, arestas "handoffs", gates, nós terminais); fan-out; loop como skill com
  retry. Exporta para `.claude/` (skills e agentes).
- Execução: "test run" headless; **nó ativo pulsa, concluídos ganham check**, timeline JSONL; worktree por
  run em branch `cwc/<runId>`; gate pausa, posta diff numa caixa de aprovação e retoma na mesma sessão;
  cron + webhook local; sem banco (arquivos em `~/.cwc/`).
- Pontos fracos: a execução é um orquestrador único delegando a sub-agentes (não há contexto limpo por nó);
  test run usa `--permission-mode bypassPermissions`; serviço em background só no macOS.
- O que vale copiar: UX de nó pulsando + timeline; gate com diff; "apply/discard" do resultado.

### CC Workflow Studio — extensão VS Code (open-vsx `breaking-brake/cc-wf-studio`)

- Canvas dentro do VS Code que exporta workflows como Markdown para o Claude Code; servidor MCP permite que
  o Claude edite o fluxo. Não orquestra execução concorrente. Licença AGPL.
- O que vale copiar: fluxo editável também pelo próprio agente (MCP) — Pós-MVP.

### Opaal — Electron — github.com/Agravak/opaal

- Colunas = fases (sequenciais), cartões = agentes (paralelos na coluna); gera um prompt para o Claude Code.
  **Arquivado em 13/04/2026.** Sem logs, sem schedule.
- O que vale copiar: o modelo mental "colunas sequenciais, paralelo dentro da coluna" é fácil de entender —
  o board da Forja usa a mesma leitura.

### Vibe Kanban — board de agentes — vibekanban.com

- Kanban para planejar, rodar e revisar vários agentes em worktrees isolados, com terminal por workspace.
  **Em sunset** (segue como open source comunitário).
- O que vale copiar: worktree automático por cartão; revisão de diff no cartão. Lição: board sozinho não
  segurou o produto — falta o fluxo multi-etapa.

### Claude Squad / agtx — TUI

- Vários agentes em paralelo via tmux + worktrees. Simples; sem fluxo, sem board rico, sem schedule.

### claude-flow — framework CLI

- Swarms/hive-mind sobre o Claude Code, MIT, pausa/retomada. Sem canvas; curva de aprendizado alta.

### Agent teams e agent view do Claude Code — code.claude.com/docs/en/agent-teams

- Recurso oficial **experimental** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): um líder e colegas (instâncias
  separadas, cada uma com seu contexto), lista de tarefas compartilhada com dependências e mailbox em arquivos
  em `~/.claude/teams/`. Painel no terminal; split panes exigem tmux/iTerm2 (não Windows Terminal).
- Limitações documentadas: um time por sessão, sem times aninhados, líder fixo, sem modo de permissão por
  colega, status de tarefa pode atrasar, **não funciona em `-p`**. "Usa significativamente mais tokens."
- "Agent view" (research preview, segundo artigo da CloudZero): dashboard em terminal de sessões em background.
- Lição: a Anthropic valida a demanda por paralelismo, mas o modelo é conversacional (colegas conversando),
  não uma linha de montagem determinística, e não tem visual de fluxo nem board.

### ForgeAI — "fábrica de software autônoma" — github.com/pmadalozzo/ForgeAI

- README em português; papéis fixos (PM, Arquiteto, Front, Back, QA...); UI de "escritório virtual 2D" com
  bonecos animados; modos Autopilot/Approve/Watch/Pair; React Flow + Fastify + BullMQ/Redis + Supabase.
  Em desenvolvimento, 0 estrelas. Modelo de fluxo/paralelismo não documentado.
- Lição: o visual "escritório" é divertido mas não responde "onde está a issue 42 e quanto custou";
  os modos de supervisão (Autopilot/Approve/Watch) são uma boa ideia de configuração por fluxo.

### n8n — workflow visual genérico — docs.n8n.io

- Lista de execuções com status, duração e gatilho; clicar no nó mostra entrada e saída daquela execução;
  "Debug in editor" copia os dados de uma execução passada para o editor e fixa ("pin") no primeiro nó.
- O que vale copiar: **inspecionar entrada/saída por nó** e **reexecutar a partir de dados de uma run passada**.

### LangGraph Studio — IDE de grafos de agentes

- Interrupções antes/depois de nós, checkpoints, "time travel" (inspecionar qualquer checkpoint, editar o
  estado e criar um fork). Atrelado ao LangGraph.
- O que vale copiar: retomar/repetir a partir de um nó com o estado salvo (nossas saídas persistidas por
  `NodeRun` permitem isso).

### Agentes autônomos fechados (Devin, Factory, Copilot coding agent, Codex cloud)

- Issue → PR na nuvem, sessões observáveis. Caixa-preta: o usuário não desenha a linha de montagem, paga por
  assento/uso e não roda localmente. Não verificados nesta rodada (fora do foco local).

## Claude Code headless: capacidades confirmadas (code.claude.com, 2026-11-03)

- `-p` com `--output-format text|json|stream-json` (+ `--verbose`), `--input-format stream-json`.
- `--model`, `--effort low|medium|high|xhigh|max|ultracode`, `--max-turns`, `--max-budget-usd`.
- `--json-schema` → resultado validado em `structured_output` (print mode).
- `--allowedTools` / `--disallowedTools`, `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions|manual`.
- `--mcp-config` (arquivo ou JSON; espera até `MCP_TIMEOUT`), `--strict-mcp-config`, `--append-system-prompt`,
  `--settings`, `--add-dir`, `--resume`, `--session-id`, `--bare`, `--no-session-persistence`.
- Eventos `stream-json`: `system/init` (modelo, ferramentas, `mcp_servers` com status), `assistant`, `user`,
  `system/api_retry`, `result` final (subtypes `success`, `error_max_turns`, `error_during_execution`,
  `error_max_budget_usd`, `error_max_structured_output_retries`; `total_cost_usd`, `usage`, `modelUsage`,
  `num_turns`, `session_id`, `duration_ms`, `permission_denials`, `structured_output`).
- Autenticação: `ANTHROPIC_API_KEY` (sempre usada em `-p` se presente; sobrepõe a assinatura) ou
  `CLAUDE_CODE_OAUTH_TOKEN` gerado por `claude setup-token` (assinatura, válido por um ano).
- Com o adaptador próprio, todas essas flags são usadas diretamente por nó — inclusive `--mcp-config --strict-mcp-config`
  e `--allowedTools`/`--disallowedTools`, o que permite perfil de ferramentas por nó sem tocar no repositório (validar no
  container: tarefa humana HUM-03).

## Matriz de funcionalidades

Legenda: ✅ completo · ◐ parcial · ❌ não tem · ? não verificado.

| Capacidade                             | Sandcastle  | Paperclip       | RondoFlow | CWC           | Vibe Kanban   | Agent teams | n8n | Classificação |
| -------------------------------------- | ----------- | --------------- | --------- | ------------- | ------------- | ----------- | --- | ------------- |
| Fluxo definido visualmente             | ❌          | ❌              | ✅        | ✅            | ❌            | ❌          | ✅  | obrigatória   |
| Editar e executar o mesmo artefato     | ❌          | ❌              | ✅        | ◐ (export)    | ❌            | ❌          | ✅  | obrigatória   |
| Contexto limpo por etapa               | ✅          | ✅              | ?         | ❌            | ✅            | ✅          | n/a | diferencial   |
| Portas de entrada/saída tipadas        | ◐ (Output)  | ❌              | ?         | ◐ (artefatos) | ❌            | ❌          | ✅  | diferencial   |
| Loop com condição e teto               | código      | ❌              | ?         | ◐             | ❌            | ❌          | ◐   | **lacuna**    |
| Concorrência limitada visível (map ×N) | código      | ❌              | ◐ (DAG)   | ◐             | ◐             | ◐           | ◐   | **lacuna**    |
| Execução ao vivo no grafo              | ❌          | ❌              | ✅        | ✅            | n/a           | ❌          | ◐   | obrigatória   |
| Logs por etapa                         | ◐ (arquivo) | ◐               | ✅        | ✅            | ✅            | ◐           | ✅  | obrigatória   |
| Entrada/saída por nó e reexecução      | ❌          | ❌              | ?         | ◐             | ❌            | ❌          | ✅  | diferencial   |
| Board de itens derivado do fluxo       | ❌          | ◐ (tickets)     | ❌        | ❌            | ◐ (manual)    | ◐ (tasks)   | ❌  | **lacuna**    |
| GitHub Issues → PR                     | código      | ◐               | ?         | ❌            | ◐             | ❌          | ◐   | obrigatória   |
| Isolamento Docker por nó               | ✅          | ❌              | ✅        | ❌ (worktree) | ❌ (worktree) | ❌          | n/a | diferencial   |
| Gates humanos                          | código      | ✅              | ✅        | ✅            | ◐             | ◐ (hooks)   | ✅  | obrigatória   |
| Schedules (cron)                       | ❌          | ◐ (heartbeat)   | ✅        | ✅            | ❌            | ❌          | ✅  | obrigatória   |
| Retomada automática após limite de uso | código      | ❌              | ?         | ❌            | ❌            | ❌          | n/a | **lacuna**    |
| Orçamento/custo por etapa              | ◐ (usage)   | ✅ (por agente) | ◐         | ❌            | ❌            | ❌          | n/a | diferencial   |
| Modelo/effort por etapa                | ✅          | ✅              | ?         | ✅            | ◐             | ◐           | n/a | obrigatória   |
| MCP/ferramentas por etapa              | ◐ (imagem)  | ◐               | ✅        | ✅            | ❌            | ❌          | n/a | diferencial   |
| Credenciais gerenciadas na UI          | ❌          | ◐               | ?         | ❌            | ◐             | n/a         | ✅  | obrigatória   |
| Windows nativo sem WSL                 | ✅ (Docker) | ✅              | ❌        | ✅            | ✅            | ◐           | ✅  | diferencial   |
| Fluxo exportável em arquivo            | código      | ❌              | ?         | ✅            | ❌            | ❌          | ✅  | obrigatória   |

## Dores dos usuários

- **Quota consumida rápido em paralelo**: sessões em background contam como interativas; 10 agentes = 10× mais
  rápido (citação atribuída à doc da Anthropic pela CloudZero); limites por minuto (TPM) estouram mesmo com
  quota sobrando ao subir vários Opus juntos. → concorrência global limitada + escalonamento de início + modelo por nó.
- **Multiagente custa 2–7× mais tokens** (relatos e artigos) e não há teto por tarefa nos harnesses → orçamento
  por run/nó/item, custo visível por nó e por iteração de loop.
- **Execuções AFK morrem no limite** — o próprio usuário mantém um `usage_guard.mts` que lê "resets 3pm
  (America/Sao_Paulo)" e espera. → pausa/retomada nativa + gatilho `usage.limit_reset`.
- **Agentes pisando um no outro** no mesmo arquivo/branch (guia de agent teams recomenda evitar dois colegas no
  mesmo arquivo) → um sandbox/branch por item; source respeita "bloqueada por".
- **Falta de visibilidade** ("o que está rodando, em qual issue, por que travou") → canvas ao vivo, timeout por
  inatividade explícito, log por `NodeRun`.
- **Windows de segunda classe** (RondoFlow só WSL; split panes não funcionam no Windows Terminal) → CI em Windows.
- **Ferramentas de terceiros pequenas e abandonadas** (Opaal arquivado, Vibe Kanban em sunset) → não depender de
  biblioteca de orquestração externa no núcleo (motor e runtime próprios) e manter fluxos exportáveis para não prender o usuário.

## Oportunidades priorizadas

| #   | Oportunidade                                     | Evidência                                                                                                                         | Impacto | Esforço | Decisão                                          | Requisitos             |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ------------------------------------------------ | ---------------------- |
| 1   | Canvas editável que é a execução ao vivo         | CWC/RondoFlow provam a UX; nenhum une com itens e board                                                                           | Alto    | Alto    | MVP                                              | RF-EDT-*, RF-OBS-01/02 |
| 2   | Grupo map com concorrência e fila visível        | Template TL→Dev×3→Reviewer×1; matriz: lacuna                                                                                      | Alto    | Médio   | MVP                                              | RF-RUN-02, RF-OBS-01   |
| 3   | Loop com condição e teto, custo por iteração     | Matriz: lacuna; dor de custo                                                                                                      | Alto    | Médio   | MVP                                              | RF-RUN-03, RF-OBS-05   |
| 4   | Retomada automática após limite de uso           | `usage_guard.mts` do usuário; matriz: lacuna                                                                                      | Alto    | Médio   | MVP                                              | RF-RUN-06, RF-TRG-01   |
| 5   | Board derivado do fluxo                          | Vibe Kanban/Paperclip só board; Opaal colunas                                                                                     | Alto    | Médio   | MVP                                              | RF-BRD-*               |
| 6   | Runtime próprio com Docker por item              | Requisito do usuário (Docker por nó; motor próprio para evoluir); flags do CLI cobrem effort, saída estruturada, MCP, ferramentas | Alto    | Médio   | MVP                                              | RNF-EXT-01, RF-RUN-08  |
| 7   | Orçamento e concorrência global                  | Dores de quota e TPM                                                                                                              | Alto    | Baixo   | MVP                                              | RF-RUN-07, RNF-CUS-01  |
| 8   | Entrada/saída por nó + repetir NodeRun           | n8n, LangGraph Studio                                                                                                             | Médio   | Médio   | MVP (repetir); Pós-MVP (fork com estado editado) | RF-OBS-02, RF-RUN-01   |
| 9   | Perfis de ferramentas (CodeGraph/MCP) por nó     | Dockerfile do usuário já usa CodeGraph                                                                                            | Médio   | Médio   | MVP                                              | RF-CFG-02              |
| 10  | Template que reproduz o pipeline Sandcastle      | `main.mts` do usuário                                                                                                             | Alto    | Médio   | MVP                                              | RF-EDT-08              |
| 11  | Políticas de permissão por nó                    | RondoFlow; CWC usa bypass                                                                                                         | Médio   | Baixo   | MVP (modo de permissão por nó)                   | RNF-SEG-03             |
| 12  | Modos de supervisão (Autopilot/Approve/Watch)    | ForgeAI                                                                                                                           | Médio   | Baixo   | Pós-MVP (gates cobrem o MVP)                     | —                      |
| 13  | Planner/Director/Advisor (IA que ajusta o fluxo) | RondoFlow                                                                                                                         | Médio   | Alto    | Pós-MVP                                          | —                      |
| 14  | Fluxo editável pelo próprio agente via MCP       | CC Workflow Studio                                                                                                                | Médio   | Médio   | Pós-MVP                                          | —                      |
| 15  | App desktop                                      | —                                                                                                                                 | Baixo   | Alto    | Pós-MVP                                          | —                      |

## Riscos e restrições

- **Runtime próprio**: mais código para manter (worktrees, containers, parsing do stream-json, encerramento de processos no
  Windows). Mitigação: tudo atrás de `AgentRuntime`; `CommandRunner` injetável; fixtures reais do CLI (HUM-02); testes de integração opcionais com Docker.
- **Mudanças no CLI/termos do Claude Code** (flags, contagem de uso, `setup-token`): adaptador isolado, diagnóstico
  da versão na tela de configurações.
- **Docker obrigatório no Windows** (Docker Desktop, desempenho de bind mount): premissa registrada; diagnóstico
  claro quando o Docker não está disponível.
- **Segurança**: agentes rodam com permissões amplas dentro do container (`bypassPermissions` dentro do container
  é o padrão). O container é a fronteira; nunca montar o home do usuário nem segredos fora do env.
- **Nome**: `forja` no npm está retido pelo npm (pacote removido); há repos homônimos no GitHub, incluindo
  `nandomoreirame/forja` ("GUI client for vibe coders", 12 estrelas). Distribuir como pacote com escopo.
- **Concorrência dominante**: a Anthropic pode lançar um visual oficial para agent teams; o diferencial deve
  continuar sendo a linha de montagem determinística, local, com board e custos.

## Fontes

- Sandcastle README — https://raw.githubusercontent.com/mattpocock/sandcastle/main/README.md (2026-11-03); tipos de `@ai-hero/sandcastle@0.12.0` lidos localmente
- Paperclip — https://betterstack.com/community/guides/ai/paperclip-multi-agent/ ; https://www.hostinger.com/tutorials/what-is-paperclip-ai/ ; https://fast.io/resources/paperclip-ai-review-2026/ (2026-11-03)
- RondoFlow — https://rondoflow-landing.pages.dev/ (2026-11-03)
- Claude Workflow Composer — https://github.com/fayzan123/claude-workflow-composer (2026-11-03)
- CC Workflow Studio — https://open-vsx.org/extension/breaking-brake/cc-wf-studio (2026-11-03)
- Opaal — https://github.com/Agravak/opaal (2026-11-03)
- Vibe Kanban — https://vibekanban.com/ ; https://virtuslab.com/blog/ai/vibe-kanban/ (2026-11-03)
- agtx — https://awesome.ecosyste.ms/projects/github.com%2Ffynnfluegge%2Fagtx (2026-11-03)
- claude-flow — https://jimmysong.io/en/ai/claude-flow (2026-11-03)
- ForgeAI — https://github.com/pmadalozzo/ForgeAI (2026-11-03)
- Claude Code agent teams — https://code.claude.com/docs/en/agent-teams (2026-11-03)
- Claude Code CLI e headless — https://code.claude.com/docs/en/cli-reference ; https://code.claude.com/docs/en/headless ; https://code.claude.com/docs/en/authentication ; https://code.claude.com/docs/en/agent-sdk/typescript (2026-11-03)
- Custos de agentes paralelos — https://www.cloudzero.com/blog/claude-code-agents/ ; https://www.mindstudio.ai/blog/claude-code-subagents-cost-tokens (2026-11-03)
- n8n — https://docs.n8n.io/workflows/executions/debug (2026-11-03)
- LangGraph time travel — https://docs.langchain.com/oss/javascript/langchain/frontend/time-travel (2026-11-03)
- Visual builders — https://github.com/Jacobcdsmith/agent-flow-canvas ; https://www.firecrawl.dev/blog/open-agent-builder (2026-11-03)
- Nome — `npm view forja` (pacote retido pelo npm) e `gh search repos forja` (2026-11-03)

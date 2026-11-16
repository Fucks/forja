---
key: UX-10
title: "Comando no motor: container isolado, variáveis de ambiente, falha por exit code e saída JSON"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:motor, area:harness]
depends_on: [UX-07]
---

## Contexto

Atende RF-EDT-13 (épico #185). O nó `script` (na tela, "Comando" desde #{UX-01}) é limitado
(`src/shared/node_configs/script_config.ts`, `src/server/runtime/executors/script_executor.ts`):

- só roda no workspace de um item (`workspace: z.literal("item")`) e lança erro sem item (`acquireItemWorkspace`);
- não tem variáveis, ambiente nem diretório de trabalho;
- **nunca falha por exit code**: devolve `{ exitCode, stdoutTail }` e termina SUCCEEDED, o que surpreende quem espera
  "teste quebrado = nó vermelho";
- não lê saída estruturada, então um comando não consegue devolver dados para uma Decisão;
- `ExecResult` (`src/integrations/agent_runtime/agent_runtime.ts`) não separa stderr.

## Objetivo

O Comando roda no container do item **ou** num container isolado, sem item. Aceita shell, diretório, variáveis de
ambiente (texto com `{{...}}` ou credencial do cofre) e escolhe falhar ou continuar quando o exit code é diferente de
zero. Pode transformar o stdout em JSON, e as variáveis entram no comando sem risco de injeção.

## Escopo

**Inclui:** config nova; executor; `execHeadless` no runtime; stderr separado; variáveis `FORJA_*`; render de `{{...}}`
com shell-quoting; mascaramento de credenciais; formato fixo da saída em `node_output_shapes.ts`; validação; doc do
nó.
**Não inclui:** a tela (#{UX-11}); rodar no host (fora do escopo, por segurança).

## Especificação técnica

### Arquivos

Criar:

- `src/server/runtime/executors/script_environment.ts` (`buildScriptEnvironment(context, config): Promise<Record<string,string>>`
  e `renderCommand(command, data): string` com shell-quoting)
- `src/server/runtime/executors/script_environment.test.ts`
- `src/server/runtime/executors/script_output.ts` (`parseScriptOutput(stdout, mode)`)
- `src/server/runtime/executors/script_executor.test.ts`

Alterar:

- `src/shared/node_configs/script_config.ts`
- `src/shared/node_defaults.ts` (nós novos: `runIn: "item"`, `onFailure: "fail"`, saídas `result:json` e `output:text`)
- `src/shared/node_output_shapes.ts` (formato novo de `script.result` e `script.output`)
- `src/server/runtime/executors/script_executor.ts`
- `src/integrations/agent_runtime/agent_runtime.ts` (`ExecOptions` ganha `env?`, `cwd?` e `shell?`; `ExecResult` ganha
  `stderrTail`; `AgentRuntime` ganha `execHeadless(spec: HeadlessSpec, command: string, options: ExecOptions): Promise<ExecResult>`)
- `src/integrations/agent_runtime/docker_workspace.ts` e `docker_agent_runtime.ts` (env, cwd, shell, stderr e
  `execHeadless` com container efêmero da imagem do projeto e repositório **somente leitura**, igual ao `workspace:
  "none"` do agente)
- `src/test/fakes/fake_agent_runtime.ts` (`execHeadless` roteirizável; registra env, cwd e shell recebidos)
- `src/engine/validation_rules/port_rules.ts` (entrada `item` obrigatória só com `runIn: "item"`; e, no mesmo arquivo,
  as regras do Comando: comando vazio é erro, `image` só com `isolated`, nome de env duplicado é erro). **Não** mexa no
  registro `validation_issues.ts`: #{UX-09} o altera em paralelo.
- `src/engine/node_scopes.ts`, se necessário (Comando `isolated` fora de Map é por run)
- `src/web/docs/node_docs/script_doc.ts` e `docs/nos/script.md` (campos novos, variáveis `FORJA_*`, presets e exemplos)

### Contratos

```ts
export const SCRIPT_RUN_LOCATIONS = ["item", "isolated"] as const;
export const SCRIPT_SHELLS = ["bash", "sh"] as const;
export const SCRIPT_FAILURE_POLICIES = ["fail", "continue"] as const;
export const SCRIPT_OUTPUT_MODES = ["none", "json", "lastLineJson"] as const;

export const scriptEnvVarSchema = z.object({
    name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
    value: z.string().optional(),          // aceita {{caminho}} do DataContext
    credentialId: z.string().optional(),   // exatamente um de value/credentialId
});

export const scriptConfigSchema = z.object({
    command: z.string(),
    shell: z.enum(SCRIPT_SHELLS).default("bash"),
    runIn: z.enum(SCRIPT_RUN_LOCATIONS).default("item"),
    image: z.string().optional(),
    workingDir: z.string().optional(),
    env: z.array(scriptEnvVarSchema).default([]),
    // Padrão "continue" preserva os nós existentes; nós novos nascem com "fail" (node_defaults).
    onFailure: z.enum(SCRIPT_FAILURE_POLICIES).default("continue"),
    parseOutput: z.enum(SCRIPT_OUTPUT_MODES).default("none"),
    timeoutMinutes: z.int().min(MIN_SCRIPT_TIMEOUT_MINUTES).default(DEFAULT_SCRIPT_TIMEOUT_MINUTES),
});
// O campo antigo `workspace: "item"` continua aceito na leitura e é descartado (z.preprocess no schema).

export interface ScriptResult {
    exitCode: number;
    passed: boolean;         // exitCode === 0
    stdout: string;          // últimas 200 linhas
    stderr: string;          // últimas 200 linhas
    durationMs: number;
    data?: unknown;          // parseOutput
}
```

### Semântica

- **Variáveis sempre presentes:** `FORJA_RUN_ID`, `FORJA_PROJECT_BASE_BRANCH`, `FORJA_ITERATION`; com item, também
  `FORJA_ITEM_ID`, `FORJA_ITEM_NUMBER`, `FORJA_ITEM_TITLE`, `FORJA_ITEM_BRANCH` e `FORJA_ITEM_URL`; e
  `FORJA_INPUT_<PORTA_EM_MAIUSCULAS>` com o JSON de cada entrada. As variáveis do usuário vêm depois e podem
  sobrescrever as `FORJA_*`, exceto `FORJA_RUN_ID`.
- **`{{...}}` no comando:** é renderizado com o `DataContext` (#{UX-06}), e **todo valor é shell-quoted** (aspas simples
  com escape de `'`). Título `x'; rm -rf / #` vira um único argumento literal. Variável sem valor → falha do nó com a
  mesma mensagem do prompt (`Variável sem valor no comando: {{...}}`).
- **Credenciais:** `credentialId` é resolvido pelo `RunCredentials` que o executor já recebe. O valor nunca é gravado
  em `inputs` nem em artefatos, e entra na lista de mascaramento dos logs. Se não houver mascaramento pronto em
  `log_store.ts`, troque o valor por `••••` nas linhas emitidas pelo próprio executor.
- **`onFailure`:** com `fail`, exit ≠ 0 termina o NodeRun FAILED com o código `script_failed` e a mensagem
  "O comando terminou com código <n>", e a política de retentativa dos executores se aplica. Com `continue`, termina
  SUCCEEDED com `passed: false`, que é o comportamento atual. Timeout e erro de workspace falham sempre.
- **`parseOutput`:** `json` faz `JSON.parse` do stdout inteiro; `lastLineJson` faz o parse da última linha não vazia.
  JSON inválido → `data` ausente e a linha de log "Saída não é JSON válido; `data` ficou vazio". **Não** falha o nó.
- **`isolated`:** usa `runtime.execHeadless` e não exige item. Fora de Map, roda uma vez por run. `image` vazio usa a
  imagem do agente do projeto.
- **Cancelamento:** o `signal` aborta o processo no container, como hoje.
- **Saídas:** `result` = `ScriptResult`; `output` = stdout completo truncado a 200 linhas (texto), para ligar no
  `context` de um Agente.

### Passo a passo

1. Amplie `ExecOptions`/`ExecResult` e o fake; separe o stderr no Docker.
2. Escreva `renderCommand` e `buildScriptEnvironment` com testes de injeção primeiro.
3. Reescreva o executor com `runIn`, `onFailure` e `parseOutput`.
4. Implemente `execHeadless` no runtime Docker.
5. Atualize defaults, validação, formatos fixos e documentação.
6. Confirme que `review_loop.ts` e `sandcastle_pipeline.ts` continuam verdes (os nós deles ficam com `continue` por
   padrão).

## Critérios de aceite

- [ ] O Comando novo (`onFailure: "fail"`) com `exit 1` termina FAILED com `script_failed`; com `continue`, termina
      SUCCEEDED com `passed: false`.
- [ ] Um nó `script` antigo (sem os campos novos) mantém o comportamento atual.
- [ ] `runIn: "isolated"` roda sem item, chama `execHeadless` e é válido fora de Map.
- [ ] `echo {{item.title}}` com o título `a'; touch /tmp/pwn #` imprime o título literal (teste com o fake verificando o
      comando renderizado).
- [ ] O valor de credencial não aparece em logs, inputs nem artefatos.
- [ ] `parseOutput: "lastLineJson"` com a última linha `{"coverage": 81}` gera `result.data.coverage = 81`, visível no
      `DataPicker` como `object`.
- [ ] Comando vazio, env duplicado e `image` com `runIn: "item"` são erros de validação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `script_environment.test.ts`: quoting (aspas, `$()`, crases, quebra de linha), variáveis `FORJA_*`, precedência e
  variável sem valor.
- `script_executor.test.ts` (`FakeAgentRuntime`): `onFailure` × exit code, `parseOutput` (válido, inválido, última
  linha), `isolated` sem item, timeout, cancelamento e mascaramento.
- `deterministic_executors.test.ts`: o loop do `buildLoopFlow()` continua saindo na iteração 2.
- Testes de validação para as regras novas.

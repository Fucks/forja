---
key: UX-11
title: "Comando no inspector: presets, onde roda, variáveis de ambiente e controle de falha"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor]
depends_on: [UX-10, UX-09, UX-08]
---

## Contexto

Atende RF-EDT-13 (épico #185). #{UX-10} deu ao Comando os campos `shell`, `runIn`, `image`, `workingDir`, `env`,
`onFailure` e `parseOutput`, mas o inspector (`src/web/canvas/inspector/script_inspector.tsx`) ainda mostra só "Comando"
e "Timeout". O usuário leigo precisa de pontos de partida (presets) e de opções explicadas.

## Objetivo

O inspector do Comando tem presets, cartões para "Onde roda" e "Se o comando falhar", editor de comando multilinha com
"Inserir dado", lista de variáveis de ambiente (texto ou credencial), "Formato da saída" e, em "Avançado", shell,
diretório e imagem. O nó mostra um resumo legível.

## Escopo

**Inclui:** presets; campos novos; `EnvListEditor`; resumo do nó; aviso de segurança sobre `{{...}}` × variáveis de
ambiente.
**Não inclui:** mudanças no executor (#{UX-10}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/canvas/inspector/script_presets.ts`
- `src/web/canvas/inspector/env_list_editor.tsx`
- `src/web/canvas/inspector/script_inspector.test.tsx`

Alterar:

- `src/web/canvas/inspector/script_inspector.tsx`
- `src/web/canvas/inspector/prompt_editor.tsx`, se preciso (reutilizado em modo "shell" para o comando: realce de
  `{{...}}`, mono, multilinha)
- `src/web/canvas/nodes/node_summary.ts` (Comando: "`npm test` · container do item · falha se ≠ 0"; isolado:
  "`./report.sh` · container isolado · continua se ≠ 0")
- `src/web/canvas/nodes/node_summary.test.ts`

### Contratos

```ts
export interface ScriptPreset {
    id: "tests" | "typecheck" | "lint" | "install" | "make" | "custom";
    label: string;          // "Rodar testes"
    description: string;    // "Roda a suíte de testes; falha se algum teste quebrar."
    config: Partial<ScriptConfig>;
}
export const SCRIPT_PRESETS: ScriptPreset[];
// tests: { command: "npm test", runIn: "item", onFailure: "fail" }
// typecheck: { command: "npm run typecheck", ... }   lint: { command: "npm run lint", ... }
// install: { command: "npm ci", onFailure: "fail" }   make: { command: "make <alvo>" }   custom: {}
```

### Comportamento

- Os presets aparecem como chips acima do comando. Aplicar um preset com o comando já preenchido pede confirmação
  inline ("Substituir o comando atual?", com botões Substituir e Cancelar; **não** use `window.confirm`).
- "Onde roda" (`OptionCards`): *Container do item*: "Na cópia do código deste item, onde os agentes trabalham. Use para
  testes, lint e build."; *Container isolado*: "Num container novo, sem o código do item. Use para tarefas que não
  dependem da branch."
- "Se o comando falhar" (`OptionCards`): *Marcar o nó como falho* (recomendado) e *Continuar e deixar uma Decisão
  julgar*. A segunda opção mostra a dica "Ligue `Resultado › passed` a uma Decisão".
- "Inserir dado" no comando abre o `DataPicker` (#{UX-07}). Abaixo do editor fica o aviso fixo: "Valores inseridos com
  {{…}} entram entre aspas. Para textos longos, prefira as variáveis FORJA_* (ex.: `$FORJA_ITEM_TITLE`)." Um link abre
  a lista completa das variáveis (seção da documentação).
- `EnvListEditor`: linhas `NOME` (mono, validado em tempo real) · tipo "Texto" ou "Credencial" · valor (texto com
  "Inserir dado", ou select de credenciais do projeto). Adicionar, remover e reordenar.
- "Formato da saída" (`OptionCards`): *Texto* / *JSON (saída inteira)* / *JSON (última linha)*, com o exemplo de cada um.
- Avançado: `shell`, `workingDir` (placeholder "raiz do repositório"), `image` (só com isolado; placeholder "imagem do
  agente do projeto") e `timeoutMinutes`.

### Notas de design

- Superfície: inspector (#{UX-05}). O editor de comando tem no mínimo 4 linhas e cresce até 12.
- Estado de erro: o nome de env inválido mostra a mensagem embaixo do campo, além do ícone.

## Critérios de aceite

- [ ] Clicar em "Rodar testes" num Comando vazio preenche `npm test`, container do item e falha se ≠ 0.
- [ ] Aplicar um preset sobre um comando existente pede confirmação inline.
- [ ] Trocar para "Container isolado" mostra o campo de imagem em Avançado e remove o aviso de item obrigatório.
- [ ] Uma env do tipo "Credencial" lista as credenciais do projeto e grava `credentialId`.
- [ ] `FOO-BAR` como nome de env mostra o erro inline.
- [ ] O resumo do nó reflete `runIn` e `onFailure`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `script_inspector.test.tsx`: presets, confirmação, cartões, env (texto e credencial), formato de saída e avançado.
- `node_summary.test.ts`: os resumos novos.

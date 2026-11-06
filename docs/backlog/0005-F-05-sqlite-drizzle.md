---
key: F-05
title: "SQLite com Drizzle e migrador por domínio"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-04]
---

## Contexto

Armazenamento próprio é requisito (RNF-LOC-01): SQLite em `~/.forja/forja.db`. Muitas issues paralelas vão criar
tabelas; um journal de migrações compartilhado (drizzle-kit) geraria conflito em todo PR. Por isso usamos
**migrações SQL por domínio** com prefixo numérico (faixas no `docs/backlog/_plano.md`) e um migrador próprio; o
Drizzle é só o query builder tipado.

## Objetivo

Existe `openDatabase(path)` que abre o SQLite em WAL e aplica as migrações pendentes em ordem, e `createTestDb()`
que faz o mesmo em memória para os testes.

## Escopo

**Inclui:** cliente `better-sqlite3` + Drizzle, `migrate.ts`, tabela `_migrations`, helper de teste, integração no `buildApp`.
**Não inclui:** tabelas de domínio (cada domínio cria a sua).

## Especificação técnica

### Arquivos

Criar:

- `src/server/db/client.ts`
- `src/server/db/migrate.ts`
- `src/server/db/migrations/0001_init.sql`
- `src/server/db/schema/meta.ts`
- `src/test/test_db.ts`
- `src/server/db/migrate.test.ts`
  Alterar:
- `src/server/app.ts` (`AppDeps` ganha `db: ForjaDb`)
- `src/server/main.ts` (abre o banco em `paths.database`)

### Contratos

```ts
export type ForjaDb = BetterSQLite3Database;
export interface DatabaseHandle {
    db: ForjaDb;
    sqlite: Database.Database;
    close(): void;
}
export function openDatabase(filePath: string | ":memory:", migrationsDir?: string): DatabaseHandle;

export interface Migration {
    id: string;
    sql: string;
} // id = nome do arquivo sem extensão
export function loadMigrations(dir: string): Migration[]; // ordenadas pelo nome
export function applyMigrations(
    sqlite: Database.Database,
    migrations: Migration[],
    now: Date,
): string[];

// src/test/test_db.ts
export function createTestDb(): DatabaseHandle; // :memory: + todas as migrações
```

- `0001_init.sql`: `_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` e `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
- Pragmas: `journal_mode = WAL` (não em `:memory:`), `foreign_keys = ON`, `busy_timeout = 5000`.
- Cada migração roda numa transação; falha aborta a abertura com erro que cita o arquivo.
- Convenção para todos os domínios: datas `TEXT` ISO-8601 UTC; ids `TEXT`; JSON em `TEXT` com `{ mode: "json" }` no Drizzle.
- Tabelas Drizzle ficam em `src/server/db/schema/<dominio>.ts` e são importadas diretamente (sem `index.ts`).

### Passo a passo

1. `loadMigrations` lê `*.sql` do diretório (padrão resolvido a partir de `import.meta.url`: `src/server/db/migrations` em dev, `dist/migrations` no build).
2. `applyMigrations` idempotente: pula ids já aplicados.
3. `openDatabase` aplica pragmas e migrações e devolve o Drizzle.
4. Integre em `main.ts`/`buildApp`; feche o banco no encerramento.
5. `createTestDb` para os testes de domínio.

## Critérios de aceite

- [ ] Abrir o banco duas vezes aplica cada migração uma única vez.
- [ ] Migrações rodam em ordem lexical do nome do arquivo.
- [ ] Migração com SQL inválido aborta com erro citando o arquivo e não registra o id.
- [ ] `createTestDb()` funciona sem tocar no disco.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `migrate.test.ts`: ordem, idempotência, falha transacional, `foreign_keys` ligado (com migrações de exemplo em diretório temporário).

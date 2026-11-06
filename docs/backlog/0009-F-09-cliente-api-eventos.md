---
key: F-09
title: "Cliente da API e hook de eventos no front"
type: issue
milestone: "Fase 0 — Fundação"
labels: [tipo:infra, area:fundacao]
depends_on: [F-04, F-06]
---

## Contexto

Todas as telas buscam dados da API e reagem aos eventos ao vivo de #{F-06}. Um cliente único com erros tipados e
um hook de SSE evitam que cada tela invente seu `fetch` e seu `EventSource`.

## Objetivo

Existem `apiClient` (fetch tipado com `ApiError`), o `QueryClient` configurado, `useEventStream(filter, onEvent)`
com reconexão e o formato padrão de erro da API.

## Escopo

**Inclui:** cliente HTTP, provider do TanStack Query, hook SSE, `ApiErrorBody` e error handler do Fastify.
**Não inclui:** token de sessão (#{QA-03} acrescenta o header aqui).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/api_types.ts`
- `src/web/api/api_client.ts`
- `src/web/api/query_client.ts`
- `src/web/api/use_event_stream.ts`
- `src/web/api/api_client.test.ts`
- `src/web/api/use_event_stream.test.tsx`
- `src/server/errors.ts`
- `src/server/errors.test.ts`
  Alterar:
- `src/server/app.ts` (registrar o error handler)
- `src/web/main.tsx` (envolver com `QueryClientProvider`)

### Contratos

```ts
// src/shared/api_types.ts
export interface ApiErrorBody {
    error: { code: string; message: string; details?: unknown };
}

// src/server/errors.ts
export class NotFoundError extends Error {} // → 404 not_found
export class ConflictError extends Error {} // → 409 conflict
export class DomainValidationError extends Error {
    details?: unknown;
} // → 422 invalid
export function registerErrorHandler(app: FastifyInstance): void; // Zod → 400 validation_error; desconhecido → 500 internal (sem stack)

// src/web/api/api_client.ts
export class ApiError extends Error {
    status: number;
    code?: string;
    details?: unknown;
}
export const apiClient: {
    get<T>(path: string, schema?: z.ZodType<T>): Promise<T>;
    post<T>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T>;
    put<T>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T>;
    delete<T>(path: string, schema?: z.ZodType<T>): Promise<T>;
};

// src/web/api/use_event_stream.ts
export function useEventStream(
    filter: { projectId?: string; runId?: string },
    onEvent: (envelope: EventEnvelope) => void,
    createSource?: (url: string) => EventSource,
): { connected: boolean };
```

Reconexão com backoff 1 s → 2 s → … → 30 s; `connected` reflete o estado.

### Passo a passo

1. `ApiErrorBody`, classes de erro de domínio e `registerErrorHandler`.
2. `apiClient` com prefixo `/api`, JSON, `ApiError`.
3. `QueryClient` com `retry: 1`, `staleTime: 5_000`.
4. `useEventStream` com `EventSource` injetável.

## Critérios de aceite

- [ ] Resposta 4xx/5xx vira `ApiError` com `status`, `code` e `message` do corpo.
- [ ] Resposta que não bate com o schema informado lança erro de validação.
- [ ] `useEventStream` entrega eventos, marca `connected` e reconecta após erro com backoff.
- [ ] Entrada inválida numa rota devolve 400 no formato `ApiErrorBody`; `NotFoundError` vira 404.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `api_client.test.ts`: sucesso, erro com corpo, erro sem corpo, schema inválido.
- `use_event_stream.test.tsx`: `EventSource` fake; recebe evento; reconecta com backoff (timers fake do Vitest).
- `errors.test.ts`: rota de teste lançando cada erro → status e corpo esperados.

---
key: CFG-02
title: "Credenciais: API e tela"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:credenciais]
depends_on: [CFG-01, PRJ-01, DS-04, F-09]
---

## Contexto

Atende RF-CFG-01. Para rodar agentes, a Forja precisa de uma credencial do Claude (API key ou o token de
`claude setup-token`, que usa a assinatura) e, para GitHub, de um token. Com o cofre de #{CFG-01}, esta issue cria o
CRUD e a tela. O teste real da credencial (rodar um agente mínimo) chega em #{RT-08}.

## Objetivo

O usuário cadastra, lista (mascarado), renomeia, substitui o valor e remove credenciais em
`/settings/credentials`, com o valor cifrado no banco e nunca devolvido pela API.

## Escopo

**Inclui:** tabela, repositório, service, rotas, tela, registro dos valores no redator ao carregar.
**Não inclui:** teste da credencial (#{RT-08}), credencial padrão do projeto (#{CFG-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/credential_types.ts`
- `src/server/db/migrations/0200_credentials.sql`
- `src/server/db/schema/credentials.ts`
- `src/server/credentials/credential_repository.ts`
- `src/server/credentials/credential_service.ts`
- `src/server/credentials/credentials_routes.ts`
- `src/server/credentials/credential_service.test.ts`
- `src/server/credentials/credentials_routes.test.ts`
- `src/web/app/settings/use_credentials.ts`
- `src/web/app/settings/credential_form_dialog.tsx`
- `src/web/app/settings/credentials_page.test.tsx`
  Alterar:
- `src/web/app/settings/credentials_page.tsx` (substituir o placeholder)
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)
- `src/server/app.ts` (`AppDeps` ganha `secrets: SecretBox`, `redactor: SecretRedactor`)
- `src/server/main.ts` (carregar chave mestra de `paths.masterKey`)

### Contratos

```ts
export const CREDENTIAL_KINDS = [
    "anthropic_api_key",
    "claude_oauth_token",
    "github_token",
    "generic_env",
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];
export interface CredentialSummary {
    id: string;
    name: string;
    kind: CredentialKind;
    masked: string;
    envVar: string;
    lastCheckedAt?: string;
    lastCheckOk?: boolean;
    createdAt: string;
    updatedAt: string;
}
export const ENV_VAR_BY_KIND: Record<Exclude<CredentialKind, "generic_env">, string> = {
    anthropic_api_key: "ANTHROPIC_API_KEY",
    claude_oauth_token: "CLAUDE_CODE_OAUTH_TOKEN",
    github_token: "GH_TOKEN",
};
export const credentialInput = z.object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(CREDENTIAL_KINDS),
    value: z.string().min(1),
    envVar: z
        .string()
        .regex(/^[A-Z_][A-Z0-9_]*$/)
        .optional(),
}); // envVar obrigatório para generic_env

export interface CredentialService {
    create(input: CredentialInput): Promise<CredentialSummary>;
    list(): Promise<CredentialSummary[]>;
    rename(id: string, name: string): Promise<CredentialSummary>;
    replaceValue(id: string, value: string): Promise<CredentialSummary>;
    remove(id: string): Promise<void>;
    revealForRuntime(id: string): Promise<{ envVar: string; value: string }>; // só uso interno, sem rota
    recordCheck(id: string, ok: boolean, at: Date): Promise<void>;
}
```

Tabela `credentials(id, name, kind, env_var, sealed_value, masked, last_checked_at, last_check_ok, created_at, updated_at)`.
Rotas: `GET/POST /api/credentials`, `PATCH /api/credentials/:id` (`name` e/ou `value`), `DELETE /api/credentials/:id`.
Nenhuma rota devolve `sealed_value` nem o valor. Auditoria entra em #{QA-03}.

### Passo a passo

1. Tipos compartilhados, migração, schema, repositório.
2. Service: `seal` ao gravar, `masked` com `maskSecret`, registra o valor no redator ao criar/substituir e, no boot, ao carregar todas.
3. Rotas.
4. Tela: tabela (nome, tipo, valor mascarado em mono, variável de ambiente, último teste), diálogo de criar/editar com campo de valor `type="password"` e botão "mostrar enquanto digito"; texto de ajuda para cada tipo (ex.: "gere com `claude setup-token`; vale um ano; usa sua assinatura").

### Notas de design

Superfície de configurações. Nunca mostre o valor depois de salvo. Remover pede confirmação em Dialog citando o nome.

## Critérios de aceite

- [ ] Valor salvo cifrado; o banco não contém o texto puro (teste lê a tabela).
- [ ] Nenhuma resposta da API contém o valor.
- [ ] `generic_env` sem `envVar` válido → 400.
- [ ] Após criar, o redator mascara o valor em textos.
- [ ] A tela lista, cria, renomeia, substitui e remove com confirmação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `credential_service.test.ts` (`createTestDb`, SecretBox com chave fixa): cifra, máscara, redator, `revealForRuntime`.
- `credentials_routes.test.ts`: respostas sem valor; validação.
- `credentials_page.test.tsx`: fluxo de criação e remoção com API mockada.

---
key: CFG-01
title: "Cofre de segredos (AES-256-GCM) e redator de logs"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:seguranca, area:credenciais]
depends_on: [F-05]
---

## Contexto

Atende RNF-SEG-02. A Forja guarda API keys da Anthropic, o token do `claude setup-token` e tokens do GitHub. Eles
precisam ficar cifrados no SQLite e **nunca** aparecer em logs: os eventos do agente são gravados por #{RT-03} e
qualquer `env` impresso por um agente vazaria o segredo sem um redator.

## Objetivo

Existem `SecretBox` (cifra/decifra com AES-256-GCM e chave mestra em arquivo) e `SecretRedactor` (substitui valores
de segredos conhecidos por `••••` em qualquer texto), testados.

## Escopo

**Inclui:** geração e leitura da chave mestra, cifra/decifra, máscara para exibição, redator.
**Não inclui:** tabela e API de credenciais (#{CFG-02}), injeção no container (#{RT-08}).

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/secrets/secret_box.ts`
- `src/integrations/secrets/master_key.ts`
- `src/integrations/secrets/secret_redactor.ts`
- `src/integrations/secrets/secret_box.test.ts`
- `src/integrations/secrets/secret_redactor.test.ts`
- `src/integrations/secrets/master_key.test.ts`

### Contratos

```ts
export interface SecretBox {
    seal(plaintext: string): string; // "v1:<iv b64>:<tag b64>:<ciphertext b64>"
    open(sealed: string): string; // lança InvalidSecretError se adulterado ou chave errada
}
export function createSecretBox(masterKey: Buffer): SecretBox; // 32 bytes

export function loadOrCreateMasterKey(
    path: string,
    fs: Pick<
        typeof import("node:fs"),
        "existsSync" | "readFileSync" | "writeFileSync" | "chmodSync"
    >,
): Buffer;
// cria 32 bytes aleatórios se não existir; permissão 0o600 (no Windows, ignore falha de chmod)

export function maskSecret(value: string): string; // "sk-ant-api03-…a1b2": prefixo até o 2º "-" + "…" + 4 últimos; < 12 chars → "••••"

export interface SecretRedactor {
    register(value: string): void; // ignora valores com menos de 8 caracteres
    redact(text: string): string; // substitui todas as ocorrências por "••••"
}
export function createSecretRedactor(): SecretRedactor;
```

### Passo a passo

1. `createSecretBox` com `node:crypto` (`aes-256-gcm`, IV de 12 bytes aleatório por chamada).
2. `loadOrCreateMasterKey` com fs injetável.
3. `maskSecret` e `createSecretRedactor` (substituição literal, sem regex de usuário; ordene por tamanho decrescente para valores que se sobrepõem).

## Critérios de aceite

- [ ] `open(seal(x)) === x`; dois `seal` do mesmo texto geram resultados diferentes.
- [ ] Texto adulterado ou chave diferente lança `InvalidSecretError`.
- [ ] A chave mestra é criada uma vez e reutilizada.
- [ ] `redact` troca todas as ocorrências de segredos registrados, inclusive várias na mesma linha.
- [ ] `maskSecret` segue o formato documentado.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `secret_box.test.ts`, `master_key.test.ts` (fs em memória), `secret_redactor.test.ts` com os casos acima.

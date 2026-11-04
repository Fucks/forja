---
key: QA-05
title: "Empacotamento npm, docker-compose opcional e README"
type: issue
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:infra, area:distribuicao]
depends_on: [QA-02, QA-03, QA-04, GIT-05]
---

## Contexto
Atende RNF-INS-01. A Forja precisa ser instalada com um comando em Windows, macOS e Linux. O nome `forja` no npm está retido
(benchmark): o pacote usa o escopo definido em #{HUM-01} (padrão provisório `@fucks/forja`). Um `docker-compose.yml`
opcional serve quem preferir rodar o servidor em container (com o socket do Docker do host montado).

## Objetivo
`npx <pacote>` instala e abre a Forja; o README explica requisitos, início rápido, credenciais, imagem do agente,
template "Pipeline Sandcastle" e solução de problemas; existe `docker-compose.yml` opcional documentado.

## Escopo
**Inclui:** `package.json` publicável (`files`, `bin`, `engines`, `publishConfig`), build reprodutível, verificação do
pacote (`npm pack` + teste de fumaça), workflow de release manual, README, `docker-compose.yml`.
**Não inclui:** publicar de fato (tarefa humana com a conta npm).

## Especificação técnica
### Arquivos
Criar:
- `README.md`
- `docker-compose.yml`
- `Dockerfile.server`
- `scripts/smoke_test_package.mjs`
- `.github/workflows/release.yml`
Alterar:
- `package.json` (`name` com escopo, `version` `0.1.0`, `files: ["dist", "assets", "README.md"]`, `engines.node >=22`, `bin.forja`)

### Contratos
- `scripts/smoke_test_package.mjs`: `npm pack`, instala o tarball num diretório temporário, sobe `forja --no-open --data-dir <tmp>` com `FORJA_AGENT_RUNTIME=fake` e verifica `GET /api/health` e o `index.html`.
- `release.yml`: `workflow_dispatch`, roda checks + smoke test e `npm publish --access public` com `NPM_TOKEN` (segredo do repositório).
- `docker-compose.yml`: serviço `forja` com `Dockerfile.server`, porta `127.0.0.1:4317:4317`, volumes `~/.forja`, o diretório de repositórios e `/var/run/docker.sock`; documentar que o modo recomendado é o nativo.
- README (português): o que é; requisitos (Node ≥ 22, git, Docker Desktop, gh); início rápido; primeira credencial (`claude setup-token` ou API key); construir a imagem do agente; criar fluxo pela "Fábrica básica"; "Migrando do `.sandcastle/main.mts`" (seção vinda de #{GIT-05}); gatilhos e limite de uso; segurança (localhost, container como fronteira, `bypassPermissions`); solução de problemas (Docker parado, imagem ausente, gh sem login); onde ficam os dados.

### Passo a passo
1. Ajustes de `package.json` e build.
2. Smoke test e workflow.
3. Compose e Dockerfile do servidor.
4. README.

## Critérios de aceite
- [ ] `node scripts/smoke_test_package.mjs` passa localmente.
- [ ] O tarball contém só `dist`, `assets`, `README.md` e `package.json`.
- [ ] O README cobre todos os tópicos listados.
- [ ] `docker compose up` sobe a Forja acessível em `127.0.0.1:4317`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- O smoke test do pacote.

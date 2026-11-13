# Forja

Fluxos de agentes de código num canvas, rodando local. Você desenha um fluxo (fonte de issues, agentes do
Claude Code, condições, rebase, PR), a Forja executa cada agente num container Docker com um worktree git só
dele e mostra o andamento ao vivo no navegador. O servidor Node roda no seu computador e os dados ficam em
SQLite em `~/.forja`.

## Requisitos

- **Node.js 22** ou mais recente.
- **git** no `PATH`.
- **Docker Desktop** (Windows e macOS) ou o Docker Engine (Linux), rodando: cada agente roda num container.
- **GitHub CLI (`gh`)**, logado com `gh auth login`, para ler issues e abrir PRs.

A página **Diagnóstico** confere tudo isso e diz o que corrigir.

## Início rápido

```
npx @fucks/forja
```

A Forja sobe em `http://127.0.0.1:4317` e abre o navegador. Opções:

| Opção                | Para quê                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `--port <porta>`     | Outra porta (padrão `4317`; também `FORJA_PORT`).                  |
| `--data-dir <pasta>` | Outra pasta de dados (padrão `~/.forja`; também `FORJA_DATA_DIR`). |
| `--no-open`          | Não abre o navegador.                                              |
| `--seed-demo`        | Cria um projeto de demonstração com um repositório local.          |

Depois:

1. Em **Projetos**, clique em **Novo projeto** e informe o caminho de um repositório git local; o remote do
   GitHub e a branch base são detectados.
2. Cadastre a primeira credencial (abaixo).
3. Construa a imagem do agente (abaixo).
4. Crie um fluxo pela **Fábrica básica** e dispare-o.

## Primeira credencial

Em **Credenciais**, adicione uma credencial do Claude. Ela é guardada cifrada em `~/.forja` e entregue ao
agente só como variável de ambiente do container.

- **Token do Claude (assinatura)** — rode `claude setup-token` no terminal e cole o token gerado. Vale um ano e
  usa a sua assinatura do Claude (`CLAUDE_CODE_OAUTH_TOKEN`).
- **API key da Anthropic** — crie no console da Anthropic; o uso é cobrado por token (`ANTHROPIC_API_KEY`).

Para os PRs, adicione também um **Token do GitHub** com acesso aos repositórios dos projetos (`GH_TOKEN`).
Nas **Configurações** do projeto, escolha a credencial padrão do Claude e a do GitHub.

## Construir a imagem do agente

Os agentes rodam na imagem `forja-agent:latest` (configurável por projeto). Nas **Configurações** do projeto,
no painel da imagem do agente, clique em **Construir imagem**; o log do `docker build` aparece ao vivo.

A Forja usa o Dockerfile padrão dela (Node 22, git, gh, CodeGraph e o Claude Code). Se o repositório tiver
um `.sandcastle/Dockerfile`, ele é usado no lugar. Um Dockerfile próprio precisa manter o contrato descrito
no começo de `assets/agent-image/Dockerfile`: um usuário `agent` com o UID/GID do host, o worktree em
`/home/agent/workspace` e um container que só dorme, porque a Forja roda cada nó com `docker exec`.

## Criar um fluxo pela "Fábrica básica"

Em **Fluxos**, clique em **Novo fluxo** e escolha o template **Fábrica básica**: um TL especifica uma issue por
vez, três Devs implementam em paralelo e um Reviewer revisa cada branch e abre o PR. As issues vêm do GitHub
com a label `Sandcastle`.

Ajuste o que quiser no canvas (prompts, modelo, concorrência dos grupos), publique o fluxo e clique em
**Executar**. A run aparece ao vivo no canvas; cada nó mostra os logs do agente e o uso de tokens.

## Migrando do `.sandcastle/main.mts`

O pipeline que este repositório roda com `npm run sandcastle` existe na Forja como o template de fluxo
**Pipeline Sandcastle**. Na lista de fluxos do projeto, clique em **Novo fluxo**, escolha o template
"Pipeline Sandcastle" e publique o fluxo.

| `.sandcastle/main.mts`                           | Pipeline Sandcastle                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| sync das issues com label `Sandcastle` + planner | Nó **Fonte** (GitHub, label `Sandcastle`, até 10 issues, pula as bloqueadas por outra issue aberta)         |
| uma issue por vez                                | Grupo **Implementar e revisar** com concorrência 1 (suba para 3 no canvas para trabalhar em paralelo)       |
| implementer, até 100 iterações                   | Agente **Implementer** (`sandcastle_implement.md`, perfil CodeGraph, 100 iterações)                         |
| implementer sem commits                          | Condição **Fez commits?** → saída "precisa de humano"                                                       |
| reviewer                                         | Agente **Reviewer** (`sandcastle_review.md`, uma iteração)                                                  |
| rebase                                           | Nó **Git: rebase** (chama um agente só quando há conflito)                                                  |
| evidence (`body.md` e `result.json`)             | Agente **Evidence** (`sandcastle_evidence.md`, saída estruturada `{ checksPassed, failureSummary?, body }`) |
| PR só com os checks verdes                       | Condição **Checks passaram?** → **Abrir PR** com o corpo da evidência e `Closes #N`                         |
| checks falhando                                  | Saída "precisa de humano", com o resumo da falha comentado na issue                                         |
| `usage_guard.mts`                                | Configurações: margem após o limite de uso e tentativas de cada nó                                          |

Diferenças que importam na migração:

- Os prompts ficam em `src/server/flows/templates/prompts/sandcastle_*.md` e usam as variáveis da Forja:
  `{{TASK_ID}}` → `{{item.number}}`, `{{ISSUE_TITLE}}` → `{{item.title}}`, `{{BRANCH}}` → `{{item.branch}}`,
  `{{BASE_BRANCH}}` → `{{project.baseBranch}}`. As diretivas `` !`…` `` continuam: a Forja as executa no
  workspace do item antes de enviar o prompt.
- O branch de cada issue é `forja/issue-<número>`, num worktree em `~/.forja/worktrees/` montado num container
  por item.
- As screenshots da evidência ficam em `.pr-evidence/screenshots/`, mas a Forja não as envia ao PR.
- Quando o limite de uso do Claude é atingido, a run pausa e retoma sozinha depois do reset mais a
  "Margem após o limite de uso" das **Configurações do projeto**; o `tokenBudgetPerWindow` vira o orçamento por
  run, por nó ou por dia.

## Gatilhos e limite de uso

Em **Gatilhos**, um fluxo publicado pode rodar sozinho:

| Gatilho         | Quando dispara                                                                     |
| --------------- | ---------------------------------------------------------------------------------- |
| manual          | Pelo botão no canvas ou na página de gatilhos.                                     |
| agendado        | Numa expressão cron, no fuso escolhido.                                            |
| por evento      | Quando o limite de uso reseta, uma run termina ou um item de trabalho é criado.    |
| webhook         | `POST /api/hooks/<id>` com o token no cabeçalho `X-Forja-Token`, só desta máquina. |
| coluna do board | Quando um item é movido para a coluna escolhida do **Board**.                      |

Se o fluxo já estiver rodando, o gatilho segue a política escolhida: pular, enfileirar ou rodar em paralelo.

Quando o Claude responde que o limite de uso foi atingido, a run fica **Pausado por limite** em vez de falhar e
retoma sozinha depois do reset, mais a "Margem após o limite de uso" (padrão 5 minutos, nas
**Configurações** do projeto, parte global). A página **Uso** mostra os tokens e o custo por run, por nó
e por dia, e o orçamento diário do projeto (nas **Configurações**) pausa a run quando é atingido.

## Segurança

- **Só localhost.** O servidor escuta apenas em `127.0.0.1`. A interface recebe um cookie de sessão ao abrir a
  página, toda rota `/api` exige esse cookie e requisições com `Host` ou `Origin` de fora são recusadas. Os
  webhooks só são aceitos a partir desta máquina.
- **O container é a fronteira.** Cada agente roda num container próprio, que só vê o worktree do item, o
  diretório `.git` do repositório (o worktree precisa dele) e seus arquivos de configuração, só leitura.
- **`bypassPermissions`.** Os perfis de ferramentas prontos da Forja rodam o Claude Code com
  `bypassPermissions`: o agente executa qualquer comando dentro do container sem pedir permissão. É isso que
  torna o container a fronteira de segurança; não monte nele nada que o agente não possa alterar. Para uma
  revisão humana no meio do fluxo, use um nó **gate**, que espera a aprovação em **Aprovações**.
- As credenciais ficam cifradas com a chave `~/.forja/master.key` e são removidas dos logs.

## Solução de problemas

Abra **Diagnóstico** primeiro: ele confere Node, git, Docker, gh, a imagem do agente e o espaço em disco.

- **Docker parado** ("Docker instalado mas não está rodando") — abra o Docker Desktop ou inicie o serviço
  (`sudo systemctl start docker`) e verifique de novo.
- **Imagem ausente** ("Imagem forja-agent:latest não encontrada") — construa a imagem nas **Configurações** do
  projeto (botão **Construir imagem**) ou confira o nome da imagem configurada.
- **gh sem login** ("Autenticação do gh") — rode `gh auth login` e verifique de novo. Para os PRs abertos pela
  Forja, confira também o **Token do GitHub** em **Credenciais**.
- **Porta ocupada** — rode com `--port <outra porta>`.

## Onde ficam os dados

Tudo fica em `~/.forja` (ou na pasta de `--data-dir`):

| Caminho      | Conteúdo                                                                     |
| ------------ | ---------------------------------------------------------------------------- |
| `forja.db`   | Projetos, fluxos, runs, gatilhos, configurações e credenciais (SQLite).      |
| `master.key` | Chave que cifra as credenciais. Sem ela, as credenciais se perdem.           |
| `logs/`      | Logs dos agentes, apagados depois da retenção (padrão 30 dias).              |
| `worktrees/` | Um worktree git por item de trabalho; a limpeza diária remove os que sobram. |
| `runtime/`   | Arquivos de configuração montados nos containers dos agentes.                |
| `tmp/`       | Arquivos temporários.                                                        |

Para começar do zero, pare a Forja e apague a pasta. Os repositórios dos projetos não ficam aqui.

## Servidor em container (opcional)

**O modo recomendado é o nativo (`npx @fucks/forja`).** O `docker-compose.yml` serve quem prefere não instalar
o Node no host; funciona em Linux e macOS. Ele monta o socket do Docker do host, então o servidor no container
controla o Docker do host: os containers dos agentes continuam sendo irmãos dele, não filhos.

Como o Docker do host recebe os caminhos dos worktrees, `~/.forja` e a pasta dos repositórios são montados no
container nos mesmos caminhos absolutos do host. Cadastre os projetos com caminhos dentro de
`FORJA_REPOS_DIR`.

```
mkdir -p ~/.forja
cat > .env <<ENV
FORJA_UID=$(id -u)
FORJA_GID=$(id -g)
DOCKER_GID=$(stat -c %g /var/run/docker.sock)
FORJA_REPOS_DIR=$HOME/code
ENV
docker compose up -d
```

No macOS, troque `stat -c %g` por `stat -f %g`. A Forja fica em `http://127.0.0.1:4317`, publicada só no
loopback do host. O `gh` do container não enxerga o login do host: cadastre o **Token do GitHub** em
**Credenciais**.

## Desenvolvimento

```
npm install
npm run dev
```

`npm run typecheck`, `npm run lint` e `npm run test` são os checks do CI. `node scripts/smoke_test_package.mjs`
empacota a Forja, instala o tarball numa pasta temporária e confere que ela sobe. A publicação no npm é manual,
pelo workflow **Release** do GitHub Actions, com o segredo `NPM_TOKEN`.

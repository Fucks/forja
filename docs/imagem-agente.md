# Imagem do agente

Os agentes rodam na imagem `forja-agent:latest`, construída a partir de `assets/agent-image/Dockerfile` (ou do
`.sandcastle/Dockerfile` do repositório, quando existe). A imagem padrão traz Node 22, git, gh, jq, CodeGraph, o
Claude Code e o RTK.

## RTK (Rust Token Killer)

Boa parte dos tokens de entrada de um agente vai na leitura da saída de comandos de shell (`git`, `npm test`,
`ls`, `grep`...). O [RTK](https://github.com/rtk-ai/rtk) compacta essa saída antes de o Claude lê-la, sem mudar o
exit code; quando um filtro falha, ele devolve a saída crua.

Na imagem padrão, o RTK vem registrado como um hook `PreToolUse` do Claude Code em
`/home/agent/.claude/settings.json`, que reescreve os comandos da ferramenta Bash: `git status` vira
`rtk git status`. Por isso os logs do run mostram os comandos com o prefixo `rtk`. O hook vale junto com o
`.claude/settings.json` do worktree; nenhum fluxo precisa mudar.

- **Edição:** só a `rtk-oss` (Apache-2.0), na versão fixada no Dockerfile, com o checksum conferido no build.
- **Telemetria:** bloqueada por `RTK_TELEMETRY_DISABLED=1`. Confira com `rtk telemetry status`.
- **Economia:** `rtk gain` mostra quantos tokens o RTK poupou no container.

### Rodar um comando sem filtro

Quando a saída compactada não serve, rode o comando com `rtk bypass`: `rtk bypass git log -p`. O hook não
reescreve comandos que já começam com `rtk`. O `~/.claude/RTK.md` da imagem explica isso ao agente.

### Desligar o RTK

Construa a imagem com `--build-arg INSTALL_RTK=false`: ela fica sem o RTK e sem o hook. Pelo terminal, a partir
da raiz da Forja:

```sh
docker build \
  --build-arg INSTALL_RTK=false \
  --build-arg AGENT_UID="$(id -u)" \
  --build-arg AGENT_GID="$(id -g)" \
  -t forja-agent:latest \
  assets/agent-image
```

Um `.sandcastle/Dockerfile` próprio não recebe o RTK; instale-o lá se quiser o mesmo efeito.

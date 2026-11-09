# Default image of the Forja agent containers. A project can replace it with its own
# .sandcastle/Dockerfile; any replacement must keep the contract below: an "agent" user whose
# UID/GID match the host, the worktree at /home/agent/workspace and a container that just sleeps,
# because Forja runs every agent node with docker exec.
FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI, used by the agents to read issues and open pull requests.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Playwright + Chromium only when asked (--build-arg INSTALL_PLAYWRIGHT=true): it adds about 1 GB
# and only flows that take screenshots need it. Browsers go to a shared path so the non-root
# agent user can use them.
ARG INSTALL_PLAYWRIGHT=false
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then \
      npm install -g playwright@1.56.1 && playwright install --with-deps chromium; \
    fi

# CodeGraph indexes the worktree and serves it to the agents by symbol. Its MCP server is not
# registered here: each node receives its MCP servers through --mcp-config.
ENV CODEGRAPH_TELEMETRY=0
ENV CODEGRAPH_MCP_TOOLS=explore,node,search,callers,callees,impact,files
RUN npm install -g @colbymchenry/codegraph@1.6.2

# Forja passes the host user's UID/GID, so files written in the container and in the
# bind-mounted worktree share an owner without a chown at runtime.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# The base image's "node" user becomes "agent" with the host UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/agent/.local/bin:$PATH"

# Trust the bind-mounted worktree so .claude/settings.json permissions load without the dialog.
RUN f=/home/agent/.claude.json; [ -f "$f" ] || echo '{}' > "$f"; \
    jq '.projects["/home/agent/workspace"].hasTrustDialogAccepted = true' "$f" > "$f.tmp" && mv "$f.tmp" "$f"

WORKDIR /home/agent

# Forja bind-mounts the item's git worktree at /home/agent/workspace and runs each node there
# with docker exec, so the container only has to stay alive.
ENTRYPOINT ["sleep", "infinity"]

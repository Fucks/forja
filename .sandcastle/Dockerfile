FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Install Playwright CLI + Chromium for the PR evidence screenshots. Browsers go to a
# shared path so the non-root agent user can use them.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install -g playwright@1.56.1 \
  && playwright install --with-deps chromium

# CodeGraph indexes the worktree (onSandboxReady in main.mts) and gives the agents
# an MCP server to search and read the code by symbol, with callers and callees.
ENV CODEGRAPH_TELEMETRY=0
ENV CODEGRAPH_MCP_TOOLS=explore,node,search,callers,callees,impact,files
RUN npm install -g @colbymchenry/codegraph@1.6.2

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# User scope, so it loads in every worktree without the project .mcp.json trust prompt.
RUN claude mcp add --scope user codegraph -- codegraph serve --mcp

# Trust the bind-mounted worktree so .claude/settings.json permissions load without the dialog.
RUN f=/home/agent/.claude.json; [ -f "$f" ] || echo '{}' > "$f"; \
    jq '.projects["/home/agent/workspace"].hasTrustDialogAccepted = true' "$f" > "$f.tmp" && mv "$f.tmp" "$f"

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]

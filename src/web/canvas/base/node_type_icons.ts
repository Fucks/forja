import { Bot, Flag, GitFork, GitPullRequest, Hand, Inbox, Terminal, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NodeType } from "@/shared/flow_graph.js";

export const NODE_TYPE_ICONS: Record<NodeType, LucideIcon> = {
    trigger: Zap,
    source: Inbox,
    agent: Bot,
    script: Terminal,
    condition: GitFork,
    gate: Hand,
    git: GitPullRequest,
    output: Flag,
};

import { Asterisk, Braces, GitBranch, GitPullRequest, ListTodo, Ticket, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PortType } from "@/shared/flow_graph.js";

export const PORT_TYPE_ICONS: Record<PortType, LucideIcon> = {
    workItemList: ListTodo,
    workItem: Ticket,
    text: Type,
    json: Braces,
    branch: GitBranch,
    prUrl: GitPullRequest,
    any: Asterisk,
};

export const PORT_TYPE_LABELS: Record<PortType, string> = {
    workItemList: "lista de itens",
    workItem: "item",
    text: "texto",
    json: "JSON",
    branch: "branch",
    prUrl: "URL de PR",
    any: "qualquer",
};

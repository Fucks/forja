import { z } from "zod";

export type AgentImageSource = "forja_default" | "project_dockerfile";

export interface AgentImageStatus {
    image: string;
    exists: boolean;
    createdAt?: string;
    sizeMb?: number;
    source: AgentImageSource;
}

export const agentImageBuildResultSchema = z.object({ ok: z.boolean(), exitCode: z.number() });

export type AgentImageBuildResult = z.infer<typeof agentImageBuildResultSchema>;

export const agentImageBuildLineSchema = z.object({ line: z.string() });

export const AGENT_IMAGE_BUILD_EVENTS = { line: "line", done: "done" } as const;

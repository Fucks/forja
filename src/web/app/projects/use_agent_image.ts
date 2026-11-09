import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
    AGENT_IMAGE_BUILD_EVENTS,
    agentImageBuildLineSchema,
    agentImageBuildResultSchema,
} from "@/shared/agent_image_types.js";
import type { AgentImageBuildResult, AgentImageStatus } from "@/shared/agent_image_types.js";
import { apiClient } from "@/web/api/api_client.js";
import type { ApiError } from "@/web/api/api_client.js";
import { readServerSentEvents } from "@/web/api/server_sent_events.js";
import type { ServerSentEvent } from "@/web/api/server_sent_events.js";
import type { LogLine } from "@/web/logs/log_types.js";

const AGENT_IMAGE_QUERY_KEY = ["agent-image"];
const API_PREFIX = "/api";

export type AgentImageBuildOutcome =
    | { kind: "finished"; result: AgentImageBuildResult }
    | { kind: "cancelled" }
    | { kind: "failed"; message: string };

export interface AgentImageBuild {
    lines: LogLine[];
    isBuilding: boolean;
    outcome?: AgentImageBuildOutcome;
    start: () => void;
    cancel: () => void;
}

export function useAgentImageStatus(projectId: string): UseQueryResult<AgentImageStatus, ApiError> {
    return useQuery({
        queryKey: [...AGENT_IMAGE_QUERY_KEY, projectId],
        queryFn: () => apiClient.get<AgentImageStatus>(agentImagePath(projectId)),
    });
}

export function useAgentImageBuild(projectId: string): AgentImageBuild {
    const queryClient = useQueryClient();
    const [lines, setLines] = useState<LogLine[]>([]);
    const [isBuilding, setIsBuilding] = useState(false);
    const [outcome, setOutcome] = useState<AgentImageBuildOutcome>();
    const cancellationRef = useRef<AbortController>(undefined);

    useEffect(() => () => cancellationRef.current?.abort(), []);

    async function runBuild(): Promise<void> {
        const cancellation = new AbortController();
        const startedAtMs = Date.now();
        cancellationRef.current = cancellation;
        setLines([]);
        setOutcome(undefined);
        setIsBuilding(true);

        const appendLine = (text: string): void =>
            setLines((previous) => [...previous, toLogLine(text, previous.length, startedAtMs)]);
        setOutcome(await buildAgentImage(projectId, appendLine, cancellation.signal));

        setIsBuilding(false);
        await queryClient.invalidateQueries({ queryKey: [...AGENT_IMAGE_QUERY_KEY, projectId] });
    }

    return {
        lines,
        isBuilding,
        outcome,
        start: () => void runBuild(),
        cancel: () => cancellationRef.current?.abort(),
    };
}

async function buildAgentImage(
    projectId: string,
    onLine: (line: string) => void,
    signal: AbortSignal,
): Promise<AgentImageBuildOutcome> {
    try {
        const result = await streamAgentImageBuild(projectId, onLine, signal);
        return { kind: "finished", result };
    } catch (error) {
        if (signal.aborted) {
            return { kind: "cancelled" };
        }

        return { kind: "failed", message: describeFailure(error) };
    }
}

async function streamAgentImageBuild(
    projectId: string,
    onLine: (line: string) => void,
    signal: AbortSignal,
): Promise<AgentImageBuildResult> {
    const response = await fetch(`${API_PREFIX}${agentImagePath(projectId)}/build`, {
        method: "POST",
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`Não foi possível iniciar o build (HTTP ${response.status}).`);
    }

    let result: AgentImageBuildResult | undefined;
    await readServerSentEvents(response.body, (event) => {
        const doneResult = handleBuildEvent(event, onLine);
        if (doneResult) {
            result = doneResult;
        }
    });
    if (!result) {
        throw new Error("O servidor encerrou o build sem informar o resultado.");
    }

    return result;
}

function handleBuildEvent(
    event: ServerSentEvent,
    onLine: (line: string) => void,
): AgentImageBuildResult | undefined {
    if (event.event === AGENT_IMAGE_BUILD_EVENTS.done) {
        return agentImageBuildResultSchema.parse(JSON.parse(event.data));
    }
    if (event.event === AGENT_IMAGE_BUILD_EVENTS.line) {
        onLine(agentImageBuildLineSchema.parse(JSON.parse(event.data)).line);
    }

    return undefined;
}

function toLogLine(text: string, seq: number, startedAtMs: number): LogLine {
    return { seq, offsetMs: Date.now() - startedAtMs, kind: "text", text };
}

function describeFailure(error: unknown): string {
    return error instanceof Error ? error.message : "Falha desconhecida no build.";
}

function agentImagePath(projectId: string): string {
    return `/projects/${projectId}/agent-image`;
}

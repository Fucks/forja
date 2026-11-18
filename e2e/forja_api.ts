import type { APIRequestContext, APIResponse } from "@playwright/test";
import { z } from "zod";

import type { ScriptedOutputRule } from "@/integrations/agent_runtime/scripted_agent_outputs.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { globalSettingsSchema, projectSettingsSchema } from "@/shared/settings_types.js";

export interface PublishedFlowInput {
    name: string;
    graph: FlowGraph;
}

interface StartRunInput {
    flowId: string;
    itemIds: string[];
}

interface BoardColumnTriggerInput {
    flowId: string;
    columnId: string;
}

const createdRecordSchema = z.object({ id: z.string() });
const workItemsSchema = z.array(z.object({ id: z.string(), branch: z.string() }));

type ListedWorkItem = z.infer<typeof workItemsSchema>[number];

const WEB_APP_ENTRY_PATH = "/";

const SIMULATED_CREDENTIAL = {
    name: "E2E — chave fictícia",
    kind: "anthropic_api_key",
    value: "sk-ant-e2e-forja-nao-e-uma-chave-real",
};

/** The preconditions of the scenarios, set up through the REST API of the running Forja. */
export class ForjaApi {
    private constructor(private readonly request: APIRequestContext) {}

    // The web app hands out the session cookie that every API request must carry.
    static async openSession(request: APIRequestContext): Promise<ForjaApi> {
        await assertSucceeded(await request.get(WEB_APP_ENTRY_PATH), `GET ${WEB_APP_ENTRY_PATH}`);
        return new ForjaApi(request);
    }

    async createProject(project: { name: string; repoPath: string }): Promise<string> {
        const created = await this.send("post", "/api/projects", project);
        return createdRecordSchema.parse(created).id;
    }

    async prepareSimulatedAgents(projectId: string): Promise<void> {
        await Promise.all([this.assignFakeCredential(projectId), this.startAgentsWithoutPacing()]);
    }

    async publishDefaultFlow(projectId: string, flow: PublishedFlowInput): Promise<string> {
        const created = await this.send("post", `/api/projects/${projectId}/flows`, flow);
        const flowId = createdRecordSchema.parse(created).id;
        await this.send("post", `/api/flows/${flowId}/publish`);
        await this.send("post", `/api/flows/${flowId}/default`);

        return flowId;
    }

    // The dropped item is the one to run, so the trigger takes the items of the event.
    async createBoardColumnTrigger(
        projectId: string,
        { flowId, columnId }: BoardColumnTriggerInput,
    ): Promise<void> {
        await this.send("post", `/api/projects/${projectId}/triggers`, {
            flowId,
            name: "Soltar na coluna",
            itemSelection: "event_items",
            config: { kind: "board_column", columnId },
        });
    }

    async createLocalItem(projectId: string, title: string): Promise<void> {
        await this.send("post", `/api/projects/${projectId}/work-items`, { title });
    }

    async startRun(projectId: string, run: StartRunInput): Promise<string> {
        const started = await this.send("post", `/api/projects/${projectId}/runs`, run);
        return createdRecordSchema.parse(started).id;
    }

    async listWorkItems(projectId: string): Promise<ListedWorkItem[]> {
        const items = await this.send("get", `/api/projects/${projectId}/work-items`);
        return workItemsSchema.parse(items);
    }

    /** Decides what the simulated agents answer, until the rules are replaced again. */
    async scriptAgentOutputs(rules: ScriptedOutputRule[]): Promise<void> {
        await this.send("put", "/api/scripted-agents/outputs", { rules });
    }

    // The simulated agents never use the credential, but no agent starts without one.
    private async assignFakeCredential(projectId: string): Promise<void> {
        const settingsPath = `/api/projects/${projectId}/settings`;
        const [credential, settings] = await Promise.all([
            this.send("post", "/api/credentials", SIMULATED_CREDENTIAL),
            this.send("get", settingsPath),
        ]);

        await this.send("put", settingsPath, {
            ...projectSettingsSchema.parse(settings),
            defaultCredentialId: createdRecordSchema.parse(credential).id,
        });
    }

    // The pacing protects the real Claude limits; with it, each scenario would take minutes.
    private async startAgentsWithoutPacing(): Promise<void> {
        const settings = globalSettingsSchema.parse(await this.send("get", "/api/settings"));
        await this.send("put", "/api/settings", { ...settings, minStartIntervalMs: 0 });
    }

    private async send(
        method: "get" | "post" | "put",
        path: string,
        body?: unknown,
    ): Promise<unknown> {
        const response = await this.request[method](path, { data: body });
        await assertSucceeded(response, `${method.toUpperCase()} ${path}`);

        return readJsonBody(response);
    }
}

async function assertSucceeded(response: APIResponse, requestLine: string): Promise<void> {
    if (response.ok()) {
        return;
    }

    throw new Error(`${requestLine} → ${response.status()}: ${await response.text()}`);
}

async function readJsonBody(response: APIResponse): Promise<unknown> {
    const text = await response.text();
    if (text === "") {
        return undefined;
    }

    const body: unknown = JSON.parse(text);
    return body;
}

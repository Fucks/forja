import type { ValidationContext } from "@/engine/graph_validation.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { createFlowService } from "@/server/flows/flow_service.js";
import type { FlowService } from "@/server/flows/flow_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const CREATED_AT = new Date("2026-05-04T09:00:00Z");
const ONE_MINUTE_MS = 60_000;
const PROJECT_ID = "prj_forja";
const OTHER_PROJECT_ID = "prj_loja";

const GRAPH_WITHOUT_TRIGGER: FlowGraph = { schemaVersion: 1, nodes: [], edges: [], groups: [] };

describe("FlowService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let events: EventBus;
    let validationContext: ValidationContext;
    let service: FlowService;

    beforeEach(() => {
        database = createTestDb();
        insertProject(database, PROJECT_ID);
        insertProject(database, OTHER_PROJECT_ID);
        clock = new FakeClock(CREATED_AT);
        events = createEventBus(clock);
        validationContext = {};
        service = createFlowService({
            repo: new FlowRepository(database.db),
            events,
            clock,
            validationContext: () => Promise.resolve(validationContext),
        });
    });

    afterEach(() => {
        database.close();
    });

    function minutesAfterCreation(minutes: number): string {
        return new Date(CREATED_AT.getTime() + minutes * ONE_MINUTE_MS).toISOString();
    }

    describe("create", () => {
        it("creates a draft with a single manual trigger node at revision 1", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            const draft = await service.getDraft(flow.id);
            expect(flow).toEqual({
                id: expect.stringMatching(/^flw_/) as unknown,
                projectId: PROJECT_ID,
                name: "Entrega",
                isDefault: false,
                archived: false,
                draftUpdatedAt: CREATED_AT.toISOString(),
                draftRevision: 1,
            });
            expect(draft.revision).toBe(1);
            expect(draft.graph.nodes).toEqual([
                expect.objectContaining({ type: "trigger", config: { kind: "manual" } }),
            ]);
            expect(draft.graph.edges).toEqual([]);
            expect(draft.graph.groups).toEqual([]);
        });

        it("uses the given graph as the first draft", async () => {
            const graph = buildCanonicalFlow();

            const flow = await service.create(PROJECT_ID, { name: "Canônico", graph });

            await expect(service.getDraft(flow.id)).resolves.toMatchObject({ graph, revision: 1 });
        });

        it("rejects an unknown project with NotFoundError", async () => {
            const creating = service.create("prj_inexistente", { name: "Solto" });

            await expect(creating).rejects.toThrow(NotFoundError);
        });
    });

    describe("list", () => {
        it("lists the project's flows in creation order", async () => {
            await service.create(PROJECT_ID, { name: "Entrega" });
            clock.advance(ONE_MINUTE_MS);
            await service.create(PROJECT_ID, { name: "Revisão" });
            await service.create(OTHER_PROJECT_ID, { name: "De outro projeto" });

            const flows = await service.list(PROJECT_ID);

            expect(flows.map((flow) => flow.name)).toEqual(["Entrega", "Revisão"]);
        });

        it("hides archived flows unless asked to include them", async () => {
            const archived = await service.create(PROJECT_ID, { name: "Antigo" });
            await service.create(PROJECT_ID, { name: "Atual" });
            await service.archive(archived.id);

            const visible = await service.list(PROJECT_ID);
            const all = await service.list(PROJECT_ID, { includeArchived: true });

            expect(visible.map((flow) => flow.name)).toEqual(["Atual"]);
            expect(all.map((flow) => [flow.name, flow.archived])).toEqual([
                ["Antigo", true],
                ["Atual", false],
            ]);
        });

        it("reports the latest published version", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            await service.publish(flow.id);
            await service.publish(flow.id);

            const [summary] = await service.list(PROJECT_ID);

            expect(summary?.latestVersion).toBe(2);
        });

        it("rejects an unknown project with NotFoundError", async () => {
            await expect(service.list("prj_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("rename", () => {
        it("changes the flow name", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            const renamed = await service.rename(flow.id, "Entrega contínua");

            expect(renamed).toEqual({ ...flow, name: "Entrega contínua" });
            await expect(service.list(PROJECT_ID)).resolves.toEqual([renamed]);
        });

        it("rejects an unknown flow with NotFoundError", async () => {
            await expect(service.rename("flw_inexistente", "Nada")).rejects.toThrow(NotFoundError);
        });
    });

    describe("archive", () => {
        it("rejects an unknown flow with NotFoundError", async () => {
            await expect(service.archive("flw_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("setDefault", () => {
        it("keeps a single default flow per project", async () => {
            const first = await service.create(PROJECT_ID, { name: "Primeiro" });
            const second = await service.create(PROJECT_ID, { name: "Segundo" });
            const otherProjectFlow = await service.create(OTHER_PROJECT_ID, { name: "Outro" });
            await service.setDefault(otherProjectFlow.id);

            await service.setDefault(first.id);
            await service.setDefault(second.id);

            const flows = await service.list(PROJECT_ID);
            expect(flows.map((flow) => [flow.name, flow.isDefault])).toEqual([
                ["Primeiro", false],
                ["Segundo", true],
            ]);
            const [otherDefault] = await service.list(OTHER_PROJECT_ID);
            expect(otherDefault?.isDefault).toBe(true);
        });

        it("rejects an unknown flow with NotFoundError", async () => {
            await expect(service.setDefault("flw_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("getDraft", () => {
        it("rejects an unknown flow with NotFoundError", async () => {
            await expect(service.getDraft("flw_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("saveDraft", () => {
        it("stores the graph and advances the revision and the update time", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            clock.advance(ONE_MINUTE_MS);

            const draft = await service.saveDraft(flow.id, buildCanonicalFlow(), 1);

            expect(draft).toEqual({
                flowId: flow.id,
                graph: buildCanonicalFlow(),
                revision: 2,
                updatedAt: minutesAfterCreation(1),
            });
            await expect(service.getDraft(flow.id)).resolves.toEqual(draft);
        });

        it("accepts a graph with semantic errors, since it is only a draft", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            const draft = await service.saveDraft(flow.id, GRAPH_WITHOUT_TRIGGER, 1);

            expect(draft.graph).toEqual(GRAPH_WITHOUT_TRIGGER);
        });

        it("rejects a stale expected revision with ConflictError", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            await service.saveDraft(flow.id, buildCanonicalFlow(), 1);

            const saving = service.saveDraft(flow.id, GRAPH_WITHOUT_TRIGGER, 1);

            await expect(saving).rejects.toThrow(ConflictError);
            await expect(service.getDraft(flow.id)).resolves.toMatchObject({
                graph: buildCanonicalFlow(),
                revision: 2,
            });
        });

        it("rejects a graph with an invalid shape with DomainValidationError", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            const malformedGraph = { ...GRAPH_WITHOUT_TRIGGER, schemaVersion: 2 };

            const saving = service.saveDraft(flow.id, malformedGraph as unknown as FlowGraph, 1);

            await expect(saving).rejects.toThrow(DomainValidationError);
        });

        it("rejects an unknown flow with NotFoundError", async () => {
            const saving = service.saveDraft("flw_inexistente", GRAPH_WITHOUT_TRIGGER, 1);

            await expect(saving).rejects.toThrow(NotFoundError);
        });
    });

    describe("publish", () => {
        it("publishes the draft as version 1 with the note and the publication time", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            const draft = await service.getDraft(flow.id);

            const version = await service.publish(flow.id, "Primeira versão");

            expect(version).toEqual({
                flowId: flow.id,
                version: 1,
                graph: draft.graph,
                publishedAt: CREATED_AT.toISOString(),
                note: "Primeira versão",
            });
            await expect(service.getVersion(flow.id, 1)).resolves.toEqual(version);
        });

        it("numbers each version after the last one of the same flow", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            const otherFlow = await service.create(PROJECT_ID, { name: "Revisão" });
            await service.publish(otherFlow.id);

            const first = await service.publish(flow.id);
            const second = await service.publish(flow.id);

            expect([first.version, second.version]).toEqual([1, 2]);
        });

        it("emits flow.published with the project, the flow and the version", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            await service.publish(flow.id);

            expect(events.since(0).map((envelope) => envelope.event)).toEqual([
                { type: "flow.published", projectId: PROJECT_ID, flowId: flow.id, version: 1 },
            ]);
        });

        it("refuses a graph with errors and reports the validation issues", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            await service.saveDraft(flow.id, GRAPH_WITHOUT_TRIGGER, 1);

            const error = await captureRejection(service.publish(flow.id));

            expect(error).toBeInstanceOf(DomainValidationError);
            expect(error).toMatchObject({
                details: [expect.objectContaining({ level: "error", code: "no_trigger" })],
            });
            await expect(service.listVersions(flow.id)).resolves.toEqual([]);
            expect(events.since(0)).toEqual([]);
        });

        it("checks the prompt variables of agent nodes", async () => {
            const graph = buildCanonicalFlow();
            const flow = await service.create(PROJECT_ID, { name: "Entrega", graph });
            await service.saveDraft(
                flow.id,
                withTechLeadPrompt(graph, "{{inputs.inexistente}}"),
                1,
            );

            const error = await captureRejection(service.publish(flow.id));

            expect(error).toMatchObject({
                details: [expect.objectContaining({ code: "unknown_variable" })],
            });
        });

        it("validates against the project's tool profiles and credentials", async () => {
            validationContext = { knownToolProfileIds: [], knownCredentialIds: [] };
            const flow = await service.create(PROJECT_ID, {
                name: "Entrega",
                graph: buildCanonicalFlow(),
            });

            const error = await captureRejection(service.publish(flow.id));

            expect(error).toMatchObject({
                details: expect.arrayContaining([
                    expect.objectContaining({ code: "unknown_tool_profile" }),
                ]) as unknown,
            });
        });

        it("rejects an unknown flow with NotFoundError", async () => {
            await expect(service.publish("flw_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("versions", () => {
        it("keeps the published version unchanged when the draft is edited", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            const published = await service.publish(flow.id);

            await service.saveDraft(flow.id, buildCanonicalFlow(), 1);

            await expect(service.getVersion(flow.id, 1)).resolves.toEqual(published);
        });

        it("lists the versions in order without their graphs", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            await service.publish(flow.id, "Primeira");
            clock.advance(ONE_MINUTE_MS);
            await service.publish(flow.id);

            const versions = await service.listVersions(flow.id);

            expect(versions).toEqual([
                {
                    flowId: flow.id,
                    version: 1,
                    publishedAt: CREATED_AT.toISOString(),
                    note: "Primeira",
                },
                { flowId: flow.id, version: 2, publishedAt: minutesAfterCreation(1) },
            ]);
        });

        it("rejects an unknown version with NotFoundError", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            await expect(service.getVersion(flow.id, 1)).rejects.toThrow(NotFoundError);
        });

        it("rejects listing the versions of an unknown flow with NotFoundError", async () => {
            await expect(service.listVersions("flw_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("restoreVersionToDraft", () => {
        it("copies the version's graph into the draft as a new revision", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });
            const published = await service.publish(flow.id);
            await service.saveDraft(flow.id, buildCanonicalFlow(), 1);
            clock.advance(ONE_MINUTE_MS);

            const draft = await service.restoreVersionToDraft(flow.id, 1);

            expect(draft).toEqual({
                flowId: flow.id,
                graph: published.graph,
                revision: 3,
                updatedAt: minutesAfterCreation(1),
            });
            await expect(service.getDraft(flow.id)).resolves.toEqual(draft);
        });

        it("rejects an unknown version with NotFoundError", async () => {
            const flow = await service.create(PROJECT_ID, { name: "Entrega" });

            const restoring = service.restoreVersionToDraft(flow.id, 1);

            await expect(restoring).rejects.toThrow(NotFoundError);
        });
    });
});

function insertProject(database: DatabaseHandle, projectId: string): void {
    new ProjectRepository(database.db).insert({
        id: projectId,
        name: projectId,
        repoPath: `/repos/${projectId}`,
        baseBranch: "main",
        detected: { codegraph: false, codingStandards: false, sandcastle: false },
        createdAt: CREATED_AT.toISOString(),
        updatedAt: CREATED_AT.toISOString(),
    });
}

function withTechLeadPrompt(graph: FlowGraph, prompt: string): FlowGraph {
    const nodes = graph.nodes.map((node) => {
        if (node.type !== "agent" || node.id !== "tl") {
            return node;
        }

        return { ...node, config: { ...node.config, prompt } };
    });

    return { ...graph, nodes };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error("Expected the promise to reject");
}

import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { ValidationContext } from "@/engine/graph_validation.js";
import { checkPromptVariables } from "@/engine/prompt_template.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { FlowRepository } from "@/server/flows/flow_repository.js";
import { FLOW_FILE_FORMAT_VERSION, yamlToFlow } from "@/server/flows/flow_yaml.js";
import type { FlowFile } from "@/server/flows/flow_yaml.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { AuditLog } from "@/server/security/audit_log.js";
import { FlowGraphParseError, parseFlowGraph } from "@/shared/flow_graph.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { DRAFT_VERSION } from "@/shared/flow_types.js";
import type {
    ExportedFlowVersion,
    FlowDraft,
    FlowSummary,
    FlowVersion,
    FlowVersionSummary,
} from "@/shared/flow_types.js";
import { createDefaultNode } from "@/shared/node_defaults.js";

const DEFAULT_TRIGGER_NODE_ID = "trigger";
const CANVAS_ORIGIN = { x: 0, y: 0 };
const FIRST_VERSION = 1;

export interface FlowService {
    create(projectId: string, input: { name: string; graph?: FlowGraph }): Promise<FlowSummary>;
    list(projectId: string, opts?: { includeArchived?: boolean }): Promise<FlowSummary[]>;
    rename(flowId: string, name: string): Promise<FlowSummary>;
    /** Unmarks the other flows of the project. */
    setDefault(flowId: string): Promise<void>;
    archive(flowId: string): Promise<void>;
    getDraft(flowId: string): Promise<FlowDraft>;
    /** @throws ConflictError when the draft is no longer at `expectedRevision` */
    saveDraft(flowId: string, graph: FlowGraph, expectedRevision: number): Promise<FlowDraft>;
    /** @throws DomainValidationError with the `ValidationIssue`s as details */
    publish(flowId: string, note?: string): Promise<FlowVersion>;
    getVersion(flowId: string, version: number): Promise<FlowVersion>;
    listVersions(flowId: string): Promise<FlowVersionSummary[]>;
    restoreVersionToDraft(flowId: string, version: number): Promise<FlowDraft>;
    exportFlow(flowId: string, version: ExportedFlowVersion): Promise<FlowFile>;
    /** @throws FlowFileError when the YAML is broken or is not a valid flow file */
    importFlow(projectId: string, yamlText: string): Promise<FlowSummary>;
}

export interface FlowServiceDeps {
    repo: FlowRepository;
    events: EventBus;
    clock: Clock;
    audit: AuditLog;
    validationContext(projectId: string): Promise<ValidationContext>;
}

export function createFlowService(deps: FlowServiceDeps): FlowService {
    const { repo } = deps;

    return {
        create: (projectId, input) => resolveWith(() => createFlow(deps, projectId, input)),
        list: (projectId, options) => resolveWith(() => listFlows(repo, projectId, options)),
        rename: (flowId, name) => resolveWith(() => renameFlow(repo, flowId, name)),
        setDefault: (flowId) => resolveWith(() => setDefaultFlow(repo, flowId)),
        archive: (flowId) => resolveWith(() => archiveFlow(repo, flowId)),
        getDraft: (flowId) => resolveWith(() => findDraftOrThrow(repo, flowId)),
        saveDraft: (flowId, graph, expectedRevision) =>
            resolveWith(() => saveDraft(deps, { flowId, graph, expectedRevision })),
        publish: (flowId, note) => publishDraft(deps, flowId, note),
        getVersion: (flowId, version) =>
            resolveWith(() => findVersionOrThrow(repo, flowId, version)),
        listVersions: (flowId) => resolveWith(() => listVersions(repo, flowId)),
        restoreVersionToDraft: (flowId, version) =>
            resolveWith(() => restoreVersionToDraft(deps, flowId, version)),
        exportFlow: (flowId, version) => resolveWith(() => exportFlow(deps, flowId, version)),
        importFlow: (projectId, yamlText) =>
            resolveWith(() => importFlow(deps, projectId, yamlText)),
    };
}

function createFlow(
    deps: FlowServiceDeps,
    projectId: string,
    input: { name: string; graph?: FlowGraph },
): FlowSummary {
    assertProjectExists(deps.repo, projectId);

    const id = newId("flw");
    deps.repo.insert({
        id,
        projectId,
        name: input.name,
        graph: parseDraftGraph(input.graph ?? createDefaultFlowGraph()),
        createdAt: deps.clock.now().toISOString(),
    });

    return findFlowOrThrow(deps.repo, id);
}

function createDefaultFlowGraph(): FlowGraph {
    return {
        schemaVersion: 1,
        nodes: [createDefaultNode("trigger", DEFAULT_TRIGGER_NODE_ID, CANVAS_ORIGIN)],
        edges: [],
        groups: [],
    };
}

function listFlows(
    repo: FlowRepository,
    projectId: string,
    options: { includeArchived?: boolean } = {},
): FlowSummary[] {
    assertProjectExists(repo, projectId);

    return repo.listSummaries(projectId, { includeArchived: options.includeArchived ?? false });
}

function renameFlow(repo: FlowRepository, flowId: string, name: string): FlowSummary {
    const flow = findFlowOrThrow(repo, flowId);
    repo.rename(flowId, name);

    return { ...flow, name };
}

function setDefaultFlow(repo: FlowRepository, flowId: string): void {
    const flow = findFlowOrThrow(repo, flowId);
    repo.markAsDefault(flow);
}

function archiveFlow(repo: FlowRepository, flowId: string): void {
    findFlowOrThrow(repo, flowId);
    repo.archive(flowId);
}

function saveDraft(
    deps: FlowServiceDeps,
    change: { flowId: string; graph: FlowGraph; expectedRevision: number },
): FlowDraft {
    findFlowOrThrow(deps.repo, change.flowId);

    const isSaved = deps.repo.replaceDraftIfRevisionMatches({
        flowId: change.flowId,
        graph: parseDraftGraph(change.graph),
        expectedRevision: change.expectedRevision,
        updatedAt: deps.clock.now().toISOString(),
    });
    if (!isSaved) {
        throw new ConflictError(
            `O rascunho foi alterado depois da revisão ${change.expectedRevision}. ` +
                "Recarregue o fluxo antes de salvar.",
        );
    }

    return findDraftOrThrow(deps.repo, change.flowId);
}

// A draft may be semantically invalid while it is being edited; only its shape must hold.
function parseDraftGraph(graph: FlowGraph): FlowGraph {
    try {
        return parseFlowGraph(graph);
    } catch (error) {
        if (error instanceof FlowGraphParseError) {
            throw new DomainValidationError(error.message, error.issues);
        }
        throw error;
    }
}

async function publishDraft(
    deps: FlowServiceDeps,
    flowId: string,
    note: string | undefined,
): Promise<FlowVersion> {
    const { projectId } = findFlowOrThrow(deps.repo, flowId);
    const context = await deps.validationContext(projectId);
    const published = publishDraftAsNextVersion(deps, { flowId, note, context });
    await deps.audit.record(
        "flow.published",
        { kind: "flow", id: flowId },
        { version: published.version },
    );

    return published;
}

// Synchronous from reading the draft to inserting the version, so no other save or publish of the
// same flow can interleave and two versions never get the same number.
function publishDraftAsNextVersion(
    deps: FlowServiceDeps,
    request: { flowId: string; note: string | undefined; context: ValidationContext },
): FlowVersion {
    const flow = findFlowOrThrow(deps.repo, request.flowId);
    const draft = findDraftOrThrow(deps.repo, request.flowId);
    assertGraphIsPublishable(draft.graph, request.context);

    const version: FlowVersion = {
        flowId: flow.id,
        version: nextVersionNumber(flow),
        graph: draft.graph,
        publishedAt: deps.clock.now().toISOString(),
        note: request.note,
    };
    deps.repo.insertVersion(version);
    deps.events.publish({
        type: "flow.published",
        projectId: flow.projectId,
        flowId: flow.id,
        version: version.version,
    });

    return version;
}

function nextVersionNumber(flow: FlowSummary): number {
    if (flow.latestVersion === undefined) {
        return FIRST_VERSION;
    }

    return flow.latestVersion + 1;
}

function assertGraphIsPublishable(graph: FlowGraph, context: ValidationContext): void {
    const issues = validateFlowGraph(graph, { ...context, checkPrompt: checkPromptVariables });
    const hasErrors = issues.some((issue) => issue.level === "error");
    if (hasErrors) {
        throw new DomainValidationError("O fluxo tem erros e não pode ser publicado.", issues);
    }
}

function listVersions(repo: FlowRepository, flowId: string): FlowVersionSummary[] {
    findFlowOrThrow(repo, flowId);

    return repo.listVersions(flowId);
}

function restoreVersionToDraft(
    deps: FlowServiceDeps,
    flowId: string,
    versionNumber: number,
): FlowDraft {
    const version = findVersionOrThrow(deps.repo, flowId, versionNumber);
    deps.repo.replaceDraft({
        flowId,
        graph: version.graph,
        updatedAt: deps.clock.now().toISOString(),
    });

    return findDraftOrThrow(deps.repo, flowId);
}

function exportFlow(deps: FlowServiceDeps, flowId: string, version: ExportedFlowVersion): FlowFile {
    const flow = findFlowOrThrow(deps.repo, flowId);

    return {
        forja: FLOW_FILE_FORMAT_VERSION,
        name: flow.name,
        exportedAt: deps.clock.now().toISOString(),
        graph: findGraphToExport(deps.repo, flowId, version),
    };
}

function findGraphToExport(
    repo: FlowRepository,
    flowId: string,
    version: ExportedFlowVersion,
): FlowGraph {
    if (version === DRAFT_VERSION) {
        return findDraftOrThrow(repo, flowId).graph;
    }

    return findVersionOrThrow(repo, flowId, version).graph;
}

function importFlow(deps: FlowServiceDeps, projectId: string, yamlText: string): FlowSummary {
    const { name, graph } = yamlToFlow(yamlText);

    return createFlow(deps, projectId, { name, graph });
}

function assertProjectExists(repo: FlowRepository, projectId: string): void {
    if (!repo.projectExists(projectId)) {
        throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
    }
}

function findFlowOrThrow(repo: FlowRepository, flowId: string): FlowSummary {
    const flow = repo.findSummary(flowId);
    if (!flow) {
        throw flowNotFoundError(flowId);
    }

    return flow;
}

function findDraftOrThrow(repo: FlowRepository, flowId: string): FlowDraft {
    const draft = repo.findDraft(flowId);
    if (!draft) {
        throw flowNotFoundError(flowId);
    }

    return draft;
}

function flowNotFoundError(flowId: string): NotFoundError {
    return new NotFoundError(`Fluxo ${flowId} não encontrado.`);
}

function findVersionOrThrow(repo: FlowRepository, flowId: string, version: number): FlowVersion {
    const flowVersion = repo.findVersion(flowId, version);
    if (!flowVersion) {
        throw new NotFoundError(`Versão ${version} do fluxo ${flowId} não encontrada.`);
    }

    return flowVersion;
}

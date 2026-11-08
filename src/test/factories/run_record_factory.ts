import type { ArtifactRecord, RunRecord } from "@/server/runs/run_repository.js";
import { buildRunState } from "@/test/factories/run_state_factory.js";

const ARTIFACT_CREATED_AT = "2026-01-01T12:05:00.000Z";

export function buildRunRecord(overrides: Partial<RunRecord> = {}): RunRecord {
    return { ...buildRunState(), itemIds: [], failedItemIds: [], ...overrides };
}

export function buildArtifactRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
    return {
        id: "artifact-1",
        nodeRunId: "node-run-1",
        runId: "run-1",
        name: "summary",
        kind: "text",
        value: "Resumo da execução",
        createdAt: ARTIFACT_CREATED_AT,
        ...overrides,
    };
}

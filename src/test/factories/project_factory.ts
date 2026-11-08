import type { Project } from "@/shared/project_types.js";

const CREATED_AT = "2026-05-04T09:00:00.000Z";

export function buildProject(overrides: Partial<Project> = {}): Project {
    const id = overrides.id ?? "prj_forja";

    return {
        id,
        name: id,
        repoPath: `/repos/${id}`,
        baseBranch: "main",
        detected: { codegraph: false, codingStandards: false, sandcastle: false },
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        ...overrides,
    };
}

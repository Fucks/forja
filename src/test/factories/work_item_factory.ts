import type { GithubIssueData, LocalItemInput, WorkItem } from "@/shared/work_item_types.js";

export function buildLocalItemInput(overrides: Partial<LocalItemInput> = {}): LocalItemInput {
    return { title: "Tela de login", body: "", labels: [], blockedBy: [], ...overrides };
}

export function buildGithubIssue(overrides: Partial<GithubIssueData> = {}): GithubIssueData {
    const number = overrides.number ?? 1;

    return {
        number,
        title: `Issue ${number}`,
        body: "",
        url: `https://github.com/Fucks/forja/issues/${number}`,
        labels: [],
        state: "open",
        blockedByNumbers: [],
        ...overrides,
    };
}

const CREATED_AT = "2026-05-04T09:00:00.000Z";

export function buildWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
    const id = overrides.id ?? "itm_github7";

    return {
        id,
        projectId: "prj_forja",
        source: "github",
        number: 7,
        url: "https://github.com/Fucks/forja/issues/7",
        title: "Issue 7",
        body: "",
        labels: [],
        state: "open",
        blockedBy: [],
        branch: "forja/issue-7",
        archived: false,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        ...overrides,
    };
}

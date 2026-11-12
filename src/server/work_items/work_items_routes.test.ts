import type { FastifyInstance } from "fastify";

import { systemClock } from "@/lib/clock.js";
import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import type { BoardView, ItemTimeline } from "@/shared/board_types.js";
import type { LocalItemInput, WorkItem } from "@/shared/work_item_types.js";
import { buildNodeRunState } from "@/test/factories/node_run_state_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildArtifactRecord, buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const GITHUB_SYNC_INTERVAL_MS = 5 * 60_000;
const GITHUB_PROJECT_ID = "prj_github";
const GITHUB_REPO = "Fucks/forja";
const OPEN_ISSUE_JSON = {
    number: 17,
    title: "Sincronizar issues",
    body: "",
    url: "https://github.com/Fucks/forja/issues/17",
    labels: [{ name: "forja" }],
    state: "OPEN",
};

const PR_BRANCH = "forja/issue-17";
const MERGED_PULL_REQUEST_JSON = {
    number: 40,
    url: "https://github.com/Fucks/forja/pull/40",
    state: "MERGED",
    headRefName: PR_BRANCH,
    baseRefName: "main",
    mergedAt: "2026-11-12T10:00:00Z",
};

function isGhIssueList(args: string[]): boolean {
    return args[0] === "issue" && args[1] === "list";
}

function repoArgumentOf(args: string[]): string | undefined {
    return args[args.indexOf("--repo") + 1];
}

describe("work items routes", () => {
    let database: DatabaseHandle;
    let app: FastifyInstance;
    let commands: FakeCommandRunner;

    beforeEach(async () => {
        database = createTestDb();
        const projects = new ProjectRepository(database.db);
        projects.insert(buildProject({ id: PROJECT_ID }));
        projects.insert(buildProject({ id: GITHUB_PROJECT_ID, githubRepo: GITHUB_REPO }));
        commands = new FakeCommandRunner();
        app = await buildApp(createTestAppDeps(database.db, { commands }));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    async function createItem(payload: Partial<LocalItemInput> = {}): Promise<WorkItem> {
        const response = await app.inject({
            method: "POST",
            url: `/api/projects/${PROJECT_ID}/work-items`,
            payload: { title: "Tela de login", ...payload },
        });
        return response.json<WorkItem>();
    }

    function insertGithubItem(): WorkItem {
        const githubItem = buildWorkItem({ projectId: PROJECT_ID });
        new WorkItemRepository(database.db).insert(githubItem);
        return githubItem;
    }

    describe("POST /api/projects/:projectId/work-items", () => {
        it("answers 201 with the new local item and its branch", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "Tela de login" },
            });

            expect(response.statusCode).toBe(201);
            expect(response.json()).toMatchObject({
                projectId: PROJECT_ID,
                source: "local",
                title: "Tela de login",
                body: "",
                labels: [],
                blockedBy: [],
                state: "open",
                branch: expect.stringMatching(/^forja\/item-/) as unknown,
            });
        });

        it("answers 400 when the title is blank", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "   " },
            });

            expect(response.statusCode).toBe(400);
            expect(response.json()).toMatchObject({ error: { code: "validation_error" } });
        });

        it("answers 422 when a blocker is unknown", async () => {
            const response = await app.inject({
                method: "POST",
                url: `/api/projects/${PROJECT_ID}/work-items`,
                payload: { title: "Tela de login", blockedBy: ["itm_nenhum"] },
            });

            expect(response.statusCode).toBe(422);
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({
                method: "POST",
                url: "/api/projects/prj_nenhum/work-items",
                payload: { title: "Tela de login" },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("GET /api/projects/:projectId/work-items", () => {
        it("lists the items filtered by the query", async () => {
            const frontend = await createItem({ labels: ["frontend"] });
            await createItem({ labels: ["backend"] });

            const response = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items?label=frontend&state=open`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json<WorkItem[]>().map((item) => item.id)).toEqual([frontend.id]);
        });

        it("includes archived items when asked", async () => {
            const item = await createItem();
            await app.inject({ method: "POST", url: `/api/work-items/${item.id}/archive` });

            const withoutArchived = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items`,
            });
            const withArchived = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/work-items?includeArchived=true`,
            });

            expect(withoutArchived.json()).toEqual([]);
            expect(withArchived.json<WorkItem[]>().map((listed) => listed.id)).toEqual([item.id]);
        });
    });

    describe("GET /api/work-items/:id", () => {
        it("answers the item", async () => {
            const item = await createItem();

            const response = await app.inject({ method: "GET", url: `/api/work-items/${item.id}` });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual(item);
        });

        it("answers 404 for an unknown item", async () => {
            const response = await app.inject({ method: "GET", url: "/api/work-items/itm_nenhum" });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("PATCH /api/work-items/:id", () => {
        it("edits only the fields sent", async () => {
            const item = await createItem({ body: "Descrição", labels: ["frontend"] });

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${item.id}`,
                payload: { title: "Novo título", state: "closed" },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                title: "Novo título",
                state: "closed",
                body: "Descrição",
                labels: ["frontend"],
                branch: item.branch,
            });
        });

        it("answers 409 for a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${githubItem.id}`,
                payload: { title: "Outro" },
            });

            expect(response.statusCode).toBe(409);
            expect(response.json()).toMatchObject({ error: { code: "conflict" } });
        });

        it("answers 400 for an unknown state", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "PATCH",
                url: `/api/work-items/${item.id}`,
                payload: { state: "merged" },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/work-items/:id/column", () => {
        it("sets the manual column of a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${githubItem.id}/column`,
                payload: { column: "done" },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ manualColumn: "done" });
        });

        it("clears the manual column with null", async () => {
            const item = await createItem();
            await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: "needs_human" },
            });

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: null },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).not.toHaveProperty("manualColumn");
        });

        it("answers 400 for an unknown column", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/column`,
                payload: { column: "review" },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/work-items/:id/archive", () => {
        it("answers the archived local item", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${item.id}/archive`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ id: item.id, archived: true });
        });

        it("answers 409 for a GitHub item", async () => {
            const githubItem = insertGithubItem();

            const response = await app.inject({
                method: "POST",
                url: `/api/work-items/${githubItem.id}/archive`,
            });

            expect(response.statusCode).toBe(409);
        });
    });

    describe("POST /api/projects/:projectId/work-items/sync", () => {
        function syncProject(projectId: string, query = "") {
            return app.inject({
                method: "POST",
                url: `/api/projects/${projectId}/work-items/sync${query}`,
            });
        }

        function scriptOpenIssueOnGithub(): void {
            commands
                .when("gh", isGhIssueList)
                .returns({ stdout: JSON.stringify([OPEN_ISSUE_JSON]) });
            commands
                .when("gh", (args) => args[0] === "api")
                .returns({ exitCode: 1, stderr: "gh: Not Found (HTTP 404)" });
        }

        it("answers with the result of importing the open issues of the project", async () => {
            scriptOpenIssueOnGithub();

            const response = await syncProject(GITHUB_PROJECT_ID);

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ created: 1, updated: 0, closed: 0 });
        });

        it("lists only the issues with the label of the query", async () => {
            scriptOpenIssueOnGithub();

            await syncProject(GITHUB_PROJECT_ID, "?label=forja");

            const [listCall] = commands.calls;
            expect(listCall?.args).toEqual(expect.arrayContaining(["--label", "forja"]));
        });

        it("answers with the error when the project has no GitHub repository", async () => {
            const response = await syncProject(PROJECT_ID);

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ error: "Projeto sem repositório GitHub" });
        });

        it("answers 404 for an unknown project", async () => {
            const response = await syncProject("prj_desconhecido");

            expect(response.statusCode).toBe(404);
        });
    });

    describe("POST /api/projects/:projectId/pull-requests/sync", () => {
        function syncPullRequests(projectId: string) {
            return app.inject({
                method: "POST",
                url: `/api/projects/${projectId}/pull-requests/sync`,
            });
        }

        it("answers what the sync did with the pull requests of the project", async () => {
            const response = await syncPullRequests(GITHUB_PROJECT_ID);

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ merged: 0, closedIssues: 0, deletedBranches: 0 });
        });

        it("answers 404 for an unknown project", async () => {
            const response = await syncPullRequests("prj_desconhecido");

            expect(response.statusCode).toBe(404);
        });
    });

    describe("GET /api/projects/:projectId/board", () => {
        it("shows the items in the backlog of the fixed columns while no flow is published", async () => {
            const item = await createItem();

            const response = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/board`,
            });

            expect(response.statusCode).toBe(200);
            const board = response.json<BoardView>();
            expect(board.columns.map((column) => column.id)).toEqual([
                "backlog",
                "blocked",
                "needs_human",
                "done",
            ]);
            expect(board.cards).toEqual([{ item, columnId: "backlog" }]);
        });

        it("shows an empty board for a project without items", async () => {
            const response = await app.inject({
                method: "GET",
                url: `/api/projects/${PROJECT_ID}/board`,
            });

            expect(response.statusCode).toBe(200);
            expect(response.json<BoardView>().cards).toEqual([]);
        });

        it("answers 404 for an unknown project", async () => {
            const response = await app.inject({ method: "GET", url: "/api/projects/nope/board" });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("GET /api/work-items/:id/timeline", () => {
        it("answers an empty timeline for an item that never ran", async () => {
            const item = await createItem();

            const response = await app.inject({ url: `/api/work-items/${item.id}/timeline` });

            expect(response.statusCode).toBe(200);
            expect(response.json<ItemTimeline>()).toEqual({ entries: [], totalCostUsd: 0 });
        });

        it("answers 404 for an unknown item", async () => {
            const response = await app.inject({ url: "/api/work-items/itm_missing/timeline" });

            expect(response.statusCode).toBe(404);
        });
    });

    describe("periodic GitHub sync", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("syncs the projects with a GitHub repository every five minutes once ready", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            commands.when("gh", isGhIssueList).returns({ stdout: "[]" });
            await app.ready();

            await vi.advanceTimersByTimeAsync(GITHUB_SYNC_INTERVAL_MS);

            const listedRepos = commands.calls.map((call) => repoArgumentOf(call.args));
            expect(listedRepos).toEqual([GITHUB_REPO]);
        });

        it("moves the items whose pull request was merged to Concluído in the same round", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            const item = await insertItemWithForjaPullRequest();
            scriptMergedPullRequestOnGithub();
            await app.ready();

            await vi.advanceTimersByTimeAsync(GITHUB_SYNC_INTERVAL_MS);

            const response = await app.inject({ method: "GET", url: `/api/work-items/${item.id}` });
            expect(response.json<WorkItem>().manualColumn).toBe("done");
        });

        async function insertItemWithForjaPullRequest(): Promise<WorkItem> {
            const item = buildWorkItem({ projectId: GITHUB_PROJECT_ID, branch: PR_BRANCH });
            new WorkItemRepository(database.db).insert(item);
            const runs = new SqliteRunRepository(database.db, systemClock);
            await runs.createRun(buildRunRecord({ id: "run_pr", projectId: GITHUB_PROJECT_ID }));
            await runs.saveTransition({
                nodeRuns: [
                    buildNodeRunState({ id: "nr_pr", runId: "run_pr", workItemId: item.id }),
                ],
                artifacts: [
                    buildArtifactRecord({
                        nodeRunId: "nr_pr",
                        runId: "run_pr",
                        name: "pr_url",
                        kind: "pr_url",
                        value: MERGED_PULL_REQUEST_JSON.url,
                        createdAt: systemClock.now().toISOString(),
                    }),
                ],
            });
            return item;
        }

        function scriptMergedPullRequestOnGithub(): void {
            commands
                .when("gh", (args) => args[0] === "pr" && args[1] === "list")
                .returns({ stdout: JSON.stringify([MERGED_PULL_REQUEST_JSON]) });
            commands
                .when("gh", (args) => args[0] === "issue" && args[1] === "view")
                .returns({ stdout: JSON.stringify({ ...OPEN_ISSUE_JSON, state: "CLOSED" }) });
            commands
                .when("gh", (args) => args[0] === "api")
                .returns({ exitCode: 1, stderr: "gh: Not Found (HTTP 404)" });
            commands.when("gh", isGhIssueList).returns({ stdout: "[]" });
        }
    });
});

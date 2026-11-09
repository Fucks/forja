import { GitHubError } from "@/integrations/github/github_provider.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { syncGithubIssues } from "@/server/work_items/github_sync.js";
import type { GithubSyncDeps } from "@/server/work_items/github_sync.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildGithubIssue } from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestDb } from "@/test/test_db.js";

const SYNCED_AT = new Date("2026-11-09T12:00:00Z");
const PROJECT_ID = "prj_forja";
const LOCAL_PROJECT_ID = "prj_local";
const REPO = "Fucks/forja";

describe("syncGithubIssues", () => {
    let database: DatabaseHandle;
    let github: FakeGitHubProvider;
    let deps: GithubSyncDeps;

    beforeEach(() => {
        database = createTestDb();
        const projectRepo = new ProjectRepository(database.db);
        projectRepo.insert(buildProject({ id: PROJECT_ID, githubRepo: REPO }));
        projectRepo.insert(buildProject({ id: LOCAL_PROJECT_ID }));
        const clock = new FakeClock(SYNCED_AT);
        github = new FakeGitHubProvider();
        deps = {
            projects: createProjectService({
                repo: projectRepo,
                git: new FakeGitProvider(),
                fileExists: () => false,
                clock,
            }),
            items: createWorkItemService({
                repo: new WorkItemRepository(database.db),
                events: createEventBus(clock),
                clock,
            }),
            github,
            clock,
        };
    });

    afterEach(() => {
        database.close();
    });

    function itemsOfProject(): Promise<WorkItem[]> {
        return deps.items.list(PROJECT_ID);
    }

    function itemNumbered(items: WorkItem[], number: number): WorkItem | undefined {
        return items.find((item) => item.number === number);
    }

    it("creates an item for each open issue on the first sync", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1, title: "Login" }));
        github.addIssue(REPO, buildGithubIssue({ number: 2, title: "Cadastro" }));

        const result = await syncGithubIssues(PROJECT_ID, deps);

        expect(result).toEqual({ created: 2, updated: 0, closed: 0, at: SYNCED_AT.toISOString() });
        const titles = (await itemsOfProject()).map((item) => item.title);
        expect(titles).toEqual(expect.arrayContaining(["Login", "Cadastro"]));
    });

    it("changes nothing on a second sync without changes on GitHub", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1 }));
        await syncGithubIssues(PROJECT_ID, deps);
        const itemsAfterFirstSync = await itemsOfProject();

        const result = await syncGithubIssues(PROJECT_ID, deps);

        expect(result).toMatchObject({ created: 0, updated: 0, closed: 0 });
        const [item] = await itemsOfProject();
        expect(item?.updatedAt).toBe(itemsAfterFirstSync[0]?.updatedAt);
    });

    it("closes the item of an issue closed on GitHub", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1 }));
        await syncGithubIssues(PROJECT_ID, deps);
        await github.closeIssue(REPO, 1);

        const result = await syncGithubIssues(PROJECT_ID, deps);

        expect(result).toMatchObject({ created: 0, updated: 0, closed: 1 });
        const [item] = await itemsOfProject();
        expect(item?.state).toBe("closed");
    });

    it("keeps open a known item that is still open but left the listing", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1 }));
        github.addIssue(REPO, buildGithubIssue({ number: 2 }));
        await syncGithubIssues(PROJECT_ID, deps);

        const result = await syncGithubIssues(PROJECT_ID, deps, { limit: 1 });

        expect(result).toMatchObject({ created: 0, updated: 0, closed: 0 });
        const states = (await itemsOfProject()).map((item) => item.state);
        expect(states).toEqual(["open", "open"]);
    });

    it("resolves the issues that block an issue to the ids of their items", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1, blockedByNumbers: [2] }));
        github.addIssue(REPO, buildGithubIssue({ number: 2 }));

        await syncGithubIssues(PROJECT_ID, deps);

        const items = await itemsOfProject();
        const blocker = itemNumbered(items, 2);
        expect(itemNumbered(items, 1)?.blockedBy).toEqual([blocker?.id]);
    });

    it("lists only the open issues with the label and up to the limit", async () => {
        github.addIssue(REPO, buildGithubIssue({ number: 1, labels: ["forja"] }));
        github.addIssue(REPO, buildGithubIssue({ number: 2, labels: ["forja"] }));
        github.addIssue(REPO, buildGithubIssue({ number: 3 }));
        github.addIssue(REPO, buildGithubIssue({ number: 4, labels: ["forja"], state: "closed" }));

        const result = await syncGithubIssues(PROJECT_ID, deps, { label: "forja", limit: 1 });

        expect(result.created).toBe(1);
        expect((await itemsOfProject()).map((item) => item.number)).toEqual([1]);
    });

    it("returns an error without throwing when the project has no GitHub repository", async () => {
        const result = await syncGithubIssues(LOCAL_PROJECT_ID, deps);

        expect(result).toEqual({
            created: 0,
            updated: 0,
            closed: 0,
            at: SYNCED_AT.toISOString(),
            error: "Projeto sem repositório GitHub",
        });
    });

    it("returns the provider failure in the result without throwing", async () => {
        vi.spyOn(github, "listIssues").mockRejectedValue(
            new GitHubError("Falha ao executar gh issue", "gh: not logged in"),
        );

        const result = await syncGithubIssues(PROJECT_ID, deps);

        expect(result).toMatchObject({ created: 0, error: "Falha ao executar gh issue" });
    });
});

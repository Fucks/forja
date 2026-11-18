import { GitHubError } from "@/integrations/github/github_provider.js";
import type { GithubIssue } from "@/integrations/github/github_provider.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createSourcePreviewer, SourcePreviewFailedError } from "@/server/flows/source_preview.js";
import type { SourcePreviewer } from "@/server/flows/source_preview.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import {
    createWorkItemService,
    type WorkItemService,
} from "@/server/work_items/work_item_service.js";
import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildGithubIssue, buildLocalItemInput } from "@/test/factories/work_item_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestDb } from "@/test/test_db.js";

const GITHUB_REPO = "Fucks/forja";
const GITHUB_PROJECT = buildProject({ id: "prj_github", githubRepo: GITHUB_REPO });
const LOCAL_PROJECT = buildProject({ id: "prj_local", repoPath: "/repos/local" });
const SANDCASTLE_LABEL = "Sandcastle";
const GITHUB_SOURCE = sourceConfigSchema.parse({ provider: "github", label: SANDCASTLE_LABEL });
const LOCAL_SOURCE = sourceConfigSchema.parse({ provider: "local" });

class FailingGitHubProvider extends FakeGitHubProvider {
    override listIssues(): Promise<GithubIssue[]> {
        return Promise.reject(new GitHubError("gh falhou", "HTTP 401: Bad credentials"));
    }
}

describe("previewSourceItems", () => {
    let database: DatabaseHandle;
    let workItems: WorkItemService;
    let github: FakeGitHubProvider;
    let githubProjectIds: string[];

    beforeEach(() => {
        database = createTestDb();
        const projectRepo = new ProjectRepository(database.db);
        projectRepo.insert(GITHUB_PROJECT);
        projectRepo.insert(LOCAL_PROJECT);
        const clock = new FakeClock();
        workItems = createWorkItemService({
            repo: new WorkItemRepository(database.db),
            events: createEventBus(clock),
            clock,
        });
        github = new FakeGitHubProvider();
        githubProjectIds = [];
    });

    afterEach(() => {
        database.close();
    });

    function createPreviewer(): SourcePreviewer {
        const clock = new FakeClock();
        return createSourcePreviewer({
            projects: createProjectService({
                repo: new ProjectRepository(database.db),
                git: new FakeGitProvider(),
                fileExists: () => false,
                clock,
            }),
            workItems,
            githubOf: (projectId) => {
                githubProjectIds.push(projectId);
                return Promise.resolve(github);
            },
        });
    }

    function addSandcastleIssue(number: number, blockedByNumbers: number[] = []): void {
        github.addIssue(
            GITHUB_REPO,
            buildGithubIssue({ number, labels: [SANDCASTLE_LABEL], blockedByNumbers }),
        );
    }

    it("lists the open issues with the label that would be taken now", async () => {
        addSandcastleIssue(12);
        addSandcastleIssue(10);
        github.addIssue(GITHUB_REPO, buildGithubIssue({ number: 11, labels: ["outra"] }));

        const preview = await createPreviewer().previewSourceItems(
            GITHUB_PROJECT.id,
            GITHUB_SOURCE,
        );

        expect(preview).toEqual({
            items: [
                { number: 10, title: "Issue 10", labels: [SANDCASTLE_LABEL] },
                { number: 12, title: "Issue 12", labels: [SANDCASTLE_LABEL] },
            ],
            skipped: 0,
        });
    });

    it("reads GitHub with the credential of the project", async () => {
        await createPreviewer().previewSourceItems(GITHUB_PROJECT.id, GITHUB_SOURCE);

        expect(githubProjectIds).toEqual([GITHUB_PROJECT.id]);
    });

    it("counts the issues skipped because they depend on open issues", async () => {
        addSandcastleIssue(10);
        addSandcastleIssue(12, [10]);
        github.addIssue(GITHUB_REPO, buildGithubIssue({ number: 3, labels: ["outra"] }));
        addSandcastleIssue(13, [3]);

        const preview = await createPreviewer().previewSourceItems(
            GITHUB_PROJECT.id,
            GITHUB_SOURCE,
        );

        expect(preview.items.map((item) => item.number)).toEqual([10]);
        expect(preview.skipped).toBe(2);
    });

    it("takes an issue whose blocker is already closed", async () => {
        github.addIssue(GITHUB_REPO, buildGithubIssue({ number: 10, state: "closed" }));
        addSandcastleIssue(12, [10]);

        const preview = await createPreviewer().previewSourceItems(
            GITHUB_PROJECT.id,
            GITHUB_SOURCE,
        );

        expect(preview).toEqual({
            items: [{ number: 12, title: "Issue 12", labels: [SANDCASTLE_LABEL], blockedBy: [10] }],
            skipped: 0,
        });
    });

    it("stops at the limit of the source", async () => {
        addSandcastleIssue(1);
        addSandcastleIssue(2);
        addSandcastleIssue(3);

        const preview = await createPreviewer().previewSourceItems(GITHUB_PROJECT.id, {
            ...GITHUB_SOURCE,
            limit: 2,
        });

        expect(preview.items.map((item) => item.number)).toEqual([1, 2]);
    });

    it("does not save the previewed issues as work items", async () => {
        addSandcastleIssue(10);

        await createPreviewer().previewSourceItems(GITHUB_PROJECT.id, GITHUB_SOURCE);

        expect(await workItems.list(GITHUB_PROJECT.id)).toEqual([]);
    });

    it("rejects the preview with a SourcePreviewFailedError when GitHub fails", async () => {
        github = new FailingGitHubProvider();

        const preview = createPreviewer().previewSourceItems(GITHUB_PROJECT.id, GITHUB_SOURCE);

        await expect(preview).rejects.toThrow(SourcePreviewFailedError);
        await expect(preview).rejects.not.toThrow("Bad credentials");
    });

    it("rejects the preview of GitHub issues for a project without a repository", async () => {
        const preview = createPreviewer().previewSourceItems(LOCAL_PROJECT.id, GITHUB_SOURCE);

        await expect(preview).rejects.toThrow(SourcePreviewFailedError);
    });

    it("lists the open local items of the board", async () => {
        await workItems.createLocal(LOCAL_PROJECT.id, buildLocalItemInput({ title: "Tela" }));

        const preview = await createPreviewer().previewSourceItems(LOCAL_PROJECT.id, LOCAL_SOURCE);

        expect(preview).toEqual({ items: [{ title: "Tela", labels: [] }], skipped: 0 });
    });
});

import { rmSync } from "node:fs";
import { tmpdir } from "node:os";

import type { RepoInfo } from "@/integrations/git/git_provider.js";
import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { systemClock } from "@/lib/clock.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { seedDemo, type AppServices } from "@/server/demo/seed_demo.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import { UsageRepository } from "@/server/usage/usage_repository.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { Project } from "@/shared/project_types.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestDb } from "@/test/test_db.js";
import { createTestLogStore } from "@/test/test_log_store.js";
import { createTestSecretBox } from "@/test/test_secrets.js";

const DEMO_PROJECT_NAME = "Demo — loja de café";
const DEMO_ITEM_COUNT = 5;
const RUNS_PAGE = { limit: 10 };
const SEED_TIMEOUT_MS = 30_000;

// The demo repository is created by the seed, so its path is only known once it is inspected.
class FakeGitProviderOfAnyRepo extends FakeGitProvider {
    override inspectRepo(path: string): Promise<RepoInfo> {
        return Promise.resolve({ root: path, currentBranch: "main", defaultBranch: "main" });
    }
}

interface SeedBed {
    database: DatabaseHandle;
    services: AppServices;
    commands: FakeCommandRunner;
}

describe("seedDemo", () => {
    const beds: SeedBed[] = [];

    afterEach(async () => {
        await Promise.all(beds.map(removeDemoRepos));
        beds.length = 0;
    });

    function createSeedBed(): SeedBed {
        const bed = buildSeedBed();
        beds.push(bed);
        return bed;
    }

    it(
        "creates the coffee shop project on a git repository in a temporary directory",
        async () => {
            const bed = createSeedBed();

            const seeded = await seedDemo(bed.services);

            const project = findProject(bed, seeded.projectId);
            expect(seeded.created).toBe(true);
            expect(project.name).toBe(DEMO_PROJECT_NAME);
            expect(project.repoPath.startsWith(tmpdir())).toBe(true);
            expect(gitCallsIn(bed, project.repoPath)).toContainEqual(["init", "-b", "main"]);
        },
        SEED_TIMEOUT_MS,
    );

    it(
        "creates five local items, each with its branch in the demo repository",
        async () => {
            const bed = createSeedBed();

            const seeded = await seedDemo(bed.services);

            const items = new WorkItemRepository(bed.database.db).listByProject(seeded.projectId);
            const project = findProject(bed, seeded.projectId);
            expect(items).toHaveLength(DEMO_ITEM_COUNT);
            expect(items.every((item) => item.source === "local")).toBe(true);
            expect(gitCallsIn(bed, project.repoPath)).toEqual(
                expect.arrayContaining(items.map((item) => ["branch", item.branch])),
            );
        },
        SEED_TIMEOUT_MS,
    );

    it(
        "publishes the basic factory with a local source without label as the default flow",
        async () => {
            const bed = createSeedBed();

            const seeded = await seedDemo(bed.services);

            const flows = new FlowRepository(bed.database.db);
            const [flow] = flows.listSummaries(seeded.projectId, { includeArchived: false });
            const version = flow && flows.findVersion(flow.id, 1);
            const source = version?.graph.nodes.find((node) => node.type === "source");
            expect(flow).toMatchObject({ name: "Fábrica básica", isDefault: true });
            expect(source?.config).toMatchObject({ provider: "local" });
            expect(source?.config).not.toHaveProperty("label");
            expect(agentPromptsOf(version?.graph)).not.toContainEqual(
                expect.stringContaining("{{item.number}}"),
            );
        },
        SEED_TIMEOUT_MS,
    );

    it(
        "runs the flow to the end with NodeRuns, logs and token usage",
        async () => {
            const bed = createSeedBed();

            const seeded = await seedDemo(bed.services);

            const runs = new SqliteRunRepository(bed.database.db, systemClock);
            const [run] = await runs.listRuns(seeded.projectId, RUNS_PAGE);
            const nodeRuns = run ? await runs.listNodeRuns(run.id) : [];
            const agentNodeRun = nodeRuns.find((nodeRun) => nodeRun.nodeId === "dev");
            const logStats = agentNodeRun && (await bed.services.logs.stats(agentNodeRun.id));
            expect(run?.status).toBe("SUCCEEDED");
            expect(nodeRuns.every((nodeRun) => nodeRun.status === "SUCCEEDED")).toBe(true);
            expect(logStats?.count).toBeGreaterThan(0);
            expect(new UsageRepository(bed.database.db).listByRun(run?.id ?? "")).not.toEqual([]);
        },
        SEED_TIMEOUT_MS,
    );
});

function buildSeedBed(): SeedBed {
    const database = createTestDb();
    const commands = new FakeCommandRunner();
    commands.when("git", () => true).returns({});
    const redactor = createSecretRedactor();
    const services: AppServices = {
        db: database.db,
        events: createEventBus(systemClock),
        logs: createTestLogStore(database.db, systemClock, redactor),
        git: new FakeGitProviderOfAnyRepo(),
        commands,
        secrets: createTestSecretBox(),
        redactor,
        clock: systemClock,
    };

    return { database, services, commands };
}

function findProject(bed: SeedBed, projectId: string): Project {
    const project = new ProjectRepository(bed.database.db).findById(projectId);
    if (!project) {
        throw new Error(`The demo project ${projectId} was not created`);
    }

    return project;
}

// Local items have no issue number, so the prompts of the demo cannot ask for one.
function agentPromptsOf(graph: FlowGraph | undefined): string[] {
    const agents = (graph?.nodes ?? []).filter((node) => node.type === "agent");
    return agents.map((agent) => agent.config.prompt);
}

function gitCallsIn(bed: SeedBed, repoPath: string): string[][] {
    return bed.commands.calls
        .filter((call) => call.command === "git" && call.options.cwd === repoPath)
        .map((call) => call.args);
}

function removeDemoRepos(bed: SeedBed): Promise<void> {
    const projects = new ProjectRepository(bed.database.db).list();
    projects.forEach((project) => rmSync(project.repoPath, { recursive: true, force: true }));
    bed.database.close();

    return Promise.resolve();
}

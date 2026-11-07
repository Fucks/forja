import path from "node:path";

import type { RepoInfo } from "@/integrations/git/git_provider.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import type { ProjectService } from "@/server/projects/project_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";
import { createTestDb } from "@/test/test_db.js";

const CREATED_AT = new Date("2026-03-10T12:00:00Z");
const ONE_HOUR_MS = 3_600_000;
const REPO_ROOT = path.join("/repos", "forja");
const SUBDIRECTORY = path.join(REPO_ROOT, "src", "server");

const FORJA_REPO: RepoInfo = {
    root: REPO_ROOT,
    currentBranch: "feature/login",
    defaultBranch: "main",
    remoteUrl: "git@github.com:Fucks/forja.git",
    githubRepo: "Fucks/forja",
};

describe("ProjectService", () => {
    let database: DatabaseHandle;
    let git: FakeGitProvider;
    let clock: FakeClock;
    let existingFiles: Set<string>;
    let service: ProjectService;

    beforeEach(() => {
        database = createTestDb();
        git = new FakeGitProvider();
        git.addRepo(FORJA_REPO, { subdirectories: [SUBDIRECTORY] });
        clock = new FakeClock(CREATED_AT);
        existingFiles = new Set();
        service = createProjectService({
            repo: new ProjectRepository(database.db),
            git,
            fileExists: (filePath) => existingFiles.has(filePath),
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    describe("create", () => {
        it("registers the repository with its GitHub remote and the creation time", async () => {
            const project = await service.create({ name: "Forja", repoPath: REPO_ROOT });

            expect(project).toEqual({
                id: expect.stringMatching(/^prj_/) as unknown,
                name: "Forja",
                repoPath: REPO_ROOT,
                githubRepo: "Fucks/forja",
                baseBranch: "main",
                detected: { codegraph: false, codingStandards: false, sandcastle: false },
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
            });
        });

        it("stores the repository root when given a subdirectory", async () => {
            const project = await service.create({ name: "Forja", repoPath: SUBDIRECTORY });

            expect(project.repoPath).toBe(REPO_ROOT);
        });

        it("persists the project", async () => {
            const created = await service.create({ name: "Forja", repoPath: REPO_ROOT });

            await expect(service.get(created.id)).resolves.toEqual(created);
        });

        it("leaves githubRepo empty when the remote is not on GitHub", async () => {
            git.addRepo({ root: "/repos/interno", currentBranch: "main", defaultBranch: "main" });

            const project = await service.create({ name: "Interno", repoPath: "/repos/interno" });

            expect(project.githubRepo).toBeUndefined();
        });

        it("uses the requested base branch", async () => {
            const project = await service.create({
                name: "Forja",
                repoPath: REPO_ROOT,
                baseBranch: "release",
            });

            expect(project.baseBranch).toBe("release");
        });

        it("prefers development as the base branch when it exists", async () => {
            git.addRepo(
                { root: "/repos/loja", currentBranch: "main", defaultBranch: "main" },
                { branches: ["development"] },
            );

            const project = await service.create({ name: "Loja", repoPath: "/repos/loja" });

            expect(project.baseBranch).toBe("development");
        });

        it("detects .codegraph, CODING_STANDARDS.md and .sandcastle in the repository root", async () => {
            existingFiles.add(path.join(REPO_ROOT, ".codegraph"));
            existingFiles.add(path.join(REPO_ROOT, "CODING_STANDARDS.md"));
            existingFiles.add(path.join(REPO_ROOT, ".sandcastle"));

            const project = await service.create({ name: "Forja", repoPath: SUBDIRECTORY });

            expect(project.detected).toEqual({
                codegraph: true,
                codingStandards: true,
                sandcastle: true,
            });
        });

        it("detects each file independently", async () => {
            existingFiles.add(path.join(REPO_ROOT, "CODING_STANDARDS.md"));

            const project = await service.create({ name: "Forja", repoPath: REPO_ROOT });

            expect(project.detected).toEqual({
                codegraph: false,
                codingStandards: true,
                sandcastle: false,
            });
        });

        it("rejects a path that is not a git repository with a clear message", async () => {
            const creating = service.create({ name: "Solto", repoPath: "/tmp/solto" });

            await expect(creating).rejects.toThrow(DomainValidationError);
            await expect(creating).rejects.toThrow("/tmp/solto não é um repositório git");
        });

        it("rejects the same repository twice, even through a subdirectory", async () => {
            await service.create({ name: "Forja", repoPath: REPO_ROOT });

            const creating = service.create({ name: "Forja de novo", repoPath: SUBDIRECTORY });

            await expect(creating).rejects.toThrow(ConflictError);
        });
    });

    describe("list", () => {
        it("lists the projects in creation order", async () => {
            git.addRepo({ root: "/repos/loja", currentBranch: "main", defaultBranch: "main" });
            await service.create({ name: "Forja", repoPath: REPO_ROOT });
            clock.advance(ONE_HOUR_MS);
            await service.create({ name: "Loja", repoPath: "/repos/loja" });

            const projects = await service.list();

            expect(projects.map((project) => project.name)).toEqual(["Forja", "Loja"]);
        });
    });

    describe("get", () => {
        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.get("prj_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("rename", () => {
        it("changes the name and the update time", async () => {
            const created = await service.create({ name: "Forja", repoPath: REPO_ROOT });
            clock.advance(ONE_HOUR_MS);

            const renamed = await service.rename(created.id, "Forja 2");

            expect(renamed).toEqual({
                ...created,
                name: "Forja 2",
                updatedAt: new Date(CREATED_AT.getTime() + ONE_HOUR_MS).toISOString(),
            });
            await expect(service.get(created.id)).resolves.toEqual(renamed);
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.rename("prj_inexistente", "Nada")).rejects.toThrow(NotFoundError);
        });
    });

    describe("remove", () => {
        it("forgets the project so the same repository can be registered again", async () => {
            const created = await service.create({ name: "Forja", repoPath: REPO_ROOT });

            await service.remove(created.id);

            await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
            await expect(service.create({ name: "Forja", repoPath: REPO_ROOT })).resolves.toEqual(
                expect.objectContaining({ repoPath: REPO_ROOT }),
            );
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.remove("prj_inexistente")).rejects.toThrow(NotFoundError);
        });
    });
});

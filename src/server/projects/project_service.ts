import path from "node:path";

import { NotARepoError } from "@/integrations/git/git_provider.js";
import type { GitProvider, RepoInfo } from "@/integrations/git/git_provider.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { resolveWith } from "@/lib/resolve_with.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import type { ProjectRepository } from "@/server/projects/project_repository.js";
import type {
    CreateProjectInput,
    Project,
    ProjectDetection,
    ProjectService,
} from "@/server/projects/project_types.js";

const PREFERRED_BASE_BRANCH = "development";

const DETECTED_ENTRIES: Record<keyof ProjectDetection, string> = {
    codegraph: ".codegraph",
    codingStandards: "CODING_STANDARDS.md",
    sandcastle: ".sandcastle",
};

export interface ProjectServiceDeps {
    repo: ProjectRepository;
    git: GitProvider;
    fileExists: (filePath: string) => boolean;
    clock: Clock;
}

export function createProjectService(deps: ProjectServiceDeps): ProjectService {
    return {
        create: (input) => createProject(deps, input),
        list: () => resolveWith(() => deps.repo.list()),
        get: (id) => resolveWith(() => findProjectOrThrow(deps.repo, id)),
        rename: (id, name) => resolveWith(() => renameProject(deps, id, name)),
        remove: (id) => resolveWith(() => removeProject(deps.repo, id)),
    };
}

async function createProject(
    deps: ProjectServiceDeps,
    input: CreateProjectInput,
): Promise<Project> {
    const repoInfo = await inspectRepoOrReject(deps.git, input.repoPath);
    assertRepoIsNotRegistered(deps.repo, repoInfo.root);

    const baseBranch = input.baseBranch ?? (await chooseDefaultBaseBranch(deps.git, repoInfo));
    const createdAt = deps.clock.now().toISOString();
    const project: Project = {
        id: newId("prj"),
        name: input.name,
        repoPath: repoInfo.root,
        githubRepo: repoInfo.githubRepo,
        baseBranch,
        detected: detectRepoEntries(deps.fileExists, repoInfo.root),
        createdAt,
        updatedAt: createdAt,
    };
    deps.repo.insert(project);

    return project;
}

async function inspectRepoOrReject(git: GitProvider, repoPath: string): Promise<RepoInfo> {
    try {
        return await git.inspectRepo(repoPath);
    } catch (error) {
        if (error instanceof NotARepoError) {
            throw new DomainValidationError(error.message, { repoPath });
        }
        throw error;
    }
}

function assertRepoIsNotRegistered(repo: ProjectRepository, repoRoot: string): void {
    const registered = repo.findByRepoPath(repoRoot);
    if (registered) {
        throw new ConflictError(
            `O repositório ${repoRoot} já está cadastrado no projeto ${registered.name}.`,
        );
    }
}

async function chooseDefaultBaseBranch(git: GitProvider, repoInfo: RepoInfo): Promise<string> {
    const hasPreferredBranch = await git.branchExists(repoInfo.root, PREFERRED_BASE_BRANCH);
    return hasPreferredBranch ? PREFERRED_BASE_BRANCH : repoInfo.defaultBranch;
}

function detectRepoEntries(
    fileExists: ProjectServiceDeps["fileExists"],
    repoRoot: string,
): ProjectDetection {
    const isPresent = (entry: string): boolean => fileExists(path.join(repoRoot, entry));

    return {
        codegraph: isPresent(DETECTED_ENTRIES.codegraph),
        codingStandards: isPresent(DETECTED_ENTRIES.codingStandards),
        sandcastle: isPresent(DETECTED_ENTRIES.sandcastle),
    };
}

function findProjectOrThrow(repo: ProjectRepository, id: string): Project {
    const project = repo.findById(id);
    if (!project) {
        throw new NotFoundError(`Projeto ${id} não encontrado.`);
    }

    return project;
}

function renameProject(deps: ProjectServiceDeps, id: string, name: string): Project {
    const project = findProjectOrThrow(deps.repo, id);
    const updatedAt = deps.clock.now().toISOString();
    deps.repo.rename({ id, name, updatedAt });

    return { ...project, name, updatedAt };
}

function removeProject(repo: ProjectRepository, id: string): void {
    findProjectOrThrow(repo, id);
    repo.delete(id);
}

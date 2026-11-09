import type { ForjaDb } from "@/server/db/client.js";
import { NotFoundError } from "@/server/errors.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";

export interface AgentImageTarget {
    repoPath: string;
    image: string;
}

export interface AgentImageLookups {
    findTarget(projectId: string): AgentImageTarget | undefined;
    /** Each image configured by some project, or the default one while there is no project. */
    listImagesInUse(): string[];
}

export function createAgentImageLookups(db: ForjaDb): AgentImageLookups {
    const projects = new ProjectRepository(db);
    const settings = new SettingsRepository(db);

    function readAgentImage(projectId: string): string {
        return (settings.findProjectSettings(projectId) ?? DEFAULT_PROJECT_SETTINGS).agentImage;
    }

    return {
        findTarget(projectId) {
            const project = projects.findById(projectId);
            return project && { repoPath: project.repoPath, image: readAgentImage(projectId) };
        },
        listImagesInUse() {
            const images = projects.list().map((project) => readAgentImage(project.id));
            if (images.length === 0) {
                return [DEFAULT_PROJECT_SETTINGS.agentImage];
            }

            return [...new Set(images)];
        },
    };
}

/** @throws NotFoundError when the project does not exist */
export function findTargetOrThrow(lookups: AgentImageLookups, projectId: string): AgentImageTarget {
    const target = lookups.findTarget(projectId);
    if (!target) {
        throw new NotFoundError(`Projeto ${projectId} não encontrado.`);
    }

    return target;
}

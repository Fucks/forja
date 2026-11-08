import type { CreateProjectInput, Project } from "@/shared/project_types.js";

export {
    createProjectInput,
    projectDetectionSchema,
    renameProjectInput,
} from "@/shared/project_types.js";
export type { CreateProjectInput, Project, ProjectDetection } from "@/shared/project_types.js";

export interface ProjectService {
    create(input: CreateProjectInput): Promise<Project>;
    list(): Promise<Project[]>;
    /** @throws NotFoundError */
    get(id: string): Promise<Project>;
    rename(id: string, name: string): Promise<Project>;
    /** Forgets the project; never touches the repository on disk. */
    remove(id: string): Promise<void>;
}

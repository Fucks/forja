import { z } from "zod";

const PROJECT_NAME_MAX_LENGTH = 80;

const projectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

export const createProjectInput = z.object({
    name: projectNameSchema,
    repoPath: z.string().min(1),
    baseBranch: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const renameProjectInput = z.object({ name: projectNameSchema });

export const projectDetectionSchema = z.object({
    codegraph: z.boolean(),
    codingStandards: z.boolean(),
    sandcastle: z.boolean(),
});

export type ProjectDetection = z.infer<typeof projectDetectionSchema>;

export interface Project {
    id: string;
    name: string;
    repoPath: string;
    githubRepo?: string;
    baseBranch: string;
    detected: ProjectDetection;
    createdAt: string;
    updatedAt: string;
}

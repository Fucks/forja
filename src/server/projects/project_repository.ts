import { asc, eq } from "drizzle-orm";

import type { ForjaDb } from "@/server/db/client.js";
import { projects } from "@/server/db/schema/projects.js";
import type { ProjectRow } from "@/server/db/schema/projects.js";
import { projectDetectionSchema } from "@/server/projects/project_types.js";
import type { Project } from "@/server/projects/project_types.js";

export interface ProjectRenaming {
    id: string;
    name: string;
    updatedAt: string;
}

export class ProjectRepository {
    constructor(private readonly db: ForjaDb) {}

    insert(project: Project): void {
        this.db.insert(projects).values(toProjectRow(project)).run();
    }

    list(): Project[] {
        return this.db
            .select()
            .from(projects)
            .orderBy(asc(projects.createdAt))
            .all()
            .map(toProject);
    }

    findById(id: string): Project | undefined {
        const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
        return row && toProject(row);
    }

    findByRepoPath(repoPath: string): Project | undefined {
        const row = this.db.select().from(projects).where(eq(projects.repoPath, repoPath)).get();
        return row && toProject(row);
    }

    rename(renaming: ProjectRenaming): void {
        this.db
            .update(projects)
            .set({ name: renaming.name, updatedAt: renaming.updatedAt })
            .where(eq(projects.id, renaming.id))
            .run();
    }

    delete(id: string): void {
        this.db.delete(projects).where(eq(projects.id, id)).run();
    }
}

function toProjectRow(project: Project): ProjectRow {
    return {
        id: project.id,
        name: project.name,
        repoPath: project.repoPath,
        githubRepo: project.githubRepo ?? null,
        baseBranch: project.baseBranch,
        detectedJson: JSON.stringify(project.detected),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}

function toProject(row: ProjectRow): Project {
    return {
        id: row.id,
        name: row.name,
        repoPath: row.repoPath,
        githubRepo: row.githubRepo ?? undefined,
        baseBranch: row.baseBranch,
        detected: projectDetectionSchema.parse(JSON.parse(row.detectedJson)),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

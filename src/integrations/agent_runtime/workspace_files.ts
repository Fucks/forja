import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { WorkspaceError } from "@/integrations/agent_runtime/agent_errors.js";
import type { WorkspaceFile } from "@/integrations/agent_runtime/agent_runtime.js";

const PARENT_DIR = "..";

export async function writeWorkspaceFiles(root: string, files: WorkspaceFile[]): Promise<void> {
    const targets = files.map((file) => ({
        absolutePath: resolveInsideRoot(root, file.path),
        content: file.content,
    }));

    await Promise.all(
        targets.map(async (target) => {
            await mkdir(path.dirname(target.absolutePath), { recursive: true });
            await writeFile(target.absolutePath, target.content);
        }),
    );
}

function resolveInsideRoot(root: string, relativePath: string): string {
    const absolutePath = path.resolve(root, relativePath);
    if (!isStrictlyInside(root, absolutePath)) {
        throw new WorkspaceError(`O arquivo ${relativePath} fica fora do workspace`);
    }

    return absolutePath;
}

function isStrictlyInside(root: string, absolutePath: string): boolean {
    const pathFromRoot = path.relative(root, absolutePath);
    return (
        pathFromRoot !== "" &&
        pathFromRoot !== PARENT_DIR &&
        !pathFromRoot.startsWith(`${PARENT_DIR}${path.sep}`) &&
        !path.isAbsolute(pathFromRoot)
    );
}

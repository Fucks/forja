import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type { RuntimeDir, RuntimeFile } from "@/integrations/agent_runtime/agent_runtime.js";
import { writeWorkspaceFiles } from "@/integrations/agent_runtime/workspace_files.js";

export async function createRuntimeDir(runtimeDir: RuntimeDir): Promise<void> {
    await mkdir(runtimeDir.host, { recursive: true });
}

/** @throws WorkspaceError for a file outside the runtime dir */
export function writeRuntimeFiles(runtimeDir: RuntimeDir, files: RuntimeFile[]): Promise<void> {
    const filesInDir = files.map((file) => ({
        path: path.relative(runtimeDir.host, file.hostPath),
        content: file.content,
    }));

    return writeWorkspaceFiles(runtimeDir.host, filesInDir);
}

export async function removeRuntimeDir(runtimeDir: RuntimeDir): Promise<void> {
    await rm(runtimeDir.host, { recursive: true, force: true });
}

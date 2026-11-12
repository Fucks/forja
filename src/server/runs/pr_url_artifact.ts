import { z } from "zod";

import type { ArtifactRecord } from "@/server/runs/run_repository.js";

const prUrlSchema = z.string();

/** The url of the last `pr_url` artifact among the given ones. */
export function findPrUrl(artifacts: ArtifactRecord[]): string | undefined {
    const prUrlArtifact = artifacts.findLast((artifact) => artifact.kind === "pr_url");
    if (!prUrlArtifact) {
        return undefined;
    }

    return prUrlSchema.parse(prUrlArtifact.value);
}

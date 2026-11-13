export interface LogDirInfo {
    runId: string;
    finishedAt?: Date;
    bytes: number;
    active: boolean;
}

export interface RetentionPolicy {
    retentionDays: number;
    maxTotalBytes: number;
}

export interface CleanupPlan {
    deleteRunIds: string[];
    freedBytes: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function planCleanup(dirs: LogDirInfo[], policy: RetentionPolicy, now: Date): CleanupPlan {
    const finishedDirs = dirs.filter((dir) => !dir.active);
    const retainedSince = new Date(now.getTime() - policy.retentionDays * DAY_MS);
    const expiredDirs = finishedDirs.filter((dir) => isExpired(dir, retainedSince));
    const keptDirs = finishedDirs.filter((dir) => !expiredDirs.includes(dir));

    const bytesAfterExpiring = totalBytesOf(dirs) - totalBytesOf(expiredDirs);
    const overCeilingDirs = oldestUntilFreed(keptDirs, bytesAfterExpiring - policy.maxTotalBytes);
    const deletedDirs = [...expiredDirs, ...overCeilingDirs];

    return {
        deleteRunIds: deletedDirs.map((dir) => dir.runId),
        freedBytes: totalBytesOf(deletedDirs),
    };
}

// Without finishedAt the run is gone from the database, so nobody can open these logs anymore.
function isExpired(dir: LogDirInfo, retainedSince: Date): boolean {
    return dir.finishedAt === undefined || dir.finishedAt < retainedSince;
}

function oldestUntilFreed(dirs: LogDirInfo[], bytesToFree: number): LogDirInfo[] {
    const chosenDirs: LogDirInfo[] = [];
    let freedBytes = 0;
    for (const dir of sortOldestFirst(dirs)) {
        if (freedBytes >= bytesToFree) {
            break;
        }
        chosenDirs.push(dir);
        freedBytes += dir.bytes;
    }

    return chosenDirs;
}

function sortOldestFirst(dirs: LogDirInfo[]): LogDirInfo[] {
    return [...dirs].sort((a, b) => finishedAtMs(a) - finishedAtMs(b));
}

function finishedAtMs(dir: LogDirInfo): number {
    return dir.finishedAt?.getTime() ?? 0;
}

function totalBytesOf(dirs: LogDirInfo[]): number {
    return dirs.reduce((total, dir) => total + dir.bytes, 0);
}

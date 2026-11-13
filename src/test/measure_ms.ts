export function measureMs(work: () => void): number {
    const startedAtMs = performance.now();
    work();

    return performance.now() - startedAtMs;
}

export type StatusPair<Status extends string> = [from: Status, to: Status];

export function listAllStatusPairs<Status extends string>(
    statuses: readonly Status[],
): StatusPair<Status>[] {
    return statuses.flatMap((from) => statuses.map((to): StatusPair<Status> => [from, to]));
}

export function excludeStatusPairs<Status extends string>(
    pairs: StatusPair<Status>[],
    excluded: StatusPair<Status>[],
): StatusPair<Status>[] {
    return pairs.filter((pair) => !excluded.some((excludedPair) => isSamePair(pair, excludedPair)));
}

function isSamePair<Status extends string>(
    [fromA, toA]: StatusPair<Status>,
    [fromB, toB]: StatusPair<Status>,
): boolean {
    return fromA === fromB && toA === toB;
}

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
    return pairs.filter(([from, to]) => !excluded.some((pair) => pair[0] === from && pair[1] === to));
}

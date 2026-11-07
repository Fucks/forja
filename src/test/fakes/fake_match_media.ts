type MatchMedia = (query: string) => MediaQueryList;

export function createFakeMatchMedia(matchingQueries: string[]): MatchMedia {
    return (query) => ({
        media: query,
        matches: matchingQueries.includes(query),
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    });
}

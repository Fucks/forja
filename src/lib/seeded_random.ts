export interface SeededRandom {
    /** A number in [0, 1). */
    next(): number;
    /** An integer in [min, max]. */
    integerBetween(min: number, max: number): number;
    pickOne<Choice>(choices: readonly Choice[]): Choice;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 2 ** 32;

/** The same seed always yields the same sequence; not suitable for anything secret. */
export function createSeededRandom(seed: string): SeededRandom {
    let state = hashSeed(seed);

    function next(): number {
        state = (state + MULBERRY_INCREMENT) >>> 0;
        return mulberry32(state) / UINT32_RANGE;
    }

    function integerBetween(min: number, max: number): number {
        return min + Math.floor(next() * (max - min + 1));
    }

    function pickOne<Choice>(choices: readonly Choice[]): Choice {
        const choice = choices[integerBetween(0, choices.length - 1)];
        if (choice === undefined) {
            throw new RangeError("Cannot pick from an empty list");
        }

        return choice;
    }

    return { next, integerBetween, pickOne };
}

// FNV-1a: spreads seeds that differ in one character over the whole 32-bit range.
function hashSeed(seed: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (const character of seed) {
        hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), FNV_PRIME);
    }

    return hash >>> 0;
}

function mulberry32(state: number): number {
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return (mixed ^ (mixed >>> 14)) >>> 0;
}

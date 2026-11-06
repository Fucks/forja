import { monotonicFactory } from "ulid";

export type IdPrefix =
    "prj" | "flw" | "ver" | "run" | "nrn" | "itm" | "trg" | "cred" | "tlp" | "apv" | "art" | "usg";

// Monotonic so ids created within the same millisecond still sort in creation order.
const nextUlid = monotonicFactory();

export function newId(prefix: IdPrefix): string {
    return `${prefix}_${nextUlid()}`;
}

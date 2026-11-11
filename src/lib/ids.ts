import { monotonicFactory } from "ulid";

export type IdPrefix =
    | "prj"
    | "flw"
    | "nod"
    | "grp"
    | "edg"
    | "ver"
    | "run"
    | "nrn"
    | "itm"
    | "trg"
    | "trf"
    | "cred"
    | "tlp"
    | "apv"
    | "art"
    | "usg";

// Monotonic so ids created within the same millisecond still sort in creation order.
const nextUlid = monotonicFactory();

export function newId(prefix: IdPrefix): string {
    return `${prefix}_${nextUlid()}`;
}

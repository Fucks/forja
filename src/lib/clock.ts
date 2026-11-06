export type CancelTimeout = () => void;

export interface Clock {
    now(): Date;
    setTimeout(fn: () => void, ms: number): CancelTimeout;
}

export const systemClock: Clock = {
    now: () => new Date(),
    setTimeout: (fn, ms) => {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
    },
};

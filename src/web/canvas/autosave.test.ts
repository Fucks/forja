import type { FlowGraph } from "@/shared/flow_graph.js";
import { buildCanonicalFlow, buildLoopFlow } from "@/test/factories/flow_graph_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { ApiError } from "@/web/api/api_client.js";
import { createAutosave } from "@/web/canvas/autosave.js";
import type { Autosave } from "@/web/canvas/autosave.js";

const DELAY_MS = 800;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;

type SaveDraft = (graph: FlowGraph, revision: number) => Promise<number>;

interface AutosaveHarness {
    autosave: Autosave;
    clock: FakeClock;
    save: ReturnType<typeof vi.fn<SaveDraft>>;
    onConflict: ReturnType<typeof vi.fn<() => void>>;
    onError: ReturnType<typeof vi.fn<(error: unknown) => void>>;
}

function createHarness(
    save: SaveDraft = (_graph, revision) => Promise.resolve(revision + 1),
): AutosaveHarness {
    const clock = new FakeClock();
    const callbacks = {
        save: vi.fn<SaveDraft>(save),
        onConflict: vi.fn<() => void>(),
        onError: vi.fn<(error: unknown) => void>(),
    };
    const autosave = createAutosave({
        delayMs: DELAY_MS,
        ...callbacks,
        setTimer: clock.setTimeout.bind(clock),
    });

    return { autosave, clock, ...callbacks };
}

function createDeferredSave(): { save: SaveDraft; resolve(revision: number): void } {
    let resolveSave: (revision: number) => void = () => undefined;
    const save: SaveDraft = () =>
        new Promise((resolve) => {
            resolveSave = resolve;
        });

    return { save, resolve: (revision) => resolveSave(revision) };
}

function settlePromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createAutosave", () => {
    describe("debounce", () => {
        it("saves the latest graph once the delay passes after the last change", async () => {
            const { autosave, clock, save } = createHarness();
            autosave.schedule(buildCanonicalFlow(), 1);
            clock.advance(DELAY_MS / 2);
            autosave.schedule(buildLoopFlow(), 1);

            clock.advance(DELAY_MS - 1);
            await settlePromises();
            expect(save).not.toHaveBeenCalled();

            clock.advance(1);
            await settlePromises();
            expect(save).toHaveBeenCalledExactlyOnceWith(buildLoopFlow(), 1);
        });

        it("saves the next change on the revision returned by the previous save", async () => {
            const { autosave, clock, save } = createHarness();
            autosave.schedule(buildCanonicalFlow(), 1);
            clock.advance(DELAY_MS);
            await settlePromises();

            autosave.schedule(buildLoopFlow(), 1);
            clock.advance(DELAY_MS);
            await settlePromises();

            expect(save).toHaveBeenLastCalledWith(buildLoopFlow(), 2);
        });

        it("waits for the save in flight before saving the next change", async () => {
            const deferred = createDeferredSave();
            const { autosave, clock, save } = createHarness(deferred.save);
            autosave.schedule(buildCanonicalFlow(), 1);
            clock.advance(DELAY_MS);
            await settlePromises();

            autosave.schedule(buildLoopFlow(), 1);
            clock.advance(DELAY_MS);
            await settlePromises();
            expect(save).toHaveBeenCalledTimes(1);

            deferred.resolve(2);
            await settlePromises();
            expect(save).toHaveBeenLastCalledWith(buildLoopFlow(), 2);
        });
    });

    describe("failures", () => {
        it("reports a conflict when the draft revision is stale", async () => {
            const { autosave, clock, onConflict, onError } = createHarness(() =>
                Promise.reject(new ApiError({ status: HTTP_CONFLICT, message: "Conflito" })),
            );
            autosave.schedule(buildCanonicalFlow(), 1);

            clock.advance(DELAY_MS);
            await settlePromises();

            expect(onConflict).toHaveBeenCalledOnce();
            expect(onError).not.toHaveBeenCalled();
        });

        it("reports any other failure as an error", async () => {
            const failure = new ApiError({ status: HTTP_INTERNAL_SERVER_ERROR, message: "Falhou" });
            const { autosave, clock, onConflict, onError } = createHarness(() =>
                Promise.reject(failure),
            );
            autosave.schedule(buildCanonicalFlow(), 1);

            clock.advance(DELAY_MS);
            await settlePromises();

            expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
            expect(onConflict).not.toHaveBeenCalled();
        });
    });

    describe("flush", () => {
        it("saves the pending change right away and only once", async () => {
            const { autosave, clock, save } = createHarness();
            autosave.schedule(buildCanonicalFlow(), 1);

            await autosave.flush();
            expect(save).toHaveBeenCalledExactlyOnceWith(buildCanonicalFlow(), 1);

            clock.advance(DELAY_MS);
            await settlePromises();
            expect(save).toHaveBeenCalledOnce();
        });

        it("does not save when nothing changed", async () => {
            const { autosave, save } = createHarness();

            await autosave.flush();

            expect(save).not.toHaveBeenCalled();
        });

        it("resolves only after the save in flight finishes", async () => {
            const deferred = createDeferredSave();
            const { autosave } = createHarness(deferred.save);
            autosave.schedule(buildCanonicalFlow(), 1);
            let isFlushed = false;

            const flushing = (async () => {
                await autosave.flush();
                isFlushed = true;
            })();
            await settlePromises();
            expect(isFlushed).toBe(false);

            deferred.resolve(2);
            await flushing;
            expect(isFlushed).toBe(true);
        });
    });
});

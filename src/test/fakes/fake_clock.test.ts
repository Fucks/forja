import { FakeClock } from "@/test/fakes/fake_clock.js";

const START = new Date("2026-03-10T12:00:00Z");

describe("FakeClock", () => {
    it("starts at 2026-01-01T00:00:00Z by default", () => {
        const clock = new FakeClock();

        expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });

    it("moves the current time forward when advanced", () => {
        const clock = new FakeClock(START);

        clock.advance(1_500);

        expect(clock.now().toISOString()).toBe("2026-03-10T12:00:01.500Z");
    });

    it("returns a copy of the current time that callers cannot change", () => {
        const clock = new FakeClock(START);

        clock.now().setFullYear(2000);

        expect(clock.now()).toEqual(START);
    });

    it("jumps to the given date when set", () => {
        const clock = new FakeClock(START);
        const later = new Date("2026-04-01T00:00:00Z");

        clock.set(later);

        expect(clock.now()).toEqual(later);
    });

    it("fires due timers in order of their due time", () => {
        const clock = new FakeClock(START);
        const fired: string[] = [];
        clock.setTimeout(() => fired.push("third"), 300);
        clock.setTimeout(() => fired.push("first"), 100);
        clock.setTimeout(() => fired.push("second"), 200);

        clock.advance(300);

        expect(fired).toEqual(["first", "second", "third"]);
    });

    it("fires timers due at the same time in the order they were scheduled", () => {
        const clock = new FakeClock(START);
        const fired: string[] = [];
        clock.setTimeout(() => fired.push("first"), 100);
        clock.setTimeout(() => fired.push("second"), 100);

        clock.advance(100);

        expect(fired).toEqual(["first", "second"]);
    });

    it("does not fire timers that are not due yet", () => {
        const clock = new FakeClock(START);
        const fire = vi.fn();
        clock.setTimeout(fire, 1_000);

        clock.advance(999);

        expect(fire).not.toHaveBeenCalled();
    });

    it("fires each timer only once", () => {
        const clock = new FakeClock(START);
        const fire = vi.fn();
        clock.setTimeout(fire, 100);

        clock.advance(100);
        clock.advance(100);

        expect(fire).toHaveBeenCalledTimes(1);
    });

    it("does not fire cancelled timers", () => {
        const clock = new FakeClock(START);
        const fire = vi.fn();
        const cancel = clock.setTimeout(fire, 100);

        cancel();
        clock.advance(100);

        expect(fire).not.toHaveBeenCalled();
    });

    it("shows each timer the time it was due at when it fires", () => {
        const clock = new FakeClock(START);
        const firedAt: string[] = [];
        clock.setTimeout(() => firedAt.push(clock.now().toISOString()), 100);

        clock.advance(500);

        expect(firedAt).toEqual(["2026-03-10T12:00:00.100Z"]);
    });

    it("fires timers scheduled during advance when they are due within it", () => {
        const clock = new FakeClock(START);
        const fired: string[] = [];
        clock.setTimeout(() => {
            fired.push("outer");
            clock.setTimeout(() => fired.push("inner"), 100);
        }, 100);

        clock.advance(200);

        expect(fired).toEqual(["outer", "inner"]);
    });

    it("fires a zero-delay timer on the next advance, even by zero", () => {
        const clock = new FakeClock(START);
        const fire = vi.fn();
        clock.setTimeout(fire, 0);

        clock.advance(0);

        expect(fire).toHaveBeenCalledTimes(1);
    });

    it("fires due timers when set moves the time forward", () => {
        const clock = new FakeClock(START);
        const fire = vi.fn();
        clock.setTimeout(fire, 60_000);

        clock.set(new Date("2026-03-10T12:01:00Z"));

        expect(fire).toHaveBeenCalledTimes(1);
    });

    it("rejects advancing by a negative amount", () => {
        const clock = new FakeClock(START);

        expect(() => clock.advance(-1)).toThrow(RangeError);
    });
});

import { createLogAnnouncer, type LogAnnouncer } from "@/server/runtime/log_announcer.js";
import type { AppendedLogRange } from "@/server/runtime/log_announcer.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";

const ANNOUNCE_INTERVAL_MS = 250;

interface Announcement extends AppendedLogRange {
    nodeRunId: string;
    atMs: number;
}

describe("LogAnnouncer", () => {
    let clock: FakeClock;
    let announcements: Announcement[];
    let announcer: LogAnnouncer;

    beforeEach(() => {
        clock = new FakeClock();
        announcements = [];
        announcer = createLogAnnouncer({
            clock,
            publish: (nodeRunId, range) =>
                announcements.push({ nodeRunId, ...range, atMs: clock.now().getTime() }),
        });
    });

    it("announces the events appended within 250 ms as one range", () => {
        announcer.announce("nrn_dev", 1);
        clock.advance(100);
        announcer.announce("nrn_dev", 2);
        announcer.announce("nrn_dev", 3);

        clock.advance(ANNOUNCE_INTERVAL_MS);

        expect(announcements).toEqual([
            expect.objectContaining({ nodeRunId: "nrn_dev", fromSeq: 1, toSeq: 3 }),
        ]);
    });

    it("announces nothing before 250 ms have passed", () => {
        announcer.announce("nrn_dev", 1);

        clock.advance(ANNOUNCE_INTERVAL_MS - 1);

        expect(announcements).toEqual([]);
    });

    it("announces a NodeRun at most once every 250 ms", () => {
        for (let seq = 1; seq <= 20; seq++) {
            announcer.announce("nrn_dev", seq);
            clock.advance(50);
        }
        clock.advance(ANNOUNCE_INTERVAL_MS);

        const gapsMs = announcements.slice(1).map((next, index) => {
            const previous = announcements[index];
            return previous ? next.atMs - previous.atMs : 0;
        });
        const announcedSeqs = announcements.flatMap(({ fromSeq, toSeq }) =>
            Array.from({ length: toSeq - fromSeq + 1 }, (_, offset) => fromSeq + offset),
        );
        expect(gapsMs.every((gapMs) => gapMs >= ANNOUNCE_INTERVAL_MS)).toBe(true);
        expect(announcedSeqs).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    });

    it("announces each NodeRun with its own range", () => {
        announcer.announce("nrn_dev", 1);
        announcer.announce("nrn_review", 1);
        announcer.announce("nrn_review", 2);

        clock.advance(ANNOUNCE_INTERVAL_MS);

        expect(announcements).toEqual([
            expect.objectContaining({ nodeRunId: "nrn_dev", fromSeq: 1, toSeq: 1 }),
            expect.objectContaining({ nodeRunId: "nrn_review", fromSeq: 1, toSeq: 2 }),
        ]);
    });
});

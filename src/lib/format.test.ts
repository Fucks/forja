import {
    formatCalendarDay,
    formatCount,
    formatDateTime,
    formatDuration,
    formatMegabytes,
    formatRelativeOffset,
    formatTimeAgo,
    formatTimeOfDay,
    formatTokens,
    formatUsd,
} from "@/lib/format.js";

describe("formatDuration", () => {
    it.each([
        [0, "0 s"],
        [950, "0,9 s"],
        [5_000, "5 s"],
        [59_999, "59,9 s"],
        [60_000, "1 min"],
        [75_000, "1 min 15 s"],
        [3_599_999, "59 min 59 s"],
        [3_600_000, "1 h"],
        [3_900_000, "1 h 5 min"],
        [90_000_000, "25 h"],
    ])("formats %d ms as %j", (ms, expected) => {
        expect(formatDuration(ms)).toBe(expected);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects %d ms", (ms) => {
        expect(() => formatDuration(ms)).toThrow(RangeError);
    });
});

describe("formatTokens", () => {
    it.each([
        [0, "0"],
        [980, "980"],
        [999, "999"],
        [1_000, "1 mil"],
        [12_400, "12,4 mil"],
        [999_999, "999,9 mil"],
        [1_000_000, "1 mi"],
        [3_200_000, "3,2 mi"],
        [7_450_000_000, "7,4 bi"],
    ])("formats %d tokens as %j", (count, expected) => {
        expect(formatTokens(count)).toBe(expected);
    });

    it.each([-1, Number.NaN])("rejects %d tokens", (count) => {
        expect(() => formatTokens(count)).toThrow(RangeError);
    });
});

describe("formatUsd", () => {
    it.each([
        [0, "US$ 0,00"],
        [0.004, "US$ 0,004"],
        [0.00123, "US$ 0,0012"],
        [0.01, "US$ 0,01"],
        [1.5, "US$ 1,50"],
        [1.234, "US$ 1,23"],
        [1_234.5, "US$ 1.234,50"],
    ])("formats %d dollars as %j", (amount, expected) => {
        expect(formatUsd(amount)).toBe(expected);
    });

    it.each([-0.01, Number.NaN])("rejects %d dollars", (amount) => {
        expect(() => formatUsd(amount)).toThrow(RangeError);
    });
});

describe("formatRelativeOffset", () => {
    it.each([
        [0, "+00:00"],
        [42_000, "+00:42"],
        [42_999, "+00:42"],
        [3_599_000, "+59:59"],
        [3_600_000, "+1:00:00"],
        [3_723_000, "+1:02:03"],
        [36_000_000, "+10:00:00"],
    ])("formats %d ms as %j", (ms, expected) => {
        expect(formatRelativeOffset(ms)).toBe(expected);
    });

    it.each([-1, Number.NaN])("rejects %d ms", (ms) => {
        expect(() => formatRelativeOffset(ms)).toThrow(RangeError);
    });
});

describe("formatTimeAgo", () => {
    it.each([
        { elapsedMs: 0, expected: "agora" },
        { elapsedMs: 59_999, expected: "agora" },
        { elapsedMs: 60_000, expected: "há 1 min" },
        { elapsedMs: 59 * 60_000, expected: "há 59 min" },
        { elapsedMs: 3 * 60 * 60_000, expected: "há 3 h" },
        { elapsedMs: 2 * 24 * 60 * 60_000, expected: "há 2 d" },
    ])("shows $elapsedMs ms as '$expected'", ({ elapsedMs, expected }) => {
        expect(formatTimeAgo(elapsedMs)).toBe(expected);
    });

    it("shows a moment in the future as now", () => {
        expect(formatTimeAgo(-1_000)).toBe("agora");
    });
});

describe("formatTimeOfDay", () => {
    it("shows the local hours and minutes", () => {
        const at = new Date(2026, 5, 2, 15, 5);

        expect(formatTimeOfDay(at)).toBe("15:05");
    });
});

describe("formatDateTime", () => {
    it("shows the local date and time in Brazilian format", () => {
        const at = new Date(2026, 5, 2, 15, 30);

        expect(formatDateTime(at)).toBe("02/06/2026, 15:30");
    });
});

describe("formatCount", () => {
    it("uses the singular noun for one", () => {
        expect(formatCount(1, { one: "erro", other: "erros" })).toBe("1 erro");
    });

    it.each([0, 2])("uses the plural noun for %i", (count) => {
        expect(formatCount(count, { one: "erro", other: "erros" })).toBe(`${count} erros`);
    });
});

describe("formatCalendarDay", () => {
    it("shows the day and the month of a calendar day", () => {
        expect(formatCalendarDay("2026-11-02")).toBe("02/11");
    });
});

describe("formatMegabytes", () => {
    it("shows bytes as megabytes with up to one decimal", () => {
        expect(formatMegabytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
    });

    it("groups the thousands", () => {
        expect(formatMegabytes(2_048 * 1024 * 1024)).toBe("2.048 MB");
    });

    it("shows zero bytes as 0 MB", () => {
        expect(formatMegabytes(0)).toBe("0 MB");
    });
});

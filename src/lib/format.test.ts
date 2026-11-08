import {
    formatDateTime,
    formatDuration,
    formatRelativeOffset,
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

describe("formatDateTime", () => {
    it("shows the local date and time in Brazilian format", () => {
        const at = new Date(2026, 5, 2, 15, 30);

        expect(formatDateTime(at)).toBe("02/06/2026, 15:30");
    });
});

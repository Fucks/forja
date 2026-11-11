import { CUSTOM_CRON_PRESET, findCronPresetValue } from "@/web/app/triggers/cron_presets.js";

describe("findCronPresetValue", () => {
    it("finds the preset of a known expression", () => {
        expect(findCronPresetValue("0 22 * * *")).toBe("0 22 * * *");
    });

    it("falls back to the custom preset for any other expression", () => {
        expect(findCronPresetValue("15 3 * * 0")).toBe(CUSTOM_CRON_PRESET);
    });
});

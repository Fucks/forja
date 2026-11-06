import { assertNever } from "@/lib/assert_never.js";

type TrafficLight = "green" | "red";

describe("assertNever", () => {
    it("throws an error with the given message", () => {
        const unexpectedLight = pretendIsUnreachable("yellow");

        const callAssertNever = () => assertNever(unexpectedLight, "Unknown traffic light");

        expect(callAssertNever).toThrow(new Error("Unknown traffic light"));
    });

    it("includes the received value in the default message", () => {
        const unexpectedLight = pretendIsUnreachable({ color: "yellow" });

        const callAssertNever = () => assertNever(unexpectedLight);

        expect(callAssertNever).toThrow('{"color":"yellow"}');
    });

    it("rejects at compile time a switch that forgets a case", () => {
        function describeLight(light: TrafficLight): string {
            switch (light) {
                case "green":
                    return "go";
                default:
                    // @ts-expect-error "red" is not handled, so light is not narrowed to never
                    return assertNever(light);
            }
        }

        expect(() => describeLight("red")).toThrow("red");
    });
});

function pretendIsUnreachable(value: unknown): never {
    return value as never;
}

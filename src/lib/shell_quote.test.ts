import { quoteShellArgument } from "@/lib/shell_quote.js";

describe("quoteShellArgument", () => {
    it("wraps the argument in single quotes", () => {
        expect(quoteShellArgument("main")).toBe("'main'");
    });

    it("keeps shell syntax inside the argument from running", () => {
        expect(quoteShellArgument("main; rm -rf /")).toBe("'main; rm -rf /'");
    });

    it("escapes the single quotes of the argument", () => {
        expect(quoteShellArgument("it's")).toBe("'it'\\''s'");
    });
});

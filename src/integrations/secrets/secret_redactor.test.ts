import { createSecretRedactor, maskSecret } from "@/integrations/secrets/secret_redactor.js";

const MASK = "••••";
const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";
const GITHUB_TOKEN = "ghp_0123456789abcdefghij";

describe("maskSecret", () => {
    it("keeps the prefix up to the third hyphen and the last four characters", () => {
        expect(maskSecret(API_KEY)).toBe("sk-ant-api03-…a1b2");
    });

    it("keeps only the last four characters when the value has no such prefix", () => {
        expect(maskSecret(GITHUB_TOKEN)).toBe("…ghij");
    });

    it.each(["", "short", "elevenchars"])("hides the short value %j entirely", (shortValue) => {
        expect(maskSecret(shortValue)).toBe(MASK);
    });

    it("drops the prefix when it would reach the last four characters", () => {
        expect(maskSecret("abcdefg-h-i-jk")).toBe("…i-jk");
    });

    it("masks a value with exactly twelve characters", () => {
        expect(maskSecret("abcdefgh1234")).toBe("…1234");
    });
});

describe("createSecretRedactor", () => {
    it("leaves text untouched when no secret is registered", () => {
        const redactor = createSecretRedactor();

        expect(redactor.redact(`ANTHROPIC_API_KEY=${API_KEY}`)).toBe(
            `ANTHROPIC_API_KEY=${API_KEY}`,
        );
    });

    it("replaces every occurrence of a registered secret, several on the same line", () => {
        const redactor = createSecretRedactor();
        redactor.register(API_KEY);

        const redacted = redactor.redact(`a=${API_KEY} b=${API_KEY}\nc=${API_KEY}`);

        expect(redacted).toBe(`a=${MASK} b=${MASK}\nc=${MASK}`);
    });

    it("replaces every registered secret", () => {
        const redactor = createSecretRedactor();
        redactor.register(API_KEY);
        redactor.register(GITHUB_TOKEN);

        const redacted = redactor.redact(`ANTHROPIC_API_KEY=${API_KEY} GH_TOKEN=${GITHUB_TOKEN}`);

        expect(redacted).toBe(`ANTHROPIC_API_KEY=${MASK} GH_TOKEN=${MASK}`);
    });

    it("ignores values shorter than eight characters", () => {
        const redactor = createSecretRedactor();
        redactor.register("1234567");

        expect(redactor.redact("pid 1234567 started")).toBe("pid 1234567 started");
    });

    it("redacts a value with exactly eight characters", () => {
        const redactor = createSecretRedactor();
        redactor.register("12345678");

        expect(redactor.redact("token 12345678")).toBe(`token ${MASK}`);
    });

    it("replaces the longer secret whole when one secret contains another", () => {
        const redactor = createSecretRedactor();
        const embeddedToken = API_KEY.slice(0, 20);
        redactor.register(embeddedToken);
        redactor.register(API_KEY);

        const redacted = redactor.redact(`full=${API_KEY} part=${embeddedToken}`);

        expect(redacted).toBe(`full=${MASK} part=${MASK}`);
    });

    it("treats regular expression characters in a secret literally", () => {
        const redactor = createSecretRedactor();
        redactor.register("pa$$.w0rd*+?");

        expect(redactor.redact("password pa$$.w0rd*+? and paXXXw0rd")).toBe(
            `password ${MASK} and paXXXw0rd`,
        );
    });
});

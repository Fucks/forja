import {
    EMPTY_ENV_VAR_ROW,
    listEnvVarNameErrors,
    toEnvVarRows,
    toScriptEnvVars,
} from "@/web/canvas/inspector/env_var_rows.js";
import type { EnvVarRow } from "@/web/canvas/inspector/env_var_rows.js";

describe("toEnvVarRows", () => {
    it("reads a text variable and a credential variable", () => {
        const rows = toEnvVarRows([
            { name: "TITLE", value: "{{item.title}}" },
            { name: "NPM_TOKEN", credentialId: "cred_npm" },
        ]);

        expect(rows).toEqual([
            { ...EMPTY_ENV_VAR_ROW, name: "TITLE", value: "{{item.title}}" },
            {
                ...EMPTY_ENV_VAR_ROW,
                name: "NPM_TOKEN",
                source: "credential",
                credentialId: "cred_npm",
            },
        ]);
    });
});

describe("listEnvVarNameErrors", () => {
    it("rejects a name with a hyphen", () => {
        const errors = listEnvVarNameErrors([textRow("FOO-BAR")]);

        expect(errors).toEqual(["Use letras maiúsculas, números e _, sem começar por número."]);
    });

    it("rejects a name that starts with a number", () => {
        const errors = listEnvVarNameErrors([textRow("1TOKEN")]);

        expect(errors[0]).toBeDefined();
    });

    it("rejects a name already used above", () => {
        const errors = listEnvVarNameErrors([textRow("TOKEN"), textRow("TOKEN")]);

        expect(errors).toEqual([undefined, "Já existe uma variável com esse nome."]);
    });

    it("leaves a name not typed yet without error", () => {
        const errors = listEnvVarNameErrors([textRow("")]);

        expect(errors).toEqual([undefined]);
    });
});

describe("toScriptEnvVars", () => {
    it("keeps the value of a text variable and the credential of a credential variable", () => {
        const rows: EnvVarRow[] = [
            { ...textRow("TITLE"), value: "{{item.title}}", credentialId: "cred_old" },
            {
                name: "NPM_TOKEN",
                source: "credential",
                value: "leftover",
                credentialId: "cred_npm",
            },
        ];

        expect(toScriptEnvVars(rows)).toEqual([
            { name: "TITLE", value: "{{item.title}}" },
            { name: "NPM_TOKEN", credentialId: "cred_npm" },
        ]);
    });

    it("refuses rows that are not complete yet", () => {
        expect(toScriptEnvVars([textRow("")])).toBeUndefined();
        expect(
            toScriptEnvVars([{ ...EMPTY_ENV_VAR_ROW, name: "TOKEN", source: "credential" }]),
        ).toBeUndefined();
    });

    it("refuses rows with an invalid name", () => {
        expect(toScriptEnvVars([textRow("FOO-BAR")])).toBeUndefined();
    });
});

function textRow(name: string): EnvVarRow {
    return { ...EMPTY_ENV_VAR_ROW, name };
}

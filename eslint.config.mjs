import checkFile from "eslint-plugin-check-file";
import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const SOURCE_FILES = ["src/**/*.{ts,tsx}"];

export default defineConfig(
    globalIgnores(["dist/", ".sandcastle/", "coverage/"]),
    {
        files: SOURCE_FILES,
        extends: [tseslint.configs.recommendedTypeChecked, reactHooks.configs.flat.recommended],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/consistent-type-imports": "error",
        },
    },
    {
        files: SOURCE_FILES,
        plugins: { "check-file": checkFile },
        rules: {
            "check-file/filename-naming-convention": [
                "error",
                { "src/**/*.{ts,tsx}": "SNAKE_CASE" },
                { ignoreMiddleExtensions: true },
            ],
            "check-file/folder-naming-convention": ["error", { "src/**/": "SNAKE_CASE" }],
        },
    },
    prettierConfig,
);

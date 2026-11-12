import checkFile from "eslint-plugin-check-file";
import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const SOURCE_FILES = ["src/**/*.{ts,tsx}"];
const E2E_FILES = ["e2e/**/*.ts", "playwright.config.ts"];
const TYPED_FILES = [...SOURCE_FILES, ...E2E_FILES];

export default defineConfig(
    globalIgnores(["dist/", ".sandcastle/", "coverage/", "playwright-report/", "test-results/"]),
    {
        files: TYPED_FILES,
        extends: [tseslint.configs.recommendedTypeChecked],
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
        extends: [reactHooks.configs.flat.recommended],
    },
    {
        files: TYPED_FILES,
        plugins: { "check-file": checkFile },
        rules: {
            "check-file/filename-naming-convention": [
                "error",
                { "{src,e2e}/**/*.{ts,tsx}": "SNAKE_CASE" },
                { ignoreMiddleExtensions: true },
            ],
            "check-file/folder-naming-convention": ["error", { "{src,e2e}/**/": "SNAKE_CASE" }],
        },
    },
    prettierConfig,
);

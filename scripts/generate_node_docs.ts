import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ALL_NODE_DOCS } from "@/web/docs/node_docs/node_docs.js";
import {
    NODE_DOCS_MARKDOWN_DIRECTORY,
    renderNodeDocsMarkdownFiles,
} from "@/web/docs/render_node_doc_markdown.js";
import type { NodeDocsMarkdownFile } from "@/web/docs/render_node_doc_markdown.js";

const CHECK_FLAG = "--check";
const OUTDATED_EXIT_CODE = 1;

const markdownDirectory = path.resolve(NODE_DOCS_MARKDOWN_DIRECTORY);
const markdownFiles = renderNodeDocsMarkdownFiles(ALL_NODE_DOCS);

if (process.argv.includes(CHECK_FLAG)) {
    await checkMarkdownFiles(markdownFiles);
} else {
    await writeMarkdownFiles(markdownFiles);
}

async function writeMarkdownFiles(files: NodeDocsMarkdownFile[]): Promise<void> {
    await mkdir(markdownDirectory, { recursive: true });
    await Promise.all(files.map((file) => writeFile(markdownFilePath(file), file.content, "utf8")));
    console.log(`${files.length} arquivos gravados em ${NODE_DOCS_MARKDOWN_DIRECTORY}.`);
}

async function checkMarkdownFiles(files: NodeDocsMarkdownFile[]): Promise<void> {
    const outdatedFiles = await findOutdatedFiles(files);
    if (outdatedFiles.length === 0) {
        console.log(`${NODE_DOCS_MARKDOWN_DIRECTORY} está atualizado.`);
        return;
    }

    const fileNames = outdatedFiles.map((file) => file.fileName).join(", ");
    console.error(`Desatualizados: ${fileNames}. Rode npm run docs:nodes.`);
    process.exitCode = OUTDATED_EXIT_CODE;
}

async function findOutdatedFiles(files: NodeDocsMarkdownFile[]): Promise<NodeDocsMarkdownFile[]> {
    const currentContents = await Promise.all(files.map(readMarkdownFileIfExists));

    return files.filter((file, index) => currentContents[index] !== file.content);
}

async function readMarkdownFileIfExists(file: NodeDocsMarkdownFile): Promise<string | undefined> {
    try {
        return await readFile(markdownFilePath(file), "utf8");
    } catch (error) {
        if (isFileNotFoundError(error)) {
            return undefined;
        }
        throw error;
    }
}

function isFileNotFoundError(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function markdownFilePath(file: NodeDocsMarkdownFile): string {
    return path.join(markdownDirectory, file.fileName);
}

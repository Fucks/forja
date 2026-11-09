import path from "node:path";
import { Readable } from "node:stream";

import type { FsLike } from "@/server/runtime/log_store.js";

// The files of the log store kept in memory, so executor and route tests never write to disk.
export class InMemoryFs implements FsLike {
    private readonly files = new Map<string, string>();

    mkdir(): Promise<undefined> {
        return Promise.resolve(undefined);
    }

    appendFile(filePath: string, text: string): Promise<void> {
        this.files.set(filePath, (this.files.get(filePath) ?? "") + text);
        return Promise.resolve();
    }

    readFile(filePath: string): Promise<string> {
        const content = this.files.get(filePath);
        if (content === undefined) {
            return Promise.reject(new Error(`ENOENT: no such file, open '${filePath}'`));
        }

        return Promise.resolve(content);
    }

    rm(targetPath: string): Promise<void> {
        const folderPrefix = targetPath + path.sep;
        for (const filePath of [...this.files.keys()]) {
            if (filePath === targetPath || filePath.startsWith(folderPrefix)) {
                this.files.delete(filePath);
            }
        }

        return Promise.resolve();
    }

    createReadStream(filePath: string): NodeJS.ReadableStream {
        return Readable.from([this.files.get(filePath) ?? ""]);
    }
}

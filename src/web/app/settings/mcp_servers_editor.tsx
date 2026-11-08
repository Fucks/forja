import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import type { JSX } from "react";

import { EMPTY_MCP_SERVER_DRAFT } from "@/web/app/settings/tool_profile_draft.js";
import type { McpServerDraft } from "@/web/app/settings/tool_profile_draft.js";
import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Textarea } from "@/web/components/ui/textarea.js";

export function McpServersEditor({
    servers,
    onChange,
}: {
    servers: McpServerDraft[];
    onChange: (servers: McpServerDraft[]) => void;
}): JSX.Element {
    const editorId = useId();

    function replaceServerAt(index: number, server: McpServerDraft): void {
        onChange(servers.map((current, position) => (position === index ? server : current)));
    }

    function removeServerAt(index: number): void {
        onChange(servers.filter((_, position) => position !== index));
    }

    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text">Servidores MCP</legend>
            {servers.map((server, index) => (
                <McpServerRow
                    key={index}
                    rowId={`${editorId}-${index}`}
                    server={server}
                    onChange={(changed) => replaceServerAt(index, changed)}
                    onRemove={() => removeServerAt(index)}
                />
            ))}
            <Button
                className="self-start"
                onClick={() => onChange([...servers, EMPTY_MCP_SERVER_DRAFT])}
            >
                <Plus aria-hidden className="size-3.5" />
                Adicionar MCP
            </Button>
        </fieldset>
    );
}

function McpServerRow({
    rowId,
    server,
    onChange,
    onRemove,
}: {
    rowId: string;
    server: McpServerDraft;
    onChange: (server: McpServerDraft) => void;
    onRemove: () => void;
}): JSX.Element {
    const fieldIds = {
        name: `${rowId}-name`,
        command: `${rowId}-command`,
        args: `${rowId}-args`,
        env: `${rowId}-env`,
    };

    return (
        <div className="grid grid-cols-2 gap-2 rounded-sm border border-border p-2">
            <Field label="Nome do MCP" htmlFor={fieldIds.name}>
                <Input
                    mono
                    value={server.name}
                    placeholder="codegraph"
                    onChange={(event) => onChange({ ...server, name: event.target.value })}
                />
            </Field>
            <Field label="Comando" htmlFor={fieldIds.command}>
                <Input
                    mono
                    value={server.command}
                    placeholder="codegraph"
                    onChange={(event) => onChange({ ...server, command: event.target.value })}
                />
            </Field>
            <Field label="Argumentos" hint="Um por linha." htmlFor={fieldIds.args}>
                <Textarea
                    mono
                    value={server.argsText}
                    onChange={(event) => onChange({ ...server, argsText: event.target.value })}
                />
            </Field>
            <Field
                label="Variáveis de ambiente"
                hint="CHAVE=valor, uma por linha. Use ${cred:<id>} para credenciais."
                htmlFor={fieldIds.env}
            >
                <Textarea
                    mono
                    value={server.envText}
                    onChange={(event) => onChange({ ...server, envText: event.target.value })}
                />
            </Field>
            <IconButton
                className="col-span-2 justify-self-end"
                label="Remover MCP"
                icon={Trash2}
                onClick={onRemove}
            />
        </div>
    );
}

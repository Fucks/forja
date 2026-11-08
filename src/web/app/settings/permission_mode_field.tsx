import { TriangleAlert } from "lucide-react";
import type { JSX } from "react";

import { PERMISSION_MODES } from "@/shared/agent_types.js";
import type { PermissionMode } from "@/shared/agent_types.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

const PERMISSION_MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
    default: "Pede permissão antes de usar ferramentas que exigem aprovação.",
    acceptEdits: "Aceita edições de arquivo sem perguntar; pede permissão para comandos.",
    plan: "Apenas analisa e planeja: não edita arquivos nem executa comandos.",
    auto: "Decide sozinho o que aprovar, com base no contexto da tarefa.",
    dontAsk: "Nega sem perguntar tudo o que não estiver nas ferramentas permitidas.",
    bypassPermissions: "Usa qualquer ferramenta sem pedir permissão.",
};

const BYPASS_PERMISSIONS_WARNING =
    "O agente pode executar qualquer comando dentro do container; o container é a fronteira de segurança.";

const PERMISSION_MODE_OPTIONS = PERMISSION_MODES.map((mode) => ({ value: mode, label: mode }));

export function PermissionModeField({
    id,
    permissionMode,
    onChange,
}: {
    id: string;
    permissionMode: PermissionMode;
    onChange: (permissionMode: PermissionMode) => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1.5">
            <Field
                label="Modo de permissão"
                hint={PERMISSION_MODE_DESCRIPTIONS[permissionMode]}
                htmlFor={id}
            >
                <Select
                    value={permissionMode}
                    onChange={onChange}
                    options={PERMISSION_MODE_OPTIONS}
                />
            </Field>
            {permissionMode === "bypassPermissions" && (
                <p
                    role="note"
                    className="flex items-start gap-1.5 text-xs text-status-waiting-limit"
                >
                    <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                    {BYPASS_PERMISSIONS_WARNING}
                </p>
            )}
        </div>
    );
}

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent, JSX } from "react";

import { PORT_TYPES, portSchema } from "@/shared/flow_graph.js";
import type { Port, PortType } from "@/shared/flow_graph.js";
import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";
import { Switch } from "@/web/components/ui/switch.js";

const PORT_TYPE_OPTIONS = PORT_TYPES.map((type) => ({ value: type, label: type }));
const DEFAULT_PORT_TYPE: PortType = "text";
const DUPLICATE_NAME_MESSAGE = "Já existe uma entrada com esse nome.";
const INVALID_NAME_MESSAGE = "Comece com letra minúscula e use só letras, números e _.";

export function PortListEditor({
    ports,
    onAdd,
    onRemove,
}: {
    ports: Port[];
    onAdd: (port: Port) => void;
    onRemove: (name: string) => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
                {ports.map((port) => (
                    <PortRow key={port.name} port={port} onRemove={() => onRemove(port.name)} />
                ))}
            </ul>
            <NewPortForm usedNames={ports.map((port) => port.name)} onAdd={onAdd} />
        </div>
    );
}

function PortRow({ port, onRemove }: { port: Port; onRemove: () => void }): JSX.Element {
    return (
        <li className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono">{port.name}</span>
            <span className="text-muted">
                {port.type} · {port.required ? "obrigatória" : "opcional"}
            </span>
            <IconButton label={`Remover a entrada ${port.name}`} icon={Trash2} onClick={onRemove} />
        </li>
    );
}

function NewPortForm({
    usedNames,
    onAdd,
}: {
    usedNames: string[];
    onAdd: (port: Port) => void;
}): JSX.Element {
    const nameId = useId();
    const typeId = useId();
    const [name, setName] = useState("");
    const [type, setType] = useState<PortType>(DEFAULT_PORT_TYPE);
    const [isRequired, setIsRequired] = useState(true);
    const [nameError, setNameError] = useState<string>();

    function addPort(event: FormEvent): void {
        event.preventDefault();
        const error = findPortNameError(name, usedNames);
        if (error) {
            setNameError(error);
            return;
        }

        onAdd({ name, type, required: isRequired });
        setName("");
        setNameError(undefined);
    }

    return (
        <form onSubmit={addPort} className="flex flex-col gap-2">
            <Field label="Nome da porta" htmlFor={nameId} error={nameError}>
                <Input mono value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Tipo" htmlFor={typeId}>
                <Select value={type} options={PORT_TYPE_OPTIONS} onChange={setType} />
            </Field>
            <Switch label="Obrigatória" checked={isRequired} onChange={setIsRequired} />
            <div>
                <Button type="submit" size="sm">
                    Adicionar porta
                </Button>
            </div>
        </form>
    );
}

function findPortNameError(name: string, usedNames: string[]): string | undefined {
    if (usedNames.includes(name)) {
        return DUPLICATE_NAME_MESSAGE;
    }
    if (!portSchema.shape.name.safeParse(name).success) {
        return INVALID_NAME_MESSAGE;
    }

    return undefined;
}

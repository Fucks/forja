import { useState } from "react";
import type { FormEvent, JSX } from "react";

import type { WorkItem } from "@/shared/work_item_types.js";
import { useCreateLocalItem } from "@/web/board/use_board.js";
import { itemReference } from "@/web/board/work_item_card.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Textarea } from "@/web/components/ui/textarea.js";

const LABEL_SEPARATOR = ",";

export function NewItemDialog({
    projectId,
    blockerCandidates,
    open,
    onOpenChange,
}: {
    projectId: string;
    blockerCandidates: WorkItem[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}): JSX.Element {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Novo item"
            description="Itens locais entram no Backlog do board."
        >
            <NewItemForm
                projectId={projectId}
                blockerCandidates={blockerCandidates}
                onDone={() => onOpenChange(false)}
            />
        </Dialog>
    );
}

function NewItemForm({
    projectId,
    blockerCandidates,
    onDone,
}: {
    projectId: string;
    blockerCandidates: WorkItem[];
    onDone: () => void;
}): JSX.Element {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [labelsText, setLabelsText] = useState("");
    const [blockedBy, setBlockedBy] = useState<string[]>([]);
    const createItem = useCreateLocalItem(projectId);

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        createItem.mutate(
            { title, body, labels: parseLabels(labelsText), blockedBy },
            { onSuccess: onDone },
        );
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Título" htmlFor="new-item-title">
                <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Descrição" htmlFor="new-item-body">
                <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
            </Field>
            <Field label="Labels" hint="Separe as labels por vírgula." htmlFor="new-item-labels">
                <Input value={labelsText} onChange={(event) => setLabelsText(event.target.value)} />
            </Field>
            <BlockerPicker
                candidates={blockerCandidates}
                selectedIds={blockedBy}
                onChange={setBlockedBy}
            />
            {createItem.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {createItem.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onDone}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={createItem.isPending}>
                    Criar item
                </Button>
            </footer>
        </form>
    );
}

function BlockerPicker({
    candidates,
    selectedIds,
    onChange,
}: {
    candidates: WorkItem[];
    selectedIds: string[];
    onChange: (selectedIds: string[]) => void;
}): JSX.Element | null {
    if (candidates.length === 0) {
        return null;
    }

    const toggle = (itemId: string): void =>
        onChange(
            selectedIds.includes(itemId)
                ? selectedIds.filter((selectedId) => selectedId !== itemId)
                : [...selectedIds, itemId],
        );

    return (
        <fieldset className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            <legend className="mb-1 text-sm font-medium">Bloqueado por</legend>
            {candidates.map((candidate) => (
                <label key={candidate.id} className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={selectedIds.includes(candidate.id)}
                        onChange={() => toggle(candidate.id)}
                        className="accent-accent"
                    />
                    <span>
                        <span className="font-mono text-xs text-muted">
                            {itemReference(candidate)}
                        </span>{" "}
                        {candidate.title}
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

function parseLabels(labelsText: string): string[] {
    return labelsText
        .split(LABEL_SEPARATOR)
        .map((label) => label.trim())
        .filter((label) => label !== "");
}

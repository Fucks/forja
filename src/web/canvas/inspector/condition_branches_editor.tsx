import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { JSX } from "react";

import type {
    SwitchBranch,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";
import {
    canAddBranch,
    isValidBranchLabel,
    withAddedBranch,
    withBranchCondition,
    withMovedBranch,
    withoutBranch,
    withRenamedBranch,
} from "@/web/canvas/inspector/condition_branch_edits.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import { OTHERWISE_LABEL } from "@/web/canvas/inspector/switch_branch_labels.js";
import { InlineTextInput } from "@/web/canvas/inspector/text_field.js";
import { Button } from "@/web/components/ui/button.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Switch } from "@/web/components/ui/switch.js";

interface BranchesEditorProps {
    config: SwitchConditionConfig;
    fields: PickableDataField[];
    onChange: (config: SwitchConditionConfig) => void;
}

interface BranchCardProps {
    branch: SwitchBranch;
    index: number;
    branchesEditor: BranchesEditorProps;
}

const CARD_CLASSES = "flex flex-col gap-2 rounded-sm border border-border p-2";

export function ConditionBranchesEditor(props: BranchesEditorProps): JSX.Element {
    const { config, onChange } = props;

    return (
        <div className="flex flex-col gap-3">
            {config.branches.map((branch, index) => (
                <BranchCard
                    key={branch.port}
                    branch={branch}
                    index={index}
                    branchesEditor={props}
                />
            ))}
            <Button
                variant="ghost"
                className="self-start"
                disabled={!canAddBranch(config)}
                onClick={() => onChange(withAddedBranch(config))}
            >
                <Plus aria-hidden className="size-4" />
                Adicionar caminho
            </Button>
            <OtherwiseCard
                isOn={config.otherwise}
                onChange={(otherwise) => onChange({ ...config, otherwise })}
            />
        </div>
    );
}

function BranchCard({ branch, index, branchesEditor }: BranchCardProps): JSX.Element {
    const { config, fields, onChange } = branchesEditor;
    const isFirst = index === 0;
    const isLast = index === config.branches.length - 1;
    const isOnlyBranch = config.branches.length === 1;

    function renameBranch(label: string): void {
        if (isValidBranchLabel(label)) {
            onChange(withRenamedBranch(config, index, label));
        }
    }

    return (
        <section aria-label={`Caminho ${index + 1}`} className={CARD_CLASSES}>
            <div className="flex items-center gap-1">
                <InlineTextInput
                    label="Nome do caminho"
                    text={branch.label}
                    onChange={renameBranch}
                />
                <IconButton
                    label="Subir caminho"
                    icon={ArrowUp}
                    disabled={isFirst}
                    onClick={() => onChange(withMovedBranch(config, index, index - 1))}
                />
                <IconButton
                    label="Descer caminho"
                    icon={ArrowDown}
                    disabled={isLast}
                    onClick={() => onChange(withMovedBranch(config, index, index + 1))}
                />
                <IconButton
                    label="Remover caminho"
                    icon={Trash2}
                    disabled={isOnlyBranch}
                    onClick={() => onChange(withoutBranch(config, index))}
                />
            </div>
            <ConditionEditor
                value={branch.condition}
                fields={fields}
                onChange={(condition) => onChange(withBranchCondition(config, index, condition))}
            />
        </section>
    );
}

function OtherwiseCard({
    isOn,
    onChange,
}: {
    isOn: boolean;
    onChange: (isOn: boolean) => void;
}): JSX.Element {
    return (
        <section aria-label={OTHERWISE_LABEL} className={CARD_CLASSES}>
            <Switch label={`Usar ${OTHERWISE_LABEL}`} checked={isOn} onChange={onChange} />
            <p className="text-xs text-muted">
                {isOn
                    ? "O item segue por Senão quando nenhum caminho se aplica."
                    : "Quando nenhum caminho se aplica, o item fica em Precisa de humano."}
            </p>
        </section>
    );
}

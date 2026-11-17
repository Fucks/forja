import type { JSX } from "react";

import type { DataField } from "@/engine/available_data.js";
import type { Condition } from "@/shared/conditions.js";
import { BranchLabel } from "@/web/canvas/inspector/condition_branch_label.js";
import {
    conditionToSentenceParts,
    conditionToText,
} from "@/web/canvas/inspector/condition_text.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

/** The rule read as a sentence, with the branch of each answer; the tooltip has the technical text. */
export function ConditionSentence({
    condition,
    fields,
}: {
    condition: Condition;
    fields: DataField[];
}): JSX.Element {
    return (
        <Tooltip content={<span className="font-mono">{conditionToText(condition)}</span>}>
            <p aria-label="Regra em palavras" tabIndex={0} className="text-sm text-text">
                {conditionToSentenceParts(condition, fields).map((part, index) =>
                    part.isData ? <strong key={index}>{part.text}</strong> : part.text,
                )}{" "}
                → <BranchLabel branch="yes" /> <span className="text-muted">· senão →</span>{" "}
                <BranchLabel branch="no" />
            </p>
        </Tooltip>
    );
}

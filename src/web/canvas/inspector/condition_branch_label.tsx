import { Check, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

/** The way out of a Decisão: Sim when the rule holds, Não otherwise. */
export type ConditionBranch = "yes" | "no";

const BRANCH_LOOKS: Record<ConditionBranch, { label: string; icon: LucideIcon }> = {
    yes: { label: "Sim", icon: Check },
    no: { label: "Não", icon: X },
};

// The icon goes with the word, so the branch never depends on color alone.
export function BranchLabel({ branch }: { branch: ConditionBranch }): JSX.Element {
    const { label, icon: Icon } = BRANCH_LOOKS[branch];

    return (
        <span className="inline-flex items-center gap-0.5 font-medium">
            <Icon aria-hidden className="size-3.5" />
            {label}
        </span>
    );
}

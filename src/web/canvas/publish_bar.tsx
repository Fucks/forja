import { useState } from "react";
import type { JSX } from "react";
import { z } from "zod";

import { formatCount } from "@/lib/format.js";
import type { FlowVersion } from "@/shared/flow_types.js";
import { validationIssueSchema } from "@/shared/validation_issue.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import type { ApiError } from "@/web/api/api_client.js";
import { usePublishVersion } from "@/web/app/flows/use_flow_versions.js";
import { Button } from "@/web/components/ui/button.js";
import { Input } from "@/web/components/ui/input.js";
import { useToast } from "@/web/components/ui/toast.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

const NOTHING_TO_PUBLISH_LABEL = "Nada novo para publicar";
const PUBLISH_FAILED_TITLE = "Não foi possível publicar";
const HTTP_UNPROCESSABLE_ENTITY = 422;
const NO_PUBLISHED_VERSION = 0;
const ERROR_NOUNS = { one: "erro", other: "erros" };

// aria-disabled instead of disabled: a blocked publish still takes focus, so its tooltip tells why.
const BLOCKED_BUTTON_CLASSES = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const refusedIssuesSchema = z.array(validationIssueSchema);

type PublishAvailability = { canPublish: true } | { canPublish: false; reason: string };

interface PublishBarProps {
    flowId: string;
    latestVersion?: number;
    draftDiffers: boolean;
    errorCount: number;
    onPublished: (version: FlowVersion) => void;
    /** Receives the issues the server found when it refused the publish. */
    onRejected: (issues: ValidationIssue[]) => void;
}

export function PublishBar(props: PublishBarProps): JSX.Element {
    const [note, setNote] = useState("");
    const publishDraft = usePublishDraft(props, { clearNote: () => setNote("") });
    const availability = checkPublishAvailability(props);

    return (
        <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2">
            <span className="text-sm text-muted">{describeDraftStatus(props.latestVersion)}</span>
            <Input
                aria-label="Nota da versão"
                placeholder="Nota da versão (opcional)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="ml-auto max-w-80"
            />
            <PublishButton
                label={describePublishLabel(props)}
                availability={availability}
                isPublishing={publishDraft.isPublishing}
                onPublish={() => publishDraft.publish(note)}
            />
        </div>
    );
}

function PublishButton({
    label,
    availability,
    isPublishing,
    onPublish,
}: {
    label: string;
    availability: PublishAvailability;
    isPublishing: boolean;
    onPublish: () => void;
}): JSX.Element {
    function publishWhenAllowed(): void {
        if (availability.canPublish) {
            onPublish();
        }
    }

    const button = (
        <Button
            variant="primary"
            size="sm"
            loading={isPublishing}
            aria-disabled={!availability.canPublish}
            className={BLOCKED_BUTTON_CLASSES}
            onClick={publishWhenAllowed}
        >
            {label}
        </Button>
    );
    if (availability.canPublish) {
        return button;
    }

    return <Tooltip content={availability.reason}>{button}</Tooltip>;
}

function usePublishDraft(
    { flowId, onPublished, onRejected }: PublishBarProps,
    { clearNote }: { clearNote: () => void },
): { publish: (note: string) => void; isPublishing: boolean } {
    const mutation = usePublishVersion(flowId);
    const toast = useToast();

    function publish(note: string): void {
        mutation.mutate(toOptionalNote(note), {
            onSuccess: (version) => {
                clearNote();
                toast.show({ title: `v${version.version} publicada`, tone: "success" });
                onPublished(version);
            },
            onError: (error) => {
                toast.show({
                    title: PUBLISH_FAILED_TITLE,
                    description: error.message,
                    tone: "error",
                });
                const refusedIssues = readRefusedIssues(error);
                if (refusedIssues) {
                    onRejected(refusedIssues);
                }
            },
        });
    }

    return { publish, isPublishing: mutation.isPending };
}

function checkPublishAvailability({
    latestVersion,
    draftDiffers,
    errorCount,
}: PublishBarProps): PublishAvailability {
    if (!draftDiffers) {
        return { canPublish: false, reason: `O rascunho é igual à v${latestVersion}.` };
    }
    if (errorCount > 0) {
        return { canPublish: false, reason: describeErrorsToFix(errorCount) };
    }

    return { canPublish: true };
}

function describeErrorsToFix(errorCount: number): string {
    return `Corrija ${formatCount(errorCount, ERROR_NOUNS)}`;
}

function describeDraftStatus(latestVersion: number | undefined): string {
    if (latestVersion === undefined) {
        return "Rascunho · nenhuma versão publicada";
    }

    return `Rascunho · última versão publicada v${latestVersion}`;
}

function describePublishLabel({ latestVersion, draftDiffers }: PublishBarProps): string {
    if (!draftDiffers) {
        return NOTHING_TO_PUBLISH_LABEL;
    }

    return `Publicar v${(latestVersion ?? NO_PUBLISHED_VERSION) + 1}`;
}

// The server rejects an empty note; a blank field means "no note".
function toOptionalNote(note: string): string | undefined {
    const trimmedNote = note.trim();

    return trimmedNote === "" ? undefined : trimmedNote;
}

function readRefusedIssues(error: ApiError): ValidationIssue[] | undefined {
    if (error.status !== HTTP_UNPROCESSABLE_ENTITY) {
        return undefined;
    }

    return refusedIssuesSchema.safeParse(error.details).data;
}

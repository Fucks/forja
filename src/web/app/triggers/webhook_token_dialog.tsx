import { TriangleAlert } from "lucide-react";
import type { JSX } from "react";

import type { TriggerWithToken } from "@/shared/trigger_types.js";
import { toApiUrl } from "@/web/api/api_client.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";

const WEBHOOK_TOKEN_HEADER = "X-Forja-Token";

export function WebhookTokenDialog({
    trigger,
    onClose,
}: {
    trigger: TriggerWithToken;
    onClose: () => void;
}): JSX.Element {
    return (
        <Dialog open onOpenChange={onClose} title="Token do webhook" size="lg">
            <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-status-waiting-approval">
                    <TriangleAlert aria-hidden className="size-4" />
                    Copie o token agora: ele não será mostrado de novo.
                </p>
                <pre className="rounded-sm bg-canvas p-3 font-mono break-all whitespace-pre-wrap">
                    {trigger.token}
                </pre>
                <p className="text-muted">Para disparar o gatilho {trigger.name}:</p>
                <pre className="rounded-sm bg-canvas p-3 font-mono break-all whitespace-pre-wrap">
                    {buildCurlExample(trigger)}
                </pre>
                <footer className="flex justify-end">
                    <Button variant="primary" onClick={onClose}>
                        Copiei o token
                    </Button>
                </footer>
            </div>
        </Dialog>
    );
}

// The app is served by the Forja server, so its origin is where the webhook listens.
function buildCurlExample(trigger: TriggerWithToken): string {
    const webhookUrl = `${window.location.origin}${toApiUrl(`/hooks/${trigger.id}`)}`;

    return `curl -X POST ${webhookUrl} -H "${WEBHOOK_TOKEN_HEADER}: ${trigger.token}"`;
}

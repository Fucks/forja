import type { Clock } from "@/lib/clock.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import type { ForjaDb } from "@/server/db/client.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { createFlowService, type FlowService } from "@/server/flows/flow_service.js";
import { buildValidationContext } from "@/server/flows/flow_validation_context.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { createAuditLog } from "@/server/security/audit_log.js";

export interface AppFlowServiceDeps {
    db: ForjaDb;
    events: EventBus;
    clock: Clock;
}

// The flow service of the app, validating the flows against the stored credentials.
export function createAppFlowService({ db, events, clock }: AppFlowServiceDeps): FlowService {
    const credentials = new CredentialRepository(db);

    return createFlowService({
        repo: new FlowRepository(db),
        events,
        clock,
        audit: createAuditLog({ db, clock }),
        validationContext: () => buildValidationContext(credentials),
    });
}

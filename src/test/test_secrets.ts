import { MASTER_KEY_BYTES } from "@/integrations/secrets/master_key.js";
import { createSecretBox } from "@/integrations/secrets/secret_box.js";
import type { SecretBox } from "@/integrations/secrets/secret_box.js";

const FIXED_KEY_BYTE = 7;
const TEST_MASTER_KEY = Buffer.alloc(MASTER_KEY_BYTES, FIXED_KEY_BYTE);

export function createTestSecretBox(): SecretBox {
    return createSecretBox(TEST_MASTER_KEY);
}

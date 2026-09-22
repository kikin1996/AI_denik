import { buildVapiAssistantConfig } from "@/config/vapi-agent-prompt";

const VAPI_BASE_URL = "https://api.vapi.ai";

function getVapiHeaders() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error("VAPI_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface StartCallParams {
  phoneNumber: string;
  userFirstName?: string;
  metadata?: Record<string, string>;
}

export interface VapiCallResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Starts an outbound phone call via Vapi to deliver the daily journal check-in.
 * Docs: https://docs.vapi.ai/api-reference/calls/create
 */
export async function startDiaryCall({
  phoneNumber,
  userFirstName,
  metadata,
}: StartCallParams): Promise<VapiCallResponse> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!phoneNumberId) {
    throw new Error("VAPI_PHONE_NUMBER_ID is not configured");
  }

  const body: Record<string, unknown> = {
    phoneNumberId,
    customer: {
      number: phoneNumber,
    },
    metadata,
  };

  // Prefer a pre-provisioned assistant if configured; otherwise send an inline
  // assistant definition built from our prompt config.
  if (assistantId) {
    body.assistantId = assistantId;
  } else {
    body.assistant = buildVapiAssistantConfig(userFirstName);
  }

  const response = await fetch(`${VAPI_BASE_URL}/call/phone`, {
    method: "POST",
    headers: getVapiHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vapi call failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Fetches call details (including recording URL) from Vapi by call ID.
 * Useful if the webhook payload doesn't include everything needed.
 */
export async function getVapiCall(callId: string): Promise<VapiCallResponse> {
  const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
    headers: getVapiHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Vapi call ${callId} (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Verifies the shared-secret header Vapi sends on webhook requests
 * (configured as "Server URL Secret" in the Vapi dashboard).
 */
export function verifyVapiWebhookSecret(receivedSecret: string | null): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return true; // no secret configured — skip verification (dev only)
  return receivedSecret === expected;
}

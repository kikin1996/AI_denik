import http2 from "node:http2";
import jwt from "jsonwebtoken";

/**
 * Sends an iOS VoIP push via Apple's HTTP/2 provider API, authenticated
 * with a JWT signed by the APNs Auth Key (.p8) from the Apple Developer
 * portal (Certificates, Identifiers & Profiles -> Keys). VoIP pushes must
 * go straight to APNs — Expo's push service and FCM don't support the
 * `apns-push-type: voip` category.
 *
 * Required env vars:
 *   APNS_KEY_ID       - the 10-character Key ID for the .p8 key
 *   APNS_TEAM_ID       - Apple Developer Team ID
 *   APNS_AUTH_KEY      - contents of the .p8 file (including BEGIN/END lines)
 *   APNS_BUNDLE_ID     - the app's bundle identifier (e.g. cz.daystory.app)
 *   APNS_ENVIRONMENT   - "production" or "sandbox" (defaults to production)
 */

let cachedToken: { token: string; issuedAt: number } | null = null;

function getProviderToken(): string {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_AUTH_KEY;

  if (!keyId || !teamId || !privateKey) {
    throw new Error("APNS_KEY_ID, APNS_TEAM_ID, and APNS_AUTH_KEY must be configured");
  }

  // APNs provider tokens are valid up to 1 hour; reuse for 50 minutes to
  // avoid resigning on every request while staying safely inside the limit.
  const now = Date.now();
  if (cachedToken && now - cachedToken.issuedAt < 50 * 60 * 1000) {
    return cachedToken.token;
  }

  const token = jwt.sign({ iss: teamId, iat: Math.floor(now / 1000) }, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
  });

  cachedToken = { token, issuedAt: now };
  return token;
}

export interface VoipPushPayload {
  uuid: string;
  callerName?: string;
}

export async function sendVoipPush(deviceToken: string, payload: VoipPushPayload): Promise<void> {
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) throw new Error("APNS_BUNDLE_ID must be configured");

  const environment = process.env.APNS_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  const host =
    environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const providerToken = getProviderToken();
  const body = JSON.stringify({
    aps: { alert: "Incoming DayStory call" },
    uuid: payload.uuid,
    callerName: payload.callerName ?? "DayStory",
  });

  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(host);
    client.on("error", reject);

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": `${bundleId}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });

    let responseBody = "";
    let status = 0;

    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve();
      } else {
        reject(new Error(`APNs push failed (${status}): ${responseBody}`));
      }
    });
    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

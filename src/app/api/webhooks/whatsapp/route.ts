import crypto from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_BUCKET = "journal-media";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizePhoneNumber(twilioFrom: string): string {
  // Twilio sends WhatsApp numbers as "whatsapp:+420123456789"
  return twilioFrom.replace(/^whatsapp:/, "");
}

/**
 * Verifies the `X-Twilio-Signature` header so we only accept webhook calls
 * that actually came from Twilio. Algorithm: HMAC-SHA1 of the full request
 * URL + sorted "key+value" param pairs, keyed by the Twilio auth token.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("TWILIO_AUTH_TOKEN not configured; rejecting webhook");
    return false;
  }
  if (!signatureHeader) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expectedSignature = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureHeader));
}

/**
 * Downloads a Twilio media asset (requires Basic Auth) and re-uploads it to
 * Supabase Storage so it persists beyond Twilio's retention window and can be
 * served to the dashboard without exposing Twilio credentials.
 */
async function mirrorMediaToStorage(
  supabase: ReturnType<typeof createAdminClient>,
  mediaUrl: string,
  contentType: string,
  userId: string
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.error("Twilio credentials not configured; cannot mirror media");
    return null;
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!response.ok) {
    console.error("Failed to download WhatsApp media", mediaUrl, response.status);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const extension = contentType.split("/")[1]?.split(";")[0] || "bin";
  const path = `${userId}/${todayIsoDate()}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, Buffer.from(arrayBuffer), { contentType, upsert: false });

  if (error) {
    console.error("Failed to upload media to Supabase storage", error);
    return null;
  }

  const { data: publicUrl } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return publicUrl.publicUrl;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const publicUrl =
    forwardedProto && forwardedHost
      ? `${forwardedProto}://${forwardedHost}${request.nextUrl.pathname}`
      : request.url;

  const isValidSignature = verifyTwilioSignature(
    publicUrl,
    params,
    request.headers.get("x-twilio-signature")
  );

  if (!isValidSignature) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
  }

  const from = formData.get("From")?.toString();
  const body = formData.get("Body")?.toString() ?? "";
  const numMedia = parseInt(formData.get("NumMedia")?.toString() ?? "0", 10);

  if (!from) {
    return new NextResponse("<Response></Response>", {
      status: 400,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const phoneNumber = normalizePhoneNumber(from);
  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (userError || !user) {
    console.warn("WhatsApp webhook: unknown user for phone number", phoneNumber);
    return new NextResponse(
      "<Response><Message>Tvoje číslo jsme nenašli v systému. Zaregistruj se prosím na webu.</Message></Response>",
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = formData.get(`MediaUrl${i}`)?.toString();
    const contentType = formData.get(`MediaContentType${i}`)?.toString() ?? "application/octet-stream";
    if (!mediaUrl) continue;

    const storedUrl = await mirrorMediaToStorage(supabase, mediaUrl, contentType, user.id);
    if (storedUrl) mediaUrls.push(storedUrl);
  }

  const date = todayIsoDate();

  const { data: existingEntry } = await supabase
    .from("journal_entries")
    .select("id, media_urls, raw_transcript")
    .eq("user_id", user.id)
    .eq("date", date)
    .maybeSingle();

  if (existingEntry) {
    const mergedMedia = [...(existingEntry.media_urls ?? []), ...mediaUrls];
    const mergedTranscript = body
      ? [existingEntry.raw_transcript, `[WhatsApp] ${body}`].filter(Boolean).join("\n\n")
      : existingEntry.raw_transcript;

    await supabase
      .from("journal_entries")
      .update({ media_urls: mergedMedia, raw_transcript: mergedTranscript })
      .eq("id", existingEntry.id);
  } else {
    await supabase.from("journal_entries").insert({
      user_id: user.id,
      date,
      media_urls: mediaUrls,
      raw_transcript: body ? `[WhatsApp] ${body}` : null,
    });
  }

  return new NextResponse(
    "<Response><Message>Díky! Přidal jsem to k dnešnímu zápisu v deníku. 📔</Message></Response>",
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

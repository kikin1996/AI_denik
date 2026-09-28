import { mediaDevices, RTCPeerConnection, RTCSessionDescription } from "react-native-webrtc";

import { supabase } from "@/services/supabase";
import { env } from "@/config/env";
import { DIARY_AGENT_INSTRUCTIONS } from "@/config/agentPrompt";

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const REALTIME_MODEL = "gpt-realtime-2.1";

export interface TranscriptTurn {
  speaker: "agent" | "user";
  text: string;
}

type TranscriptListener = (turns: TranscriptTurn[]) => void;

/**
 * Manages one OpenAI Realtime voice-to-voice WebRTC session. Mints its own
 * short-lived client secret via the backend (POST /api/realtime/session —
 * never expose the real OPENAI_API_KEY to the app), so the app never holds a
 * long-lived OpenAI credential.
 */
export class RealtimeVoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: ReturnType<RTCPeerConnection["createDataChannel"]> | null = null;
  private localStream: Awaited<ReturnType<typeof mediaDevices.getUserMedia>> | null = null;
  private turns: TranscriptTurn[] = [];
  private listeners = new Set<TranscriptListener>();
  private pendingAssistantText = "";

  onTranscriptUpdate(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitTranscript() {
    for (const listener of this.listeners) listener([...this.turns]);
  }

  async start(): Promise<void> {
    const ephemeralKey = await this.mintEphemeralKey();

    this.pc = new RTCPeerConnection();

    // react-native-webrtc plays remote audio tracks through the device's
    // active audio route automatically once attached to the peer connection
    // — no <RTCView> needed for audio-only. (Using the `on<event>` setters
    // rather than addEventListener: react-native-webrtc's exported class
    // shares a name with the ambient lib.dom.d.ts RTCPeerConnection type,
    // which TypeScript resolves ahead of the import for addEventListener's
    // overload set — the onX setters are unambiguous.)
    this.pc.ontrack = (event: { track: { kind: string } }) => {
      console.log("Remote track received", event.track?.kind);
    };

    this.localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    this.dataChannel = this.pc.createDataChannel("oai-events");
    this.dataChannel.onopen = () => this.sendSessionUpdate();
    this.dataChannel.onmessage = (event: { data: string }) => this.handleRealtimeEvent(event.data);

    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);

    const sdpResponse = await fetch(`${OPENAI_REALTIME_CALLS_URL}?model=${REALTIME_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    if (!sdpResponse.ok) {
      throw new Error(`OpenAI Realtime SDP exchange failed (${sdpResponse.status})`);
    }

    const answerSdp = await sdpResponse.text();
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));
  }

  private async mintEphemeralKey(): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not signed in");

    const res = await fetch(`${env.apiBaseUrl}/api/realtime/session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Failed to mint realtime session token (${res.status})`);
    const json = await res.json();
    return json.client_secret as string;
  }

  private sendSessionUpdate() {
    this.sendEvent({
      type: "session.update",
      session: {
        instructions: DIARY_AGENT_INSTRUCTIONS,
        audio: {
          input: { transcription: { model: "gpt-live-transcribe" } },
        },
      },
    });
  }

  private sendEvent(event: Record<string, unknown>) {
    this.dataChannel?.send(JSON.stringify(event));
  }

  private handleRealtimeEvent(raw: string) {
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        if (event.transcript) {
          this.turns.push({ speaker: "user", text: event.transcript });
          this.emitTranscript();
        }
        break;
      }
      case "response.output_audio_transcript.delta": {
        this.pendingAssistantText += event.delta ?? "";
        break;
      }
      case "response.done": {
        // Authoritative source for the assistant's final turn text — more
        // robust than trying to track every delta/done event name exactly,
        // since the Realtime API's exact event set is still evolving.
        const outputText = extractAssistantText(event.response);
        const text = outputText || this.pendingAssistantText;
        if (text) {
          this.turns.push({ speaker: "agent", text });
          this.emitTranscript();
        }
        this.pendingAssistantText = "";
        break;
      }
      default:
        break;
    }
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  getTranscript(): TranscriptTurn[] {
    return [...this.turns];
  }

  end() {
    this.dataChannel?.close();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.localStream = null;
  }
}

function extractAssistantText(response: any): string {
  if (!response?.output) return "";
  const parts: string[] = [];
  for (const item of response.output) {
    for (const content of item.content ?? []) {
      if (content.transcript) parts.push(content.transcript);
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join(" ").trim();
}

import { RealtimeVoiceSession } from "@/services/realtimeVoice";

/**
 * Singleton holding the in-progress call's WebRTC session, so it survives
 * the gap between CallKeep's `answerCall` event (fired at the app root,
 * before any screen exists) and the in-call screen mounting.
 */
class ActiveCallStore {
  uuid: string | null = null;
  session: RealtimeVoiceSession | null = null;

  async start(uuid: string): Promise<RealtimeVoiceSession> {
    this.uuid = uuid;
    this.session = new RealtimeVoiceSession();
    await this.session.start();
    return this.session;
  }

  end() {
    this.session?.end();
    this.session = null;
    this.uuid = null;
  }
}

export const activeCall = new ActiveCallStore();

export type CallStatus = "initiated" | "ringing" | "in-progress" | "completed" | "failed" | "no-answer";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_user_id: string;
          email: string | null;
          phone_number: string | null;
          timezone: string;
          preferred_call_time: string; // "HH:MM:SS"
          call_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          email?: string | null;
          phone_number?: string | null;
          timezone?: string;
          preferred_call_time?: string;
          call_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          email?: string | null;
          phone_number?: string | null;
          timezone?: string;
          preferred_call_time?: string;
          call_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string; // YYYY-MM-DD
          raw_transcript: string | null;
          summary: string | null;
          mood_rating: number | null;
          key_events: string[] | null;
          tags: string[] | null;
          media_urls: string[] | null;
          audio_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          raw_transcript?: string | null;
          summary?: string | null;
          mood_rating?: number | null;
          key_events?: string[] | null;
          tags?: string[] | null;
          media_urls?: string[] | null;
          audio_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          raw_transcript?: string | null;
          summary?: string | null;
          mood_rating?: number | null;
          key_events?: string[] | null;
          tags?: string[] | null;
          media_urls?: string[] | null;
          audio_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      call_logs: {
        Row: {
          id: string;
          user_id: string;
          vapi_call_id: string | null;
          status: CallStatus;
          duration_seconds: number | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          vapi_call_id?: string | null;
          status?: CallStatus;
          duration_seconds?: number | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          vapi_call_id?: string | null;
          status?: CallStatus;
          duration_seconds?: number | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];
export type CallLogRow = Database["public"]["Tables"]["call_logs"]["Row"];

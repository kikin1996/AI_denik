# AI Deník

Hlasový/WhatsApp AI deník: každý večer AI agent zavolá uživateli přes Vapi, hovor se přepíše a
promění ve strukturovaný deníkový zápis (shrnutí, nálada, témata). Fotky a dodatečné poznámky lze
poslat přes WhatsApp a automaticky se přiřadí k dnešnímu zápisu.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind, shadcn/ui-style komponenty)
- **Supabase** — Postgres databáze, Auth (magic link), Storage (fotky), RLS
- **Vapi** — odchozí hlasové hovory a webhooky s přepisem
- **Twilio WhatsApp** — příchozí fotky/text
- **Anthropic Claude / OpenAI** — analýza přepisu (shrnutí, nálada, tagy)

## Nastavení

### 1. Supabase

1. Vytvoř nový projekt na [supabase.com](https://supabase.com).
2. V SQL editoru spusť [`supabase/schema.sql`](supabase/schema.sql) — vytvoří tabulky `users`,
   `journal_entries`, `call_logs`, RLS politiky a storage bucket `journal-media`.
3. Zapni Email OTP (magic link) v Authentication → Providers.
4. Zkopíruj `Project URL`, `anon key` a `service_role key` do `.env.local`.

### 2. Vapi (hlasový agent)

1. Založ účet na [vapi.ai](https://vapi.ai), pořiď telefonní číslo (`VAPI_PHONE_NUMBER_ID`).
2. Buď necháš aplikaci posílat inline definici asistenta (viz
   [`src/config/vapi-agent-prompt.ts`](src/config/vapi-agent-prompt.ts)), nebo asistenta
   předvytvoříš ve Vapi dashboardu se stejným promptem a doplníš `VAPI_ASSISTANT_ID`.
3. V nastavení asistenta / serveru nastav webhook URL na
   `https://tvoje-domena.cz/api/webhooks/vapi` a shodný `Server URL Secret` jako
   `VAPI_WEBHOOK_SECRET`.

### 3. WhatsApp (Twilio)

1. Aktivuj Twilio WhatsApp Sandbox (nebo produkční WhatsApp Business number).
2. Nastav "When a message comes in" webhook na `https://tvoje-domena.cz/api/webhooks/whatsapp`.
3. Doplň `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`.

### 4. AI zpracování

Nastav `ANTHROPIC_API_KEY` a/nebo `OPENAI_API_KEY` a zvol `AI_PROVIDER` (`anthropic` | `openai`).

### 5. Spouštění večerních hovorů

Scheduling řeší externí systém (mimo tento repo) — hodinově volá
`GET /api/cron/trigger-calls` s hlavičkou `Authorization: Bearer $CRON_SECRET`. Endpoint si sám
podle `preferred_call_time` a časového pásma vybere uživatele, kterým má v danou hodinu zavolat.

### 6. Lokální vývoj

```bash
cp .env.example .env.local   # doplň skutečné klíče
npm install
npm run dev
```

## Struktura projektu

```
src/
  app/
    api/webhooks/vapi/route.ts       # zpracuje end-of-call-report, uloží journal_entry
    api/webhooks/whatsapp/route.ts   # přiřadí fotky/text k dnešnímu zápisu
    api/cron/trigger-calls/route.ts  # hodinově spouští odchozí hovory
    auth/callback/route.ts           # dokončení magic-link přihlášení
    dashboard/page.tsx               # timeline zápisů
    dashboard/entries/[id]/page.tsx  # detail zápisu (audio + přepis)
    dashboard/settings/page.tsx      # telefon, čas hovoru, časové pásmo
    login/page.tsx
  components/                        # journal-card, settings-form, ui/*
  config/vapi-agent-prompt.ts        # systémový prompt a konfigurace hlasového agenta
  lib/
    supabase/{client,server,types}.ts
    vapi.ts                          # Vapi API klient
    ai.ts                            # analýza přepisu (Anthropic/OpenAI)
    user.ts                          # profil přihlášeného uživatele
supabase/schema.sql                  # DB schéma + RLS
```

## Bezpečnostní poznámky

- Webhooky a cron používají Supabase **service role** klienta (`createAdminClient`), který obchází
  RLS — proto ověřují `VAPI_WEBHOOK_SECRET` / `CRON_SECRET` před zpracováním požadavku.
- RLS politiky zajišťují, že uživatel vidí a upravuje pouze svoje vlastní zápisy a profil.

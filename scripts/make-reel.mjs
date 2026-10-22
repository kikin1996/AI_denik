#!/usr/bin/env node
// make-reel.mjs - sestříhá jeden deníkový zápis (nahrávka hovoru + reel_plan + fotky/videa
// z WhatsApp) do hotového Reelu (9:16 MP4). Odpovídá kroku popsanému v README jako
// "napiš Claudovi v chatu: udělej reels z [datum]" - běží lokálně, nic negeneruje, jen
// stříhá to, co uživatel doopravdy řekl a poslal. Nic se automaticky nepublikuje.
//
// Použití:
//   node scripts/make-reel.mjs 2026-10-20
//   node scripts/make-reel.mjs 2026-10-20 --user +420123456789
//   node scripts/make-reel.mjs 2026-10-20 --out out/muj-den.mp4
//
// Vyžaduje v .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Zápis musí mít reel_plan (tlačítko "Připravit podklady" v dashboardu) s ČASOVANÝMI
// soundbity (transcript_messages musí existovat - u starších zápisů bez něj neznáme
// přesný čas v nahrávce, takže se nedá přesně střihat).

import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const INTRO_SECONDS = 2.5;
const MIN_SEGMENT_SECONDS = 1.2;
const CAPTION_CHARS_PER_LINE = 26;
const CAPTION_MAX_LINES = 4;
const CAPTION_FONTSIZE = 58;
const CAPTION_LINE_HEIGHT = 74;
const CAPTION_BOTTOM_Y = HEIGHT - 300;
const INTRO_FONTSIZE = 84;
const INTRO_LINE_HEIGHT = 104;

// Systémová písma (Windows) - appka běží lokálně na stejném počítači, žádné bundlování.
// Tahle verze ffmpeg-static (BtbN Windows build) v drawtext špatně parsuje absolutní
// cestu typu "C:/..." UVNITŘ filtergrafu (escapovaná dvojtečka se buď tiše ignoruje -
// font se pak potichu nahradí vestavěným fallbackem - nebo u textfile rovnou spadne
// na "both text and text file provided", živě ověřeno). Appka proto fonty zkopíruje
// do pracovního adresáře a spouští ffmpeg s cwd nastaveným tam, takže ve filtru stačí
// holé jméno souboru bez cesty i bez dvojtečky.
const FONT_REGULAR = "font-regular.ttf";
const FONT_BOLD = "font-bold.ttf";
let ffmpegCwd = process.cwd();

function loadEnvLocal(repoRoot) {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ffmpegCwd });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${path.basename(cmd)} exited ${code}\n${stderr.slice(-2000)}`));
    });
    proc.on("error", reject);
  });
}

function ffmpeg(args) {
  return run(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stažení selhalo (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return destPath;
}

function guessExtension(url, contentType) {
  const fromUrl = path.extname(new URL(url).pathname).replace(".", "");
  if (fromUrl) return fromUrl;
  if (contentType?.includes("video")) return "mp4";
  return "jpg";
}

function wrapCaption(text) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length > CAPTION_CHARS_PER_LINE && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, CAPTION_MAX_LINES);
}

// Vkládaný (ne souborový) text pro drawtext: tenhle build ffmpeg-static má na Windows
// dvě chyby, živě ověřené izolovaně - `textfile=` vždycky nahlásí "both text and
// text file provided" i bez `text=`, a `\n` uvnitř `text=` se nikdy nezlomí na nový
// řádek (žádný počet zpětných lomítek nepomůže, vždycky skončí jako doslovné "n").
// Appka proto text vkládá přímo (`text='...'`, uvozovky ochrání ':' a ',') a VÍCE
// ŘÁDKŮ staví jako víc navrstvených drawtext filtrů za sebou, každý na pevné
// Y souřadnici - žádné zalomení uvnitř jednoho filtru appka nepotřebuje.
function quoteLine(line) {
  const esc = line.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/%/g, "\\%");
  return `'${esc}'`;
}

// Postaví řetězec víc drawtext filtrů (jeden na řádek), svisle vystředěných kolem
// `centerY`, nebo (když je `centerY` null) zarovnaných spodním řádkem na `bottomY`.
function stackedDrawtext(rawText, { fontFile, fontsize, lineHeight, color, centerY = null, bottomY = null, extra = "" }) {
  const lines = wrapCaption(rawText);
  const n = lines.length;
  return lines
    .map((line, i) => {
      const y = centerY != null ? Math.round(centerY - ((n - 1) / 2 - i) * lineHeight) : Math.round(bottomY - (n - 1 - i) * lineHeight);
      return `drawtext=fontfile=${fontFile}:text=${quoteLine(line)}:fontcolor=${color}:fontsize=${fontsize}:x=(w-text_w)/2:y=${y}${extra}`;
    })
    .join(",");
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  loadEnvLocal(repoRoot);

  const args = process.argv.slice(2);
  const dateArg = args.find((a) => !a.startsWith("--"));
  const userArg = args.includes("--user") ? args[args.indexOf("--user") + 1] : null;
  const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

  if (!dateArg) {
    console.error("Použití: node scripts/make-reel.mjs YYYY-MM-DD [--user telefon] [--out cesta.mp4]");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Chybí NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY v .env.local.");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let userId = null;
  if (userArg) {
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("phone_number", userArg)
      .maybeSingle();
    if (error || !user) {
      console.error(`Uživatel s telefonem ${userArg} nenalezen.`);
      process.exit(1);
    }
    userId = user.id;
  } else {
    const { data: users, error } = await supabase.from("users").select("id, phone_number");
    if (error) throw error;
    if (users.length > 1) {
      console.error(
        "V appce je víc uživatelů, uveď --user <telefon>:\n" +
          users.map((u) => `  ${u.phone_number ?? u.id}`).join("\n")
      );
      process.exit(1);
    }
    userId = users[0]?.id ?? null;
  }
  if (!userId) {
    console.error("Žádný uživatel v databázi.");
    process.exit(1);
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("date", dateArg)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) {
    console.error(`Zápis pro ${dateArg} neexistuje.`);
    process.exit(1);
  }
  if (!entry.audio_url) {
    console.error(`Zápis ${dateArg} nemá nahrávku hovoru (audio_url), není co stříhat.`);
    process.exit(1);
  }
  if (!entry.reel_plan) {
    console.error(
      `Zápis ${dateArg} ještě nemá podklady pro Reels. Klikni v dashboardu na "Připravit podklady" a spusť appku znovu.`
    );
    process.exit(1);
  }

  const plan = entry.reel_plan;
  const soundbites = (plan.soundbites ?? []).filter((s) => s.text?.trim());
  if (!soundbites.length) {
    console.error("reel_plan neobsahuje žádné soundbity.");
    process.exit(1);
  }
  const untimed = soundbites.filter((s) => s.approxStartSeconds == null || s.approxEndSeconds == null);
  if (untimed.length) {
    console.error(
      `${untimed.length} z ${soundbites.length} soundbitů nemá čas v nahrávce (starý zápis bez transcript_messages).\n` +
        "Nahrávku pro ně nejde přesně vystřihnout - appka to nebude hádat. Over v dashboardu ručně, nebo zápis přeskoč."
    );
    process.exit(1);
  }

  console.log(`Zápis ${dateArg}: "${plan.introTitle}" - ${soundbites.length} soundbitů, ${(entry.media_urls ?? []).length} médií.`);

  const workDir = await mkdtemp(path.join(os.tmpdir(), "daystory-reel-"));
  ffmpegCwd = workDir;
  await copyFile("C:/Windows/Fonts/arial.ttf", path.join(workDir, FONT_REGULAR));
  await copyFile("C:/Windows/Fonts/arialbd.ttf", path.join(workDir, FONT_BOLD));
  const outDir = path.join(repoRoot, "out");
  await mkdir(outDir, { recursive: true });
  const outPath = outArg ? path.resolve(outArg) : path.join(outDir, `reel-${dateArg}.mp4`);

  // --- 1. Stáhni nahrávku hovoru a vystřihni každý soundbite přesně podle reel_plan. ---
  console.log("Stahuju nahrávku hovoru...");
  const recordingPath = path.join(workDir, `recording${path.extname(new URL(entry.audio_url).pathname) || ".mp3"}`);
  await downloadTo(entry.audio_url, recordingPath);

  const segmentAudioFiles = [];
  for (let i = 0; i < soundbites.length; i++) {
    const sb = soundbites[i];
    const duration = Math.max(MIN_SEGMENT_SECONDS, sb.approxEndSeconds - sb.approxStartSeconds);
    const segPath = path.join(workDir, `voice-${i}.m4a`);
    await ffmpeg([
      "-ss", String(Math.max(0, sb.approxStartSeconds)),
      "-i", recordingPath,
      "-t", String(duration),
      "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac",
      segPath,
    ]);
    segmentAudioFiles.push({ path: segPath, duration });
  }

  // --- 2. Stáhni b-roll (fotky/videa z WhatsApp), rozděl mezi soundbity (cyklicky). ---
  const mediaUrls = entry.media_urls ?? [];
  const mediaFiles = [];
  for (let i = 0; i < mediaUrls.length; i++) {
    const url = mediaUrls[i];
    const ext = guessExtension(url);
    const dest = path.join(workDir, `media-${i}.${ext}`);
    try {
      await downloadTo(url, dest);
      mediaFiles.push(dest);
    } catch (err) {
      console.warn(`Médium ${url} se nepodařilo stáhnout, přeskakuju: ${err.message}`);
    }
  }
  const isVideoFile = (p) => [".mp4", ".mov", ".m4v", ".webm"].includes(path.extname(p).toLowerCase());

  // --- 3. Pro každý soundbite postav tichý klip (b-roll nebo barevná karta + titulek). ---
  console.log("Skládám b-roll a titulky...");
  const segmentVideoFiles = [];
  for (let i = 0; i < soundbites.length; i++) {
    const sb = soundbites[i];
    const duration = segmentAudioFiles[i].duration;
    const media = mediaFiles.length ? mediaFiles[i % mediaFiles.length] : null;
    const segPath = path.join(workDir, `video-${i}.mp4`);

    const captionLines = wrapCaption(sb.text);
    const boxTop = CAPTION_BOTTOM_Y - (captionLines.length - 1) * CAPTION_LINE_HEIGHT - 20;
    const boxHeight = captionLines.length * CAPTION_LINE_HEIGHT + 40;
    const captionBox = `drawbox=x=40:y=${boxTop}:w=${WIDTH - 80}:h=${boxHeight}:color=black@0.45:t=fill`;
    const captionText = stackedDrawtext(sb.text, {
      fontFile: FONT_REGULAR,
      fontsize: CAPTION_FONTSIZE,
      lineHeight: CAPTION_LINE_HEIGHT,
      color: "white",
      bottomY: CAPTION_BOTTOM_Y,
    });
    const drawtext = `${captionBox},${captionText}`;

    if (media && isVideoFile(media)) {
      await ffmpeg([
        "-stream_loop", "-1", "-i", media,
        "-t", String(duration),
        "-vf",
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},${drawtext}`,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        segPath,
      ]);
    } else if (media) {
      // Jemný Ken Burns zoom na fotce, ať pozadí nestojí úplně na místě.
      const frames = Math.round(duration * FPS);
      await ffmpeg([
        "-loop", "1", "-i", media,
        "-t", String(duration),
        "-vf",
        `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase,` +
          `zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},${drawtext}`,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        segPath,
      ]);
    } else {
      // Žádné médium k dispozici - jednolitá tmavá karta, jen titulek (fail-open).
      await ffmpeg([
        "-f", "lavfi", "-i", `color=c=0x141413:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}`,
        "-vf", drawtext,
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        segPath,
      ]);
    }
    segmentVideoFiles.push(segPath);
  }

  // --- 4. Úvodní titulní karta (ticho, bez b-rollu). ---
  const introPath = path.join(workDir, "intro.mp4");
  const introAlpha = `alpha=if(lt(t\\,0.4)\\,t/0.4\\,if(gt(t\\,${INTRO_SECONDS - 0.4})\\,(${INTRO_SECONDS}-t)/0.4\\,1))`;
  const introText = stackedDrawtext(plan.introTitle || "Můj deníček", {
    fontFile: FONT_BOLD,
    fontsize: INTRO_FONTSIZE,
    lineHeight: INTRO_LINE_HEIGHT,
    color: "white",
    centerY: HEIGHT / 2,
    extra: `:${introAlpha}`,
  });
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=0x141413:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${INTRO_SECONDS}`,
    "-vf", introText,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    introPath,
  ]);

  // --- 5. Slep video (intro + segmenty) a audio (ticho přes intro + voiceover segmenty). ---
  const videoConcatList = path.join(workDir, "video-concat.txt");
  await writeFile(
    videoConcatList,
    [introPath, ...segmentVideoFiles].map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8"
  );
  const combinedVideo = path.join(workDir, "combined-video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", videoConcatList, "-c", "copy", combinedVideo]);

  const introSilence = path.join(workDir, "intro-silence.m4a");
  await ffmpeg([
    "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
    "-t", String(INTRO_SECONDS), "-c:a", "aac",
    introSilence,
  ]);
  const audioConcatList = path.join(workDir, "audio-concat.txt");
  await writeFile(
    audioConcatList,
    [introSilence, ...segmentAudioFiles.map((s) => s.path)]
      .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
      .join("\n"),
    "utf8"
  );
  const combinedAudio = path.join(workDir, "combined-audio.m4a");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", audioConcatList, "-c", "copy", combinedAudio]);

  // --- 6. Finální mux. ---
  await ffmpeg([
    "-i", combinedVideo,
    "-i", combinedAudio,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac",
    "-shortest",
    outPath,
  ]);

  const totalSeconds = INTRO_SECONDS + segmentAudioFiles.reduce((sum, s) => sum + s.duration, 0);
  console.log(`\nHotovo: ${outPath}`);
  console.log(`Délka: ~${totalSeconds.toFixed(1)}s (${soundbites.length} soundbitů + intro ${INTRO_SECONDS}s)`);
  console.log("Nic se automaticky nepublikovalo - přehraj a over, než to kamkoli nahraješ.");
}

main().catch((err) => {
  console.error("CHYBA:", err.message);
  process.exit(1);
});

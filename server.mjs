import http from "node:http";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const ROOT = resolve(process.cwd());
const OUTPUT_ROOT = join(ROOT, "generated");
const PORT = Number(process.env.PORT || 4173);
await loadLocalEnv();
const API_KEY = process.env.OPENAI_API_KEY;
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
const VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL || "sora-2";
const SPEECH_MODEL = process.env.OPENAI_SPEECH_MODEL || "gpt-4o-mini-tts";
const jobs = new Map();

async function loadLocalEnv() {
  try {
    const value = await readFile(join(ROOT, ".env.local"), "utf8");
    for (const line of value.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
async function bodyJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new Error("ข้อมูลมีขนาดใหญ่เกินไป"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function openai(path, options = {}) {
  if (!API_KEY) throw new Error("ยังไม่ได้เปิดระบบสร้างงาน");
  const response = await fetch(`https://api.openai.com/v1${path}`, { ...options, headers: { Authorization: `Bearer ${API_KEY}`, ...(options.headers || {}) } });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(detail?.error?.message || `ระบบสร้างงานตอบกลับ ${response.status}`);
    error.status = response.status; throw error;
  }
  return response;
}
function storyboardSchema() {
  return { type: "object", additionalProperties: false, required: ["projectTitle", "summary", "scenes"], properties: {
    projectTitle: { type: "string" }, summary: { type: "string" }, scenes: { type: "array", minItems: 3, maxItems: 12, items: { type: "object", additionalProperties: false,
      required: ["title", "duration", "visual", "motion", "narration", "prompt"], properties: { title: { type: "string" }, duration: { type: "integer", minimum: 8, maximum: 8 }, visual: { type: "string" }, motion: { type: "string" }, narration: { type: "string" }, prompt: { type: "string" } } } }
  } };
}
async function createStoryboard(data) {
  const seconds = Number.parseInt(data.duration, 10) || 30;
  const count = Math.max(3, Math.min(12, Math.ceil(seconds / 8)));
  const instructions = `คุณคือทีมวางเรื่องวิดีโอของทันใจ AI Studio สร้างแผนจำนวน ${count} ฉาก ฉากละ 8 วินาที ให้เรื่องต่อเนื่องและไม่ซ้ำกัน
ใช้ข้อมูลจริงเท่านั้น ห้ามแต่งชื่อบุคคล วันเวลา สถานที่ หรือตัวเลขเพิ่ม
แต่ละฉากต้องมีภาพ การเคลื่อนไหวจริงของวัตถุหรือตัวละคร การเคลื่อนกล้อง เสียงพากย์สั้นที่อ่านจบภายใน 8 วินาที และ Prompt สำหรับสร้างวิดีโอ
แนวภาพเป็นจุดเริ่มต้น ผสมกับคำอธิบายเพิ่มเติมของผู้ใช้ได้ ไม่บังคับให้งานทุกประเภทหน้าตาเหมือนกัน
หากข้อมูลกล่าวถึงบุคคลจริงหรือบุคคลสาธารณะ ห้ามสร้างหรือเลียนแบบใบหน้า ให้ใช้ภาพกิจกรรม สถานที่ มือ วัตถุ หรือภาพกว้างที่ไม่ระบุตัวบุคคล และกล่าวชื่อได้เฉพาะในเสียงพากย์
Prompt ต้องบอกภาพ การเคลื่อนไหว กล้อง แสง อารมณ์ สัดส่วน และความต่อเนื่อง ห้ามตัวอักษร โลโก้ และลายน้ำ ตอบ JSON ตามโครงสร้างเท่านั้น`;
  const input = `ชื่องาน: ${data.name || "ยังไม่ได้ตั้งชื่อ"}\nประเภทงาน: ${data.genre || "กำหนดเอง"}\nสัดส่วน: ${data.aspect || "16:9 แนวนอน"}\nบรรยากาศ: ${data.visual || "ให้ทันใจแนะนำ"}\nจังหวะ: ${data.movement || "ให้ทันใจแนะนำ"}\nคำอธิบายเพิ่ม: ${data.customStyle || "ไม่มี"}\nผู้ชม: ${data.audience || "ประชาชนทั่วไป"}\nน้ำเสียง: ${data.tone || "สุภาพ ชัดเจน"}\nเรื่อง: ${data.topic || ""}\nข้อมูลตามจริง: ${data.facts || "ไม่มีข้อมูลเพิ่มเติม"}`;
  const response = await openai("/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: TEXT_MODEL, store: false, instructions, input, text: { format: { type: "json_schema", name: "tanjai_video_plan", strict: true, schema: storyboardSchema() } } }) });
  const result = await response.json();
  const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("ยังไม่ได้รับแผนวิดีโอ กรุณาลองใหม่");
  return JSON.parse(outputText);
}
function videoSettings(aspect = "16:9 แนวนอน") { return aspect.startsWith("16:9") ? { request: "1280x720", width: 1280, height: 720 } : { request: "720x1280", width: aspect.startsWith("1:1") ? 1080 : aspect.startsWith("4:5") ? 1080 : 720, height: aspect.startsWith("1:1") ? 1080 : aspect.startsWith("4:5") ? 1350 : 1280 }; }
function videoPrompt(scene, project) {
  return `${scene.prompt}\nการเคลื่อนไหว: ${scene.motion}. บรรยากาศตลอดงาน: ${project.visual}. จังหวะ: ${project.movement}. ${project.customStyle || ""}\nสร้างเป็นคลิปเคลื่อนไหวต่อเนื่อง 8 วินาที สัดส่วน ${project.aspect}. ภาพสะอาด ไม่มีข้อความ ไม่มีโลโก้ ไม่มีลายน้ำ ไม่มีบุคคลจริงหรือบุคคลสาธารณะ`;
}
async function createMovingClip(scene, project, target, onProgress) {
  const form = new FormData(); form.set("model", VIDEO_MODEL); form.set("prompt", videoPrompt(scene, project)); form.set("size", videoSettings(project.aspect).request); form.set("seconds", "8");
  const started = await openai("/videos", { method: "POST", body: form });
  let video = await started.json();
  const deadline = Date.now() + 20 * 60_000;
  while (!["completed", "failed"].includes(video.status)) {
    if (Date.now() > deadline) throw new Error("การสร้างคลิปใช้เวลานานเกินไป กรุณาลองใหม่");
    onProgress?.(Number(video.progress || 0));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
    video = await (await openai(`/videos/${video.id}`)).json();
  }
  if (video.status !== "completed") throw new Error(video.error?.message || "สร้างคลิปเคลื่อนไหวยังไม่สำเร็จ");
  const content = await openai(`/videos/${video.id}/content`);
  await writeFile(target, Buffer.from(await content.arrayBuffer()));
}
async function createSpeech(scene, project, target) {
  if (project.language === "ไม่มีเสียงพากย์" || !scene.narration?.trim()) return false;
  const response = await openai("/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: SPEECH_MODEL, voice: "marin", input: scene.narration, instructions: "อ่านชัดเจน เป็นธรรมชาติ พอดีภายใน 8 วินาที", response_format: "mp3" }) });
  await writeFile(target, Buffer.from(await response.arrayBuffer())); return true;
}
function run(command, args) {
  return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] }); let errorText = ""; child.stderr.on("data", (chunk) => { errorText += chunk.toString(); }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(errorText.slice(-1000) || `${command} ทำงานไม่สำเร็จ`))); });
}
async function prepareSegment(video, speech, hasSpeech, output, settings) {
  const scale = `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=increase,crop=${settings.width}:${settings.height}`;
  const args = ["-y", "-i", video];
  if (hasSpeech) args.push("-i", speech, "-map", "0:v:0", "-map", "1:a:0"); else args.push("-map", "0:v:0", "-map", "0:a?");
  args.push("-vf", scale, "-t", "8", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  await run("ffmpeg", args);
}
async function runProduction(jobId, project) {
  const job = jobs.get(jobId); const dir = join(OUTPUT_ROOT, jobId); await mkdir(dir, { recursive: true });
  const scenes = project.scope === "preview" ? project.scenes.slice(0, 1) : project.scenes;
  const settings = videoSettings(project.aspect); const segments = [];
  try {
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index]; const base = String(index + 1).padStart(2, "0");
      const raw = join(dir, `${base}-raw.mp4`); const speech = join(dir, `${base}-voice.mp3`); const segment = join(dir, `${base}.mp4`);
      job.message = `กำลังสร้างคลิปที่ ${index + 1} จาก ${scenes.length}`;
      await createMovingClip(scene, project, raw, (value) => { job.progress = Math.min(90, Math.round(((index + value / 100) / scenes.length) * 90)); });
      job.message = `กำลังใส่เสียงฉากที่ ${index + 1}`;
      const hasSpeech = await createSpeech(scene, project, speech);
      await prepareSegment(raw, speech, hasSpeech, segment, settings); segments.push(segment);
      job.progress = Math.round(((index + 1) / scenes.length) * 90);
    }
    const list = join(dir, "segments.txt"); await writeFile(list, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    const output = join(dir, "tanjai-video.mp4"); job.message = "กำลังรวมทุกฉากเป็นวิดีโอ";
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
    job.status = "completed"; job.progress = 100; job.message = "วิดีโอพร้อมดาวน์โหลดแล้ว"; job.downloadUrl = `/generated/${jobId}/tanjai-video.mp4`;
  } catch (error) {
    job.status = "failed"; job.message = friendlyError(error); job.error = true;
    await rm(dir, { recursive: true, force: true });
  }
}
function friendlyError(error) {
  if (error.status === 401) return "สิทธิ์สร้างงานยังใช้ไม่ได้ กรุณาตรวจการตั้งค่าระบบ";
  if (error.status === 429) return "วงเงินไม่พอหรือมีงานพร้อมกันมากเกินไป กรุณาตรวจยอดและลองใหม่";
  if (error.status === 403) return "บัญชีนี้ยังไม่มีสิทธิ์สร้างวิดีโอด้วยรุ่นที่เลือก";
  if (/safety|policy|public figure|real people|face/i.test(error.message)) return "ฉากนี้มีบุคคลจริงหรือเนื้อหาที่ระบบสร้างแทนไม่ได้ กรุณาปรับเป็นภาพกิจกรรม สถานที่ หรือภาพสื่อความหมาย";
  return error.message || "ยังสร้างวิดีโอไม่สำเร็จ";
}
function startProduction(project) {
  if (!Array.isArray(project.scenes) || !project.scenes.length) throw new Error("ยังไม่มีฉากสำหรับสร้างวิดีโอ");
  if (!API_KEY) throw new Error("ยังไม่ได้เปิดระบบสร้างงาน");
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  jobs.set(jobId, { id: jobId, status: "queued", progress: 0, message: "กำลังเตรียมงาน", createdAt: Date.now() });
  queueMicrotask(() => { const job = jobs.get(jobId); job.status = "processing"; runProduction(jobId, project); });
  return { jobId };
}
async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  if (pathname.includes("..") || pathname.startsWith("/.")) return send(res, 404, { error: "ไม่พบไฟล์" });
  const file = normalize(join(ROOT, pathname)); if (!file.startsWith(ROOT)) return send(res, 404, { error: "ไม่พบไฟล์" });
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
  try { await stat(file); res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" }); createReadStream(file).pipe(res); } catch { send(res, 404, { error: "ไม่พบไฟล์" }); }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ready: Boolean(API_KEY), videoModel: VIDEO_MODEL, message: API_KEY ? "พร้อมสร้างงาน" : "ยังไม่ได้เปิดระบบสร้างงาน" });
    if (req.method === "POST" && url.pathname === "/api/storyboard") return send(res, 200, await createStoryboard(await bodyJson(req)));
    if (req.method === "POST" && url.pathname === "/api/produce") return send(res, 202, startProduction(await bodyJson(req)));
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)$/);
    if (req.method === "GET" && jobMatch) { const job = jobs.get(jobMatch[1]); return job ? send(res, 200, job) : send(res, 404, { error: "ไม่พบงานนี้ อาจเป็นเพราะระบบเริ่มใหม่แล้ว" }); }
    return serveStatic(req, res);
  } catch (error) { console.error(error.message); send(res, error.status && error.status < 500 ? error.status : 500, { error: friendlyError(error) }); }
});
server.listen(PORT, () => console.log(`Tanjai Video Studio: http://localhost:${PORT}`));

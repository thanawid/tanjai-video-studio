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

const MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const SPEECH_MODEL = process.env.OPENAI_SPEECH_MODEL || "gpt-4o-mini-tts";
const API_KEY = process.env.OPENAI_API_KEY;

async function loadLocalEnv() {
  try {
    const value = await readFile(join(ROOT, ".env.local"), "utf8");
    for (const line of value.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("ข้อมูลมีขนาดใหญ่เกินไป");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function openai(path, options = {}) {
  if (!API_KEY) throw new Error("ยังไม่ได้เปิดระบบสร้างงาน");
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = detail?.error?.message || `OpenAI ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response;
}

function aspectSize(aspect = "16:9 แนวนอน") {
  return aspect.startsWith("9:16") ? "1024x1536" : aspect.startsWith("1:1") ? "1024x1024" : "1536x1024";
}

function storyboardSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["projectTitle", "summary", "scenes"],
    properties: {
      projectTitle: { type: "string" },
      summary: { type: "string" },
      scenes: {
        type: "array",
        minItems: 4,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "duration", "visual", "narration", "prompt"],
          properties: {
            title: { type: "string" },
            duration: { type: "integer", minimum: 4, maximum: 30 },
            visual: { type: "string" },
            narration: { type: "string" },
            prompt: { type: "string" }
          }
        }
      }
    }
  };
}

async function createStoryboard(data) {
  const seconds = Number.parseInt(data.duration, 10) || 60;
  const count = Math.max(4, Math.min(12, Math.round(seconds / 10)));
  const instructions = `คุณคือผู้กำกับและนักเขียนบทวิดีโอภาษาไทยของ Tanjai Video Studio
สร้างแผนวิดีโอที่นำไปผลิตได้จริง จำนวน ${count} ฉาก รวมใกล้เคียง ${seconds} วินาที
แต่ละฉากต้องเดินเรื่องต่อกันและมีเนื้อหาไม่ซ้ำกัน ใช้ข้อมูลจริงเท่านั้น ห้ามแต่งชื่อบุคคล วันที่ สถานที่ หรือตัวเลขเพิ่ม
เสียงพากย์ต้องเป็นธรรมชาติ กระชับ อ่านออกเสียงง่าย และพอดีกับเวลาฉาก
prompt ต้องอธิบายภาพ การจัดองค์ประกอบ แสง อารมณ์ การเคลื่อนไหวของกล้อง และความต่อเนื่องของตัวละครหรือสถานที่
ห้ามใส่ตัวอักษร โลโก้ หรือลายน้ำลงในภาพ
ตอบตามโครงสร้าง JSON ที่กำหนดเท่านั้น`;
  const input = `ชื่อโครงการ: ${data.name || "ยังไม่ได้ตั้งชื่อ"}
ประเภท: ${data.genre || "ประชาสัมพันธ์"}
สัดส่วน: ${data.aspect || "16:9 แนวนอน"}
แนวภาพ: ${data.visual || "ภาพยนตร์สมจริง"}
ผู้ชม: ${data.audience || "ประชาชนทั่วไป"}
น้ำเสียง: ${data.tone || "สุภาพ ชัดเจน"}
เรื่องที่ต้องการเล่า: ${data.topic || ""}
ข้อมูลที่ต้องใช้ตามจริง: ${data.facts || "ไม่มีข้อมูลเพิ่มเติม"}`;
  const response = await openai("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      instructions,
      input,
      text: { format: { type: "json_schema", name: "tanjai_storyboard", strict: true, schema: storyboardSchema() } }
    })
  });
  const result = await response.json();
  const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("AI ยังไม่ได้ส่งแผนวิดีโอกลับมา");
  return JSON.parse(outputText);
}

async function createImage(scene, project, target) {
  const prompt = `${scene.prompt}\nบริบทของเรื่อง: ${project.topic || project.name}. แนวภาพเดียวกันทั้งโครงการ: ${project.visual}. ภาพสะอาด ไม่มีตัวหนังสือ ไม่มีลายน้ำ`;
  const response = await openai("/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: aspectSize(project.aspect), quality: "low", output_format: "png" })
  });
  const result = await response.json();
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error("ยังไม่ได้รับภาพจากระบบ");
  await writeFile(target, Buffer.from(encoded, "base64"));
}

async function createSpeech(scene, target) {
  const response = await openai("/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: SPEECH_MODEL, voice: "marin", input: scene.narration, instructions: "อ่านภาษาไทยชัดเจน สุภาพ เป็นธรรมชาติ ไม่รีบ และไม่ตะโกน", response_format: "mp3" })
  });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => { errorText += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(errorText.slice(-800) || `${command} ทำงานไม่สำเร็จ`)));
  });
}

async function produceVideo(project) {
  if (!Array.isArray(project.scenes) || !project.scenes.length) throw new Error("ยังไม่มีฉากสำหรับสร้างวิดีโอ");
  const jobId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = join(OUTPUT_ROOT, jobId);
  await mkdir(dir, { recursive: true });
  const segments = [];
  try {
    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index];
      const base = String(index + 1).padStart(2, "0");
      const image = join(dir, `${base}.png`);
      const audio = join(dir, `${base}.mp3`);
      const segment = join(dir, `${base}.mp4`);
      await Promise.all([createImage(scene, project, image), createSpeech(scene, audio)]);
      await run("ffmpeg", ["-y", "-loop", "1", "-i", image, "-i", audio, "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "-shortest", "-movflags", "+faststart", segment]);
      segments.push(segment);
    }
    const list = join(dir, "segments.txt");
    await writeFile(list, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    const output = join(dir, "tanjai-video.mp4");
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
    return { jobId, downloadUrl: `/generated/${jobId}/tanjai-video.mp4` };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  if (pathname.includes("..") || pathname.startsWith("/.")) return send(res, 404, { error: "ไม่พบไฟล์" });
  const file = normalize(join(ROOT, pathname));
  if (!file.startsWith(ROOT) || file.includes(`${join(ROOT, "generated")}${join("", ".")}`)) return send(res, 404, { error: "ไม่พบไฟล์" });
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
  try {
    await stat(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch { send(res, 404, { error: "ไม่พบไฟล์" }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ready: Boolean(API_KEY), message: API_KEY ? "พร้อมสร้างงาน" : "ยังไม่ได้เปิดระบบสร้างงาน" });
    if (req.method === "POST" && url.pathname === "/api/storyboard") return send(res, 200, await createStoryboard(await bodyJson(req)));
    if (req.method === "POST" && url.pathname === "/api/produce") return send(res, 200, await produceVideo(await bodyJson(req)));
    return serveStatic(req, res);
  } catch (error) {
    console.error(error.message);
    const friendly = error.status === 401 ? "กุญแจสำหรับสร้างงานยังใช้งานไม่ได้" : error.status === 429 ? "วงเงินสำหรับสร้างงานยังไม่พร้อม หรือมีงานเข้ามาพร้อมกันมากเกินไป" : error.message;
    send(res, error.status && error.status < 500 ? error.status : 500, { error: friendly });
  }
});

server.listen(PORT, () => console.log(`Tanjai Video Studio: http://localhost:${PORT}`));

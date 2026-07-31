import { FFmpeg } from "./vendor/ffmpeg/index.js";

const ffmpeg = new FFmpeg();
let loaded = false;
let rendering = false;
let latestLog = "";

const $ = (selector) => document.querySelector(selector);
const safeName = (value) => String(value || "tanjai-video").replace(/[\\/:*?"<>|]+/g, "-").trim() || "tanjai-video";
const setStatus = (title, detail, percent = 0) => {
  const box = $("#renderStatus");
  if (!box) return;
  box.hidden = false;
  $("#renderStatusTitle").textContent = title;
  $("#renderStatusDetail").textContent = detail;
  $("#renderPercent").textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  $("#renderProgressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
};

ffmpeg.on("log", ({ message }) => {
  latestLog = message || latestLog;
  const log = $("#renderLog");
  if (log) log.textContent = latestLog;
});

async function loadFFmpeg() {
  if (loaded) return;
  const coreURL = new URL("./vendor/ffmpeg-core/ffmpeg-core.js", import.meta.url).href;
  const sourceWasmURL = new URL("./vendor/ffmpeg-core/ffmpeg-core.wasm", import.meta.url).href;
  setStatus("กำลังโหลด FFmpeg", "ครั้งแรกประมาณ 31 MB จากไฟล์ภายในเว็บไซต์", 3);
  const response = await fetch(sourceWasmURL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`ไม่พบไฟล์ FFmpeg Core (${response.status}) กรุณาอัปโหลดโฟลเดอร์ vendor/ffmpeg-core ให้ครบ`);
  }
  const wasmBytes = await response.arrayBuffer();
  if (wasmBytes.byteLength < 4) throw new Error("ไฟล์ FFmpeg Core ว่างหรืออัปโหลดไม่ครบ");
  const signature = new Uint8Array(wasmBytes, 0, 4);
  if (signature[0] !== 0 || signature[1] !== 97 || signature[2] !== 115 || signature[3] !== 109) {
    throw new Error("ไฟล์ FFmpeg Core บนเว็บไซต์ไม่สมบูรณ์ กรุณาอัปโหลด vendor/ffmpeg-core/ffmpeg-core.wasm ใหม่");
  }
  const wasmURL = URL.createObjectURL(new Blob([wasmBytes], { type: "application/wasm" }));
  try {
    await ffmpeg.load({ coreURL, wasmURL });
  } finally {
    URL.revokeObjectURL(wasmURL);
  }
  loaded = true;
  setStatus("FFmpeg พร้อมทำงาน", "กำลังเตรียมคลิปตาม Timeline", 8);
}

function outputSize(aspect) {
  if (String(aspect).startsWith("9:16")) return [720, 1280];
  if (String(aspect).startsWith("1:1")) return [1080, 1080];
  return [1280, 720];
}

async function cleanup(paths) {
  for (const path of paths) {
    try { await ffmpeg.deleteFile(path); } catch {}
  }
}

async function renderMP4() {
  if (rendering) return;
  const context = window.TanjaiVideoBridge?.getRenderContext?.();
  const clips = context?.clips || [];
  if (!clips.length) {
    setStatus("ยังไม่มีไฟล์ต้นฉบับ", "กลับไปขั้นเพิ่มคลิป แล้วเลือกไฟล์อีกครั้ง", 0);
    return;
  }
  if (clips.length > 5) {
    setStatus("รุ่นทดลองรองรับไม่เกิน 5 คลิป", `ขณะนี้มี ${clips.length} คลิป กรุณาทดลอง 3–5 คลิปก่อน`, 0);
    return;
  }
  rendering = true;
  const button = $("#renderMP4");
  if (button) button.disabled = true;
  const tempFiles = [];
  try {
    await loadFFmpeg();
    const [width, height] = outputSize(context.aspect);
    const segmentNames = [];
    for (let index = 0; index < clips.length; index += 1) {
      const clip = clips[index];
      const extension = (clip.name.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp4";
      const inputName = `input-${index}.${extension}`;
      const segmentName = `segment-${index}.mp4`;
      const duration = Math.max(.1, (Number(clip.end) || Number(clip.duration) || 0) - (Number(clip.start) || 0));
      tempFiles.push(inputName, segmentName);
      segmentNames.push(segmentName);
      setStatus(`กำลังเตรียมคลิป ${index + 1}/${clips.length}`, clip.name, 10 + (index / clips.length) * 65);
      await ffmpeg.writeFile(inputName, new Uint8Array(await clip.file.arrayBuffer()));
      const exitCode = await ffmpeg.exec([
        "-ss", String(Number(clip.start) || 0),
        "-i", inputName,
        "-t", String(duration),
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "27",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-b:a", "128k",
        "-movflags", "+faststart",
        segmentName,
      ]);
      await cleanup([inputName]);
      if (exitCode !== 0) throw new Error(`ไม่สามารถเตรียม ${clip.name} ได้ (${latestLog})`);
    }
    const concatName = "concat.txt";
    const outputName = "tanjai-output.mp4";
    tempFiles.push(concatName, outputName);
    await ffmpeg.writeFile(concatName, new TextEncoder().encode(segmentNames.map((name) => `file '${name}'`).join("\n")));
    setStatus("กำลังรวม Timeline", "ต่อคลิปและจัดโครงสร้าง MP4", 82);
    const concatExit = await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", concatName, "-c", "copy", "-movflags", "+faststart", outputName]);
    if (concatExit !== 0) throw new Error(`รวม Timeline ไม่สำเร็จ (${latestLog})`);
    setStatus("กำลังเตรียมไฟล์ดาวน์โหลด", "อ่านวิดีโอที่เรนเดอร์เสร็จแล้ว", 95);
    const data = await ffmpeg.readFile(outputName);
    const url = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(context.projectName)}.mp4`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus("สร้างวิดีโอสำเร็จ", "ดาวน์โหลด MP4 แล้ว กรุณาเปิดตรวจภาพและเสียงก่อนใช้งาน", 100);
  } catch (error) {
    console.error(error);
    setStatus("สร้างวิดีโอไม่สำเร็จ", error?.message || "เบราว์เซอร์หรือชนิดไฟล์ยังไม่รองรับ", 0);
    const log = $("#renderLog");
    if (log) { log.hidden = false; log.textContent = latestLog || String(error); }
  } finally {
    await cleanup(tempFiles);
    rendering = false;
    if (button) button.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#renderMP4")) renderMP4();
});

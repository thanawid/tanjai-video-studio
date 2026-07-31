(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const STORAGE_KEY = "tanjai-video-studio-projects-v1";
  const modeConfig = {
    footage: {
      label: "ตัดต่อจากคลิปที่มี",
      steps: ["ตั้งค่าโครงการ", "เพิ่มคลิป", "เลือกแนว", "จัดลำดับ", "ตรวจ Timeline", "ส่งออก"],
      title: "สร้างโครงการจากฟุตเทจ",
    },
    generate: {
      label: "สร้างวิดีโอใหม่ด้วย AI",
      steps: ["ตั้งค่าเรื่อง", "เขียนพล็อต", "ภาพและอารมณ์", "ตัวละครและเสียง", "Storyboard", "สร้างและส่งออก"],
      title: "สร้างเรื่องใหม่ด้วย AI",
    },
  };
  const state = {
    mode: null,
    step: 0,
    id: new URLSearchParams(location.search).get("projectId") || crypto.randomUUID(),
    source: new URLSearchParams(location.search).get("source") || "direct",
    name: "",
    updatedAt: Date.now(),
    data: {},
  };
  let selectedClips = [];
  const clipFiles = new Map();
  let activePreviewUrl = "";
  const handoffKey = `tanjai-video-handoff:${state.id}`;
  try {
    const handoff = JSON.parse(localStorage.getItem(handoffKey) || "null");
    if (handoff?.projectId === state.id) {
      state.name = handoff.destinationName ? `${handoff.destinationName}จากทันใจ` : "";
      state.data.clipCount = handoff.clipCount || 0;
      state.data.style = handoff.destination === "news" ? "ข่าว / งานกิจกรรม" : handoff.destination === "short" ? "Reel / TikTok" : "ไฮไลต์กระชับ";
      state.data.handoff = handoff;
    }
  } catch {}

  const panels = {
    footage: [
      () => fields(`
        <div class="field full"><label>ชื่อโครงการ</label><input data-key="name" value="${escapeHtml(state.name)}" placeholder="เช่น สรุปกิจกรรมเทศบาลเมืองบางรักน้อย"></div>
        <div class="field"><label>รูปแบบวิดีโอ</label><select data-key="aspect"><option>16:9 แนวนอน</option><option>9:16 แนวตั้ง</option><option>1:1 จัตุรัส</option></select></div>
        <div class="field"><label>ความยาวเป้าหมาย</label><select data-key="duration"><option>ประมาณ 3 นาที</option><option>30–60 วินาที</option><option>ประมาณ 5 นาที</option><option>กำหนดเอง</option></select></div>`),
      () => `<label class="dropzone"><input id="clipInput" type="file" accept="video/*,.mkv,.mov,.avi" multiple><strong>🎞️ เพิ่มคลิปจากเครื่อง</strong><span>เลือกพร้อมกันได้จำนวนมาก หรือรับรายการที่เตรียมจากทันใจ AI Studio</span><small id="clipCount">${state.data.clipCount || 0} คลิปในโครงการ · ไฟล์ยังอยู่ในเครื่องของคุณ</small></label>
        <div class="clip-toolbar"><small>รายการจะแสดงสูงสุด 30 คลิปต่อครั้ง เพื่อไม่ให้หน้าเว็บกิน RAM เกินจำเป็น</small><button class="ghost compact" id="clearClips" type="button">ล้างรายการ</button></div>
        <div class="clip-list" id="clipList">${renderClipList()}</div>`,
      () => choices("style", [
        ["ข่าว / งานกิจกรรม", "สุภาพ ชัดเจน เรียงเหตุการณ์"],
        ["ไฮไลต์กระชับ", "เลือกช่วงเด่น จังหวะคล่องตัว"],
        ["Reel / TikTok", "แนวตั้ง เปิดเรื่องไว"],
        ["ภาพยนตร์", "มีจังหวะและอารมณ์"],
        ["อบอุ่น", "สีอุ่น เล่าเรื่องเป็นกันเอง"],
        ["กำหนดเอง", "ตั้งกฎการตัดต่อด้วยตัวเอง"],
      ]),
      () => summary("แผนงานที่ระบบจะจัดให้", [
        ["วิเคราะห์คลิป", `${state.data.clipCount || 0} คลิป`],
        ["แนวที่เลือก", state.data.style || "ข่าว / งานกิจกรรม"],
        ["ขั้นตอน", "อ่าน Metadata → เรียงลำดับ → เปิด Timeline"],
        ["สถานะ", selectedClips.length ? "พร้อมจัด Timeline" : "รอเพิ่มคลิป"],
      ], "รุ่นนี้ใช้การจัดลำดับในเครื่อง ยังไม่เรียก AI และไม่ส่งคลิปออกจากอุปกรณ์"),
      () => renderTimelineEditor(),
      () => `${summary("พร้อมสร้างวิดีโอ", [
        ["วิดีโอ", "MP4 H.264"],
        ["เครื่องมือ", "FFmpeg ทำงานในเครื่อง"],
        ["Timeline", `${selectedClips.length || state.data.clipCount || 0} คลิป · ${formatTime(timelineDuration())}`],
        ["สถานะ", selectedClips.length ? "พร้อมทดลองเรนเดอร์ 3–5 คลิป" : "ต้องเลือกไฟล์ต้นฉบับอีกครั้ง"],
      ], "รุ่น 0.4 ทดลองตัด ต่อ และรักษาเสียงใน Chrome/Edge บนคอมพิวเตอร์")}
      <div class="render-actions">
        <button class="primary" id="renderMP4" type="button" ${selectedClips.length ? "" : "disabled"}>สร้างวิดีโอ MP4</button>
        <details class="developer-tools"><summary>เครื่องมือสำหรับนักพัฒนา</summary><button class="ghost compact" id="downloadEditPlan" type="button">ดาวน์โหลด Edit Plan JSON</button></details>
      </div>
      <div class="render-status" id="renderStatus" hidden>
        <div class="render-status-head"><b id="renderStatusTitle">กำลังเตรียมเครื่องเรนเดอร์</b><span id="renderPercent">0%</span></div>
        <div class="render-progress"><i id="renderProgressBar"></i></div>
        <small id="renderStatusDetail">ดาวน์โหลด FFmpeg Core ครั้งแรกประมาณ 31 MB</small>
        <pre id="renderLog" hidden></pre>
      </div>`,
    ],
    generate: [
      () => fields(`
        <div class="field full"><label>ชื่อโครงการ</label><input data-key="name" value="${escapeHtml(state.name)}" placeholder="เช่น นิทานเด็กเรื่องเจ้ากระต่ายผู้กล้า"></div>
        <div class="field"><label>ประเภทผลงาน</label><select data-key="genre"><option>ประชาสัมพันธ์</option><option>นิทานเด็ก</option><option>MV เพลง</option><option>หนังสั้น</option><option>ซีรีส์แนวตั้ง</option><option>กำหนดเอง</option></select></div>
        <div class="field"><label>สัดส่วนภาพ</label><select data-key="aspect"><option>16:9 แนวนอน</option><option>9:16 แนวตั้ง</option><option>1:1 จัตุรัส</option></select></div>`),
      () => fields(`<div class="field full"><label>หัวข้อหรือโครงเรื่อง</label><textarea data-key="plot" placeholder="บอกว่าเรื่องเกี่ยวกับอะไร ใครเป็นตัวหลัก และอยากให้จบแบบไหน">${escapeHtml(state.data.plot || "")}</textarea><small>AI จะช่วยขยายเป็นโครงเรื่องและแบ่งฉากให้ตรวจ ก่อนสร้างภาพหรือวิดีโอจริง</small></div>`),
      () => choices("visual", [
        ["ภาพยนตร์สมจริง", "แสงและมิติแบบภาพยนตร์"],
        ["แอนิเมชัน 3D", "สดใส เหมาะกับครอบครัว"],
        ["อนิเมะ", "เส้นและอารมณ์แบบญี่ปุ่น"],
        ["งานศิลปะ", "ภาพวาดและพื้นผิวโดดเด่น"],
        ["อบอุ่น", "แสงนุ่ม สีเป็นมิตร"],
        ["กำหนดเอง", "ระบุสไตล์ แสง สี และบรรยากาศ"],
      ]),
      () => fields(`
        <div class="field full"><label>ตัวละครและบุคคลอ้างอิง</label><textarea data-key="characters" placeholder="ระบุตัวละคร อายุโดยประมาณ เสื้อผ้า บุคลิก และเสียง">${escapeHtml(state.data.characters || "")}</textarea><small>หากใช้ภาพบุคคลจริง ระบบต้องรักษาอัตลักษณ์เดิม ไม่สร้างใบหน้าใหม่ ไม่เปลี่ยนโครงหน้า และไม่ทำให้ตัวตนคลาดเคลื่อน</small></div>
        <div class="field"><label>ภาษาเสียงพากย์</label><select data-key="language"><option>ภาษาไทย</option><option>ไม่มีเสียงพากย์</option><option>ภาษาอังกฤษ</option></select></div>
        <div class="field"><label>จำนวนฉาก</label><select data-key="scenes"><option>6 ฉาก</option><option>10 ฉาก</option><option>15 ฉาก</option><option>กำหนดเอง</option></select></div>`),
      () => summary("Storyboard ที่จะสร้าง", [
        ["แนว", state.data.visual || "ภาพยนตร์สมจริง"],
        ["โครงสร้าง", "ภาพฉาก · Visual Prompt · บทพูด"],
        ["การควบคุม", "แก้หรือสร้างใหม่แยกฉาก"],
        ["ต้นทุน", "แสดงประมาณการก่อนสร้างจริง"],
      ], "ตอนนี้เป็น Workflow จำลอง ยังไม่เชื่อมโมเดลสร้างภาพ วิดีโอ หรือเสียง"),
      () => summary("พร้อมเข้าสู่สายการผลิต", [
        ["สร้าง", "ภาพ → วิดีโอ → เสียงรายฉาก"],
        ["ประกอบ", "Timeline + เพลง + ซับ + โลโก้"],
        ["ส่งออก", "MP4 · SRT · Shot List · Caption"],
        ["สถานะ", "ต้องเลือกผู้ให้บริการ AI และงบประมาณก่อน"],
      ], "การสร้างใหม่จะเริ่มหลังจากผู้ใช้อนุมัติ Storyboard และค่าใช้จ่าย"),
    ],
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
  function fields(content) { return `<div class="form-grid">${content}</div>`; }
  function choices(key, items) {
    const selected = state.data[key] || items[0][0];
    return `<div class="choice-grid">${items.map(([title, detail]) => `<label class="choice"><input type="radio" name="${key}" data-key="${key}" value="${title}" ${selected === title ? "checked" : ""}><b>${title}</b><span>${detail}</span></label>`).join("")}</div>`;
  }
  function summary(title, items, note) {
    return `<div class="summary-box"><h3>${title}</h3><div class="summary-list">${items.map(([key, value]) => `<div><small>${key}</small><b>${escapeHtml(value)}</b></div>`).join("")}</div><p><small>${note}</small></p></div>`;
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }
  function formatTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
  }
  function timelineDuration() {
    return selectedClips.reduce((total, clip) => total + Math.max(0, (clip.end ?? clip.duration ?? 0) - (clip.start || 0)), 0);
  }
  function renderClipList() {
    if (!selectedClips.length) return `<div class="clip-more">ยังไม่มีคลิปในรายการ</div>`;
    const visible = selectedClips.slice(0, 30);
    return visible.map((clip, index) => `<div class="clip-row"><i>${String(index + 1).padStart(2, "0")}</i><button class="clip-name" type="button" data-preview-clip="${clip.id}"><b title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</b><small>${formatBytes(clip.size)} · ${clip.status === "ready" ? formatTime(clip.duration) : clip.status === "error" ? "อ่านไม่ได้" : "กำลังอ่านข้อมูล"}</small></button><button class="clip-remove" type="button" data-remove-clip="${clip.id}" aria-label="ลบ ${escapeHtml(clip.name)}">×</button></div>`).join("") +
      (selectedClips.length > visible.length ? `<div class="clip-more">และอีก ${selectedClips.length - visible.length} คลิป · เก็บไว้ในคิวโดยไม่สร้าง Preview พร้อมกัน</div>` : "");
  }
  function renderTimelineEditor() {
    if (!selectedClips.length) return `<div class="timeline-empty"><span>🎬</span><b>ยังไม่มีไฟล์วิดีโอในหน่วยความจำ</b><small>ย้อนกลับไปขั้น “เพิ่มคลิป” แล้วเลือกไฟล์อีกครั้ง</small></div>`;
    const available = selectedClips.find((clip) => clipFiles.has(clip.id));
    if (!available) return `<div class="timeline-empty"><span>📂</span><b>กรุณาเลือกไฟล์คลิปอีกครั้ง</b><small>เบราว์เซอร์ไม่สามารถเก็บไฟล์ต้นฉบับข้ามการปิดหน้าเว็บได้</small></div>`;
    const activeId = state.data.activeClipId && clipFiles.has(state.data.activeClipId) ? state.data.activeClipId : available.id;
    state.data.activeClipId = activeId;
    const active = selectedClips.find((clip) => clip.id === activeId) || available;
    if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = URL.createObjectURL(clipFiles.get(active.id));
    const cards = selectedClips.map((clip, index) => `<article class="timeline-clip ${clip.id === active.id ? "active" : ""}">
      <button class="timeline-select" type="button" data-preview-clip="${clip.id}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(clip.name)}</b><small>${formatTime((clip.end ?? clip.duration) - (clip.start || 0))}</small></button>
      <div class="timeline-move"><button type="button" data-move-clip="${clip.id}" data-direction="-1" ${index === 0 ? "disabled" : ""}>‹</button><button type="button" data-move-clip="${clip.id}" data-direction="1" ${index === selectedClips.length - 1 ? "disabled" : ""}>›</button></div>
    </article>`).join("");
    return `<div class="editor-grid">
      <div class="preview-stage"><video id="timelinePreview" src="${activePreviewUrl}" controls playsinline preload="metadata"></video><small>${escapeHtml(active.name)}</small></div>
      <aside class="trim-panel"><small>คลิปที่เลือก</small><h3>${escapeHtml(active.name)}</h3>
        <label>เริ่มต้น (วินาที)<input id="trimStart" type="number" min="0" max="${Math.max(0, active.duration - .1)}" step="0.1" value="${active.start || 0}"></label>
        <label>สิ้นสุด (วินาที)<input id="trimEnd" type="number" min="0.1" max="${active.duration}" step="0.1" value="${active.end ?? active.duration}"></label>
        <div class="trim-result">ใช้ช่วง ${formatTime(active.start || 0)}–${formatTime(active.end ?? active.duration)}</div>
      </aside>
      <div class="timeline-head"><span><b>Timeline</b><small>${selectedClips.length} คลิป · ${formatTime(timelineDuration())}</small></span><small>ใช้ปุ่มซ้าย–ขวาเพื่อเรียงลำดับ</small></div>
      <div class="timeline-track">${cards}</div>
    </div>`;
  }
  function syncClipState() {
    state.data.clipCount = selectedClips.length;
    state.data.clipMeta = selectedClips.slice(0, 500).map(({ id, name, size, type, duration, start, end, status }) => ({ id, name, size, type, duration, start, end, status }));
  }
  async function readClipMetadata(clips, concurrency = 3) {
    let cursor = 0;
    async function worker() {
      while (cursor < clips.length) {
        const clip = clips[cursor++];
        const file = clipFiles.get(clip.id);
        if (!file) continue;
        await new Promise((resolve) => {
          const video = document.createElement("video");
          const url = URL.createObjectURL(file);
          video.preload = "metadata";
          const finish = (status) => {
            clip.duration = status === "ready" && Number.isFinite(video.duration) ? video.duration : 0;
            clip.start = 0;
            clip.end = clip.duration;
            clip.status = status;
            video.removeAttribute("src");
            URL.revokeObjectURL(url);
            resolve();
          };
          video.onloadedmetadata = () => finish("ready");
          video.onerror = () => finish("error");
          video.src = url;
        });
        syncClipState();
        const list = $("#clipList");
        if (list) list.innerHTML = renderClipList();
        const count = $("#clipCount");
        if (count) count.textContent = `${selectedClips.length} คลิป · อ่านข้อมูลแล้ว ${selectedClips.filter((item) => item.status !== "reading").length}/${selectedClips.length}`;
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, clips.length) }, worker));
    syncClipState();
    save();
  }
  function render() {
    const config = modeConfig[state.mode];
    $("#workspaceLabel").textContent = config.label;
    $("#workspaceTitle").textContent = state.name || config.title;
    $("#stepper").innerHTML = config.steps.map((label, index) => `<div class="step ${index === state.step ? "active" : index < state.step ? "done" : ""}"><i>${index < state.step ? "✓" : index + 1}</i><span>${label}</span></div>`).join("");
    $("#stepPanel").innerHTML = panels[state.mode][state.step]();
    $("#prevStep").disabled = state.step === 0;
    $("#nextStep").textContent = state.step === config.steps.length - 1
      ? state.mode === "generate" ? "บันทึกไว้ในโครงการของฉัน" : "บันทึกโครงการ"
      : "ถัดไป";
    bindPanel();
  }
  function bindPanel() {
    $("#stepPanel").querySelectorAll("[data-key]").forEach((control) => {
      control.addEventListener("change", () => {
        const key = control.dataset.key;
        state.data[key] = control.value;
        if (key === "name") state.name = control.value;
        save();
      });
      control.addEventListener("input", () => {
        const key = control.dataset.key;
        state.data[key] = control.value;
        if (key === "name") {
          state.name = control.value;
          $("#workspaceTitle").textContent = control.value || modeConfig[state.mode].title;
        }
        save();
      });
    });
    $("#clipInput")?.addEventListener("change", (event) => {
      if (activePreviewUrl) { URL.revokeObjectURL(activePreviewUrl); activePreviewUrl = ""; }
      clipFiles.clear();
      selectedClips = Array.from(event.target.files, (file, index) => {
        const id = `${file.name}:${file.size}:${file.lastModified}:${index}`;
        clipFiles.set(id, file);
        return { id, name: file.name, size: file.size, type: file.type, duration: 0, start: 0, end: 0, status: "reading" };
      });
      syncClipState();
      $("#clipCount").textContent = `${selectedClips.length} คลิปที่เลือก · ${formatBytes(selectedClips.reduce((total, clip) => total + clip.size, 0))} รวม`;
      $("#clipList").innerHTML = renderClipList();
      save();
      readClipMetadata(selectedClips);
    });
    $("#clearClips")?.addEventListener("click", () => {
      selectedClips = [];
      clipFiles.clear();
      state.data.clipCount = 0;
      state.data.clipMeta = [];
      $("#clipCount").textContent = "0 คลิปในโครงการ · ไฟล์ยังอยู่ในเครื่องของคุณ";
      $("#clipList").innerHTML = renderClipList();
      const input = $("#clipInput");
      if (input) input.value = "";
      save();
    });
    $("#stepPanel").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-clip]");
      if (remove) {
        const id = remove.dataset.removeClip;
        clipFiles.delete(id);
        selectedClips = selectedClips.filter((clip) => clip.id !== id);
        syncClipState();
        save();
        render();
        return;
      }
      const previewButton = event.target.closest("[data-preview-clip]");
      if (previewButton) {
        state.data.activeClipId = previewButton.dataset.previewClip;
        if (state.step === 4) render();
        return;
      }
      const move = event.target.closest("[data-move-clip]");
      if (move) {
        const index = selectedClips.findIndex((clip) => clip.id === move.dataset.moveClip);
        const target = index + Number(move.dataset.direction);
        if (index < 0 || target < 0 || target >= selectedClips.length) return;
        [selectedClips[index], selectedClips[target]] = [selectedClips[target], selectedClips[index]];
        syncClipState();
        save();
        render();
      }
    });
    const active = selectedClips.find((clip) => clip.id === state.data.activeClipId);
    const preview = $("#timelinePreview");
    const updateTrim = () => {
      if (!active) return;
      const start = Math.max(0, Math.min(Number($("#trimStart")?.value) || 0, active.duration));
      const end = Math.max(start + .1, Math.min(Number($("#trimEnd")?.value) || active.duration, active.duration));
      active.start = start;
      active.end = end;
      if (preview) preview.currentTime = start;
      syncClipState();
      save();
      render();
    };
    $("#trimStart")?.addEventListener("change", updateTrim);
    $("#trimEnd")?.addEventListener("change", updateTrim);
    $("#downloadEditPlan")?.addEventListener("click", downloadEditPlan);
  }
  function downloadEditPlan() {
    syncClipState();
    const plan = {
      format: "tanjai-edit-plan",
      version: "0.4.3",
      projectId: state.id,
      projectName: state.name || "โครงการไม่มีชื่อ",
      aspect: state.data.aspect || "16:9 แนวนอน",
      style: state.data.style || "ข่าว / งานกิจกรรม",
      totalDurationSeconds: timelineDuration(),
      clips: state.data.clipMeta,
      createdAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(state.name || "tanjai-video-project").replace(/[\\/:*?"<>|]+/g, "-")}-edit-plan.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.TanjaiVideoBridge = {
    getRenderContext() {
      return {
        projectId: state.id,
        projectName: state.name || "tanjai-video",
        aspect: state.data.aspect || "16:9 แนวนอน",
        clips: selectedClips.map((clip) => ({ ...clip, file: clipFiles.get(clip.id) })).filter((clip) => clip.file),
      };
    },
  };
  async function loadHandoffMedia() {
    if (state.source === "direct" || !state.id) return;
    const mediaStore = window.TanjaiVideoMediaStore;
    if (!mediaStore) {
      $("#handoffText").textContent = "เปิดคลังคลิปร่วมไม่ได้ กรุณารีเฟรชหน้าเว็บ";
      return;
    }
    $("#handoffText").textContent = "กำลังรับคลิปที่ปรับแล้วจากทันใจ AI Studio…";
    try {
      const [project, records] = await Promise.all([
        mediaStore.getProject(state.id),
        mediaStore.getClips(state.id),
      ]);
      if (!records.length) {
        $("#handoffText").textContent = `พบแผนงาน ${state.data.clipCount || 0} คลิป แต่ยังไม่พบไฟล์ กรุณากลับไปกด “ตัดต่อวิดีโอต่อ” อีกครั้ง`;
        return;
      }
      if (activePreviewUrl) {
        URL.revokeObjectURL(activePreviewUrl);
        activePreviewUrl = "";
      }
      selectedClips = [];
      clipFiles.clear();
      records.forEach((record, index) => {
        const id = `handoff:${record.key || `${state.id}:${index}`}`;
        const file = new File([record.blob], record.name || `clip-${index + 1}.mp4`, {
          type: record.type || record.blob?.type || "video/mp4",
          lastModified: record.lastModified || Date.now(),
        });
        clipFiles.set(id, file);
        const duration = Math.max(0, Number(record.duration) || 0);
        selectedClips.push({
          id,
          name:file.name,
          sourceName:record.sourceName || file.name,
          size:file.size,
          type:file.type,
          duration,
          width:Number(record.width) || 0,
          height:Number(record.height) || 0,
          start:0,
          end:duration,
          status:"ready",
          fromHandoff:true,
          fallback:!!record.fallback,
        });
      });
      state.name = state.name || project?.destinationName || "โครงการจากทันใจ";
      state.data.handoff = project || state.data.handoff;
      state.data.clipCount = selectedClips.length;
      state.data.activeClipId = selectedClips[0]?.id || null;
      state.data.handoffLoaded = true;
      syncClipState();
      state.step = 1;
      save();
      render();
      $("#handoffText").textContent = `รับคลิปที่ปรับแล้ว ${selectedClips.length} คลิปเรียบร้อย · ไม่ต้องอัปโหลดซ้ำ`;
    } catch (error) {
      console.error(error);
      $("#handoffText").textContent = "อ่านคลิปจากคลังร่วมไม่สำเร็จ กรุณากลับไปส่งคลิปอีกครั้ง";
    }
  }
  function setActiveNav(target) {
    document.querySelectorAll(".sidebar .nav-item").forEach((item) => {
      const isActive = target === "home"
        ? item.hasAttribute("data-home")
        : target === "projects"
          ? item.id === "openProjectsSide"
          : item.dataset.mode === target;
      item.classList.toggle("active", isActive);
      if (item.matches("button")) item.setAttribute("aria-current", isActive ? "page" : "false");
    });
  }
  function openMode(mode) {
    state.mode = mode;
    state.step = 0;
    $("#workspace").hidden = false;
    setActiveNav(mode);
    render();
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    closeSidebar();
  }
  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#sidebarBackdrop").classList.remove("show");
    $("#mobileMenu").setAttribute("aria-expanded", "false");
  }
  function save() {
    if (!state.mode) return;
    state.updatedAt = Date.now();
    const projects = readProjects().filter((item) => item.id !== state.id);
    projects.unshift(JSON.parse(JSON.stringify(state)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 20)));
    $("#saveState").textContent = `บันทึกร่างแล้ว ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  }
  function readProjects() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function renderProjects() {
    const items = readProjects();
    $("#projectList").innerHTML = items.length ? items.map((item) => `<button class="project-item ghost" type="button" data-project="${item.id}"><span><b>${escapeHtml(item.name || modeConfig[item.mode]?.title || "โครงการไม่มีชื่อ")}</b><small>${escapeHtml(modeConfig[item.mode]?.label || "")}</small></span><small>${new Date(item.updatedAt).toLocaleString("th-TH")}</small></button>`).join("") : `<div class="empty-projects">ยังไม่มีโครงการที่บันทึกไว้</div>`;
    $("#projectList").querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", async () => {
      const item = items.find((project) => project.id === button.dataset.project);
      Object.assign(state, item);
      selectedClips = [];
      clipFiles.clear();
      $("#projectDialog").close();
      $("#workspace").hidden = false;
      setActiveNav(state.mode);
      render();
      $("#workspace").scrollIntoView({ behavior: "smooth" });
      if (state.source !== "direct" || state.data?.handoffLoaded) {
        await loadHandoffMedia();
      }
    }));
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => openMode(button.dataset.mode)));
  document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", () => {
    $("#workspace").hidden = true;
    setActiveNav("home");
    $("#home").scrollIntoView({ behavior: "smooth", block: "start" });
    closeSidebar();
  }));
  $("#closeWorkspace").addEventListener("click", () => { $("#workspace").hidden = true; setActiveNav("home"); scrollTo({ top: 0, behavior: "smooth" }); });
  $("#prevStep").addEventListener("click", () => { if (state.step > 0) { state.step -= 1; render(); } });
  $("#nextStep").addEventListener("click", () => {
    const last = modeConfig[state.mode].steps.length - 1;
    if (state.step < last) {
      state.step += 1;
      save();
      render();
    } else {
      save();
      if (state.mode === "generate") {
        setActiveNav("projects");
        renderProjects();
        $("#projectDialog").showModal();
      } else {
        $("#nextStep").textContent = "บันทึกเรียบร้อย ✓";
      }
    }
  });
  $("#openProjects").addEventListener("click", () => { setActiveNav("projects"); renderProjects(); $("#projectDialog").showModal(); });
  $("#openProjectsSide").addEventListener("click", () => { setActiveNav("projects"); renderProjects(); $("#projectDialog").showModal(); closeSidebar(); });
  $("#closeProjects").addEventListener("click", () => { $("#projectDialog").close(); setActiveNav($("#workspace").hidden ? "home" : state.mode); });
  $("#projectDialog").addEventListener("close", () => setActiveNav($("#workspace").hidden ? "home" : state.mode));
  $("#clearHandoff").addEventListener("click", () => { history.replaceState({}, "", location.pathname); $("#handoffBanner").hidden = true; });
  $("#mobileMenu").addEventListener("click", () => {
    const open = !$("#sidebar").classList.contains("open");
    $("#sidebar").classList.toggle("open", open);
    $("#sidebarBackdrop").classList.toggle("show", open);
    $("#mobileMenu").setAttribute("aria-expanded", String(open));
  });
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });
  window.addEventListener("beforeunload", () => { if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl); });

  if (state.source !== "direct" || new URLSearchParams(location.search).has("projectId")) {
    $("#handoffBanner").hidden = false;
    $("#handoffText").textContent = `รหัสงาน ${state.id.slice(0, 12)} · ${state.data.clipCount || 0} คลิป · พร้อมเลือกโหมดทำงานต่อ`;
    openMode("footage");
    loadHandoffMedia();
  }
})();

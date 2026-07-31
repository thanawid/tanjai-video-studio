(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const STORAGE_KEY = "tanjai-video-studio-projects-v1";
  const modeConfig = {
    footage: {
      label: "ตัดต่อจากคลิปที่มี",
      steps: ["ตั้งค่าโครงการ", "เพิ่มคลิป", "เลือกแนว", "AI วางเรื่อง", "ตรวจ Timeline", "ส่งออก"],
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
      () => summary("แผนงานที่ AI จะจัดให้", [
        ["วิเคราะห์คลิป", `${state.data.clipCount || 0} คลิป`],
        ["แนวที่เลือก", state.data.style || "ข่าว / งานกิจกรรม"],
        ["ขั้นตอน", "คัดช็อต → แบ่งหมวด → วางโครงเรื่อง"],
        ["สถานะ", "ต้นแบบ — ยังไม่เรียก AI จริง"],
      ], "ระบบจริงจะทำงานผ่านคิวและ Proxy Preview เพื่อรองรับฟุตเทจ 200+ คลิป"),
      () => summary("Timeline ฉบับร่าง", [
        ["ช่วงเปิด", "ช็อตเด่น + ชื่อโครงการ"],
        ["เนื้อหา", "ลำดับเหตุการณ์และบุคคลสำคัญ"],
        ["ช่วงจบ", "ภาพรวม + โลโก้หน่วยงาน"],
        ["การตรวจ", "ผู้ใช้แก้ลำดับและความยาวได้ทุกช็อต"],
      ], "หน้าตัดต่อเต็มรูปแบบจะพัฒนาในขั้นระบบจริง โดยไม่โหลดวิดีโอทุกคลิปเข้าหน่วยความจำพร้อมกัน"),
      () => summary("พร้อมส่งออก", [
        ["วิดีโอ", "MP4 H.264"],
        ["ไฟล์ประกอบ", "SRT · Shot List · Edit Plan"],
        ["ปลายทาง", "ดาวน์โหลด หรือบันทึกกลับโครงการ"],
        ["สถานะ", "ต้องเชื่อม FFmpeg Worker ก่อนส่งออกจริง"],
      ], "ต้นแบบนี้บันทึกแผนโครงการเท่านั้น"),
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
  function renderClipList() {
    if (!selectedClips.length) return `<div class="clip-more">ยังไม่มีคลิปในรายการ</div>`;
    const visible = selectedClips.slice(0, 30);
    return visible.map((clip, index) => `<div class="clip-row"><i>${String(index + 1).padStart(2, "0")}</i><span><b title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</b><small>${formatBytes(clip.size)} · รอวิเคราะห์</small></span><small>พร้อม</small></div>`).join("") +
      (selectedClips.length > visible.length ? `<div class="clip-more">และอีก ${selectedClips.length - visible.length} คลิป · เก็บไว้ในคิวโดยไม่สร้าง Preview พร้อมกัน</div>` : "");
  }
  function render() {
    const config = modeConfig[state.mode];
    $("#workspaceLabel").textContent = config.label;
    $("#workspaceTitle").textContent = state.name || config.title;
    $("#stepper").innerHTML = config.steps.map((label, index) => `<div class="step ${index === state.step ? "active" : index < state.step ? "done" : ""}"><i>${index < state.step ? "✓" : index + 1}</i><span>${label}</span></div>`).join("");
    $("#stepPanel").innerHTML = panels[state.mode][state.step]();
    $("#prevStep").disabled = state.step === 0;
    $("#nextStep").innerHTML = state.step === config.steps.length - 1 ? "บันทึกโครงการ ✓" : "ถัดไป";
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
      selectedClips = Array.from(event.target.files, (file) => ({ name: file.name, size: file.size, type: file.type }));
      state.data.clipCount = selectedClips.length;
      state.data.clipMeta = selectedClips.slice(0, 200).map(({ name, size, type }) => ({ name, size, type }));
      $("#clipCount").textContent = `${selectedClips.length} คลิปที่เลือก · ${formatBytes(selectedClips.reduce((total, clip) => total + clip.size, 0))} รวม`;
      $("#clipList").innerHTML = renderClipList();
      save();
    });
    $("#clearClips")?.addEventListener("click", () => {
      selectedClips = [];
      state.data.clipCount = 0;
      state.data.clipMeta = [];
      $("#clipCount").textContent = "0 คลิปในโครงการ · ไฟล์ยังอยู่ในเครื่องของคุณ";
      $("#clipList").innerHTML = renderClipList();
      const input = $("#clipInput");
      if (input) input.value = "";
      save();
    });
  }
  function openMode(mode) {
    state.mode = mode;
    state.step = 0;
    $("#workspace").hidden = false;
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
    $("#projectList").querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => {
      const item = items.find((project) => project.id === button.dataset.project);
      Object.assign(state, item);
      $("#projectDialog").close();
      $("#workspace").hidden = false;
      render();
      $("#workspace").scrollIntoView({ behavior: "smooth" });
    }));
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => openMode(button.dataset.mode)));
  document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", () => {
    $("#workspace").hidden = true;
    $("#home").scrollIntoView({ behavior: "smooth", block: "start" });
    closeSidebar();
  }));
  $("#closeWorkspace").addEventListener("click", () => { $("#workspace").hidden = true; scrollTo({ top: 0, behavior: "smooth" }); });
  $("#prevStep").addEventListener("click", () => { if (state.step > 0) { state.step -= 1; render(); } });
  $("#nextStep").addEventListener("click", () => {
    const last = modeConfig[state.mode].steps.length - 1;
    if (state.step < last) { state.step += 1; save(); render(); } else { save(); $("#nextStep").textContent = "บันทึกเรียบร้อย ✓"; }
  });
  $("#openProjects").addEventListener("click", () => { renderProjects(); $("#projectDialog").showModal(); });
  $("#openProjectsSide").addEventListener("click", () => { renderProjects(); $("#projectDialog").showModal(); closeSidebar(); });
  $("#closeProjects").addEventListener("click", () => $("#projectDialog").close());
  $("#clearHandoff").addEventListener("click", () => { history.replaceState({}, "", location.pathname); $("#handoffBanner").hidden = true; });
  $("#mobileMenu").addEventListener("click", () => {
    const open = !$("#sidebar").classList.contains("open");
    $("#sidebar").classList.toggle("open", open);
    $("#sidebarBackdrop").classList.toggle("show", open);
    $("#mobileMenu").setAttribute("aria-expanded", String(open));
  });
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });

  if (state.source !== "direct" || new URLSearchParams(location.search).has("projectId")) {
    $("#handoffBanner").hidden = false;
    $("#handoffText").textContent = `รหัสงาน ${state.id.slice(0, 12)} · ${state.data.clipCount || 0} คลิป · พร้อมเลือกโหมดทำงานต่อ`;
    openMode("footage");
  }
})();

(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const STORAGE_KEY = "tanjai-ai-video-projects-v3";
  const steps = ["ตั้งค่างาน", "เล่าเรื่อง", "เลือกบรรยากาศ", "ตรวจฉาก", "เลือกวิธีสร้าง", "รับวิดีโอ"];
  const state = {
    id: crypto.randomUUID(), step: 0, name: "", updatedAt: Date.now(),
    data: { genre: "ประชาสัมพันธ์", aspect: "16:9 แนวนอน", duration: "30 วินาที", language: "ภาษาไทย", visual: "ให้ทันใจแนะนำ", movement: "ให้ทันใจแนะนำ", scenes: [], method: "preview" }
  };
  let serviceReady = false;

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const readProjects = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
  function save() {
    state.updatedAt = Date.now();
    const projects = readProjects().filter((item) => item.id !== state.id);
    projects.unshift(structuredClone(state));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 30)));
    $("#saveState").textContent = `บันทึกร่างแล้ว ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const fields = (content) => `<div class="form-grid">${content}</div>`;
  function choices(key, items) {
    const selected = state.data[key] || items[0][0];
    return `<div class="choice-grid">${items.map(([title, detail, icon]) => `<label class="choice"><input type="radio" name="${key}" data-key="${key}" value="${title}" ${selected === title ? "checked" : ""}><i>${icon}</i><b>${title}</b><span>${detail}</span></label>`).join("")}</div>`;
  }
  function showMessage(message, type = "error") {
    const box = $("#storyboardStatus") || $("#apiResult");
    if (box) { box.hidden = false; box.className = `api-result ${type}`; box.textContent = message; }
  }
  async function requestJson(path, options) {
    const response = await fetch(path, options);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) throw new Error("ระบบตอบกลับไม่ครบ กรุณาลองใหม่หลังระบบออนไลน์แล้ว");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "ยังทำรายการไม่สำเร็จ");
    return result;
  }
  async function checkService() {
    try {
      const health = await requestJson("/api/health");
      serviceReady = Boolean(health.ready);
      document.querySelectorAll("[data-start]").forEach((button) => { button.disabled = !serviceReady; });
      const note = $(".system-note small");
      if (note) note.textContent = serviceReady ? "ระบบสร้างวิดีโอพร้อมใช้งาน" : "ระบบสร้างวิดีโอยังไม่พร้อม";
      return serviceReady;
    } catch {
      serviceReady = false;
      document.querySelectorAll("[data-start]").forEach((button) => { button.disabled = true; });
      const note = $(".system-note small");
      if (note) note.textContent = "กำลังรอระบบออนไลน์";
      return false;
    }
  }
  async function buildStoryboard() {
    if (!state.data.topic?.trim()) return showMessage("กรุณาเล่าเรื่องที่ต้องการทำก่อนครับ");
    const button = $("#buildStoryboard");
    if (button) { button.disabled = true; button.textContent = "กำลังวางฉาก…"; }
    showMessage("กำลังแบ่งเรื่องเป็นฉากที่ต่อเนื่องกัน", "loading");
    try {
      const result = await requestJson("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.name, ...state.data }) });
      state.name ||= result.projectTitle;
      state.data.summary = result.summary;
      state.data.scenes = result.scenes.map((scene, index) => ({ ...scene, id: crypto.randomUUID(), order: index + 1 }));
      save(); render();
    } catch (error) { if (button) { button.disabled = false; button.textContent = "ให้ทันใจวางฉาก"; } showMessage(error.message); }
  }
  function projectPayload() { return { format: "tanjai-video-prompt-pack", version: "0.7.1", projectId: state.id, projectName: state.name, ...state.data, updatedAt: new Date(state.updatedAt).toISOString() }; }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(projectPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${(state.name || "tanjai-video").replace(/[\\/:*?"<>|]+/g, "-")}-prompts.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function storyboardPanel() {
    if (!state.data.scenes.length) return `<div class="empty-storyboard"><span>🎬</span><h3>พร้อมช่วยวางฉาก</h3><p>ทันใจจะเรียบเรียงเรื่องเป็นฉาก กำหนดภาพ การเคลื่อนไหว และเสียงพากย์ให้ตรวจแก้ได้</p><button class="primary" id="buildStoryboard" type="button">ให้ทันใจวางฉาก</button><div class="api-result" id="storyboardStatus" hidden></div></div>`;
    return `<div class="storyboard-head"><div><h3>${state.data.scenes.length} ฉาก พร้อมตรวจ</h3><small>แก้ภาพ การเคลื่อนไหว และเสียงพากย์ได้ก่อนสร้างจริง</small></div><button class="ghost compact" id="buildStoryboard" type="button">วางฉากใหม่</button></div><div class="api-result" id="storyboardStatus" hidden></div><div class="storyboard-grid">${state.data.scenes.map((scene, index) => `<article class="scene-card"><div class="scene-number">${String(index + 1).padStart(2, "0")}<small>${scene.duration} วิ</small></div><div class="scene-body"><label>ภาพในฉาก<input data-scene="${scene.id}" data-scene-key="visual" value="${escapeHtml(scene.visual)}"></label><label>การเคลื่อนไหว<input data-scene="${scene.id}" data-scene-key="motion" value="${escapeHtml(scene.motion)}"></label><label>เสียงพากย์<textarea data-scene="${scene.id}" data-scene-key="narration">${escapeHtml(scene.narration)}</textarea></label><label>Prompt สำหรับสร้างคลิป<textarea data-scene="${scene.id}" data-scene-key="prompt">${escapeHtml(scene.prompt)}</textarea></label></div></article>`).join("")}</div>`;
  }
  function methodPanel() {
    const method = state.data.method || "preview";
    const count = state.data.scenes.length;
    return `<div class="method-intro"><h3>อยากเริ่มสร้างแบบไหน?</h3><p>ทดลองหนึ่งฉากก่อนเพื่อดูแนวงาน หรือสร้างครบทุกฉากเมื่อพร้อม</p></div><div class="choice-grid method-grid"><label class="choice"><input type="radio" name="method" data-key="method" value="preview" ${method === "preview" ? "checked" : ""}><i>🧪</i><b>ทดลอง 1 ฉาก</b><span>วิดีโอเคลื่อนไหวจริงประมาณ 8 วินาที · ราว $0.80</span></label><label class="choice"><input type="radio" name="method" data-key="method" value="full" ${method === "full" ? "checked" : ""}><i>🎬</i><b>สร้างครบ ${count || 0} ฉาก</b><span>รวมเป็น MP4 เดียว · ราว $${(Math.max(count, 1) * 0.8).toFixed(2)}</span></label><label class="choice"><input type="radio" name="method" data-key="method" value="prompt" ${method === "prompt" ? "checked" : ""}><i>📦</i><b>รับชุด Prompt</b><span>นำไปสร้างต่อด้วยเครื่องมืออื่น โดยยังไม่เสียค่าสร้างคลิป</span></label></div><div class="method-note">ค่าใช้จ่ายเป็นการประมาณจากคลิปละ 8 วินาที ค่าใช้จริงขึ้นอยู่กับผู้ให้บริการ</div>`;
  }
  function productionPanel() {
    const method = state.data.method || "preview";
    const promptOnly = method === "prompt";
    const scenes = method === "preview" ? Math.min(1, state.data.scenes.length) : state.data.scenes.length;
    return `<div class="production-summary"><h3>${promptOnly ? "ชุด Prompt พร้อมดาวน์โหลด" : "พร้อมสร้างคลิปเคลื่อนไหว"}</h3><div class="summary-list"><div><small>ชื่อโครงการ</small><b>${escapeHtml(state.name || "ยังไม่ได้ตั้งชื่อ")}</b></div><div><small>รูปแบบ</small><b>${escapeHtml(state.data.genre)} · ${escapeHtml(state.data.aspect)}</b></div><div><small>จำนวนฉาก</small><b>${scenes} ฉาก</b></div><div><small>สิ่งที่จะได้รับ</small><b>${promptOnly ? "แผนเรื่องและ Prompt" : "วิดีโอ MP4 พร้อมเสียงพากย์"}</b></div></div><p>${promptOnly ? "เก็บแผนทั้งหมดไปใช้กับเครื่องมือที่คุณถนัดได้" : "ระบบจะสร้างการเคลื่อนไหวจริงทีละฉาก งานนี้อาจใช้เวลาหลายนาทีและมีค่าใช้จ่ายตามจำนวนฉาก"}</p></div><div class="production-actions"><button class="ghost" id="downloadProject" type="button">ดาวน์โหลดชุด Prompt</button>${promptOnly ? "" : `<button class="primary" id="startProduction" type="button" ${state.data.scenes.length ? "" : "disabled"}>${method === "preview" ? "ทดลองสร้าง 1 ฉาก" : "สร้างวิดีโอทั้งหมด"}</button>`}</div><div class="api-result" id="apiResult" hidden></div><div id="videoResult"></div>`;
  }
  const panels = [
    () => fields(`<div class="field full"><label>ชื่อโครงการ</label><input data-key="name" value="${escapeHtml(state.name)}" placeholder="เช่น เชิญชวนร่วมกิจกรรมออกกำลังกาย"></div><div class="field"><label>ประเภทงาน</label><select data-key="genre"><option>ประชาสัมพันธ์</option><option>ข่าว / สรุปกิจกรรม</option><option>MV / เพลง</option><option>นิทาน</option><option>หนังสั้น</option><option>โฆษณา</option><option>สารคดี</option><option>ท่องเที่ยว</option><option>กำหนดเอง</option></select></div><div class="field"><label>สัดส่วนภาพ</label><select data-key="aspect"><option>16:9 แนวนอน</option><option>9:16 แนวตั้ง</option><option>1:1 จัตุรัส</option><option>4:5 โพสต์โซเชียล</option></select></div><div class="field"><label>ความยาวเป้าหมาย</label><select data-key="duration"><option>30 วินาที</option><option>60 วินาที</option><option>90 วินาที</option></select></div><div class="field"><label>ภาษา</label><select data-key="language"><option>ภาษาไทย</option><option>ภาษาอังกฤษ</option><option>ไม่มีเสียงพากย์</option></select></div>`),
    () => fields(`<div class="field full"><label>เรื่องที่อยากเล่า</label><textarea data-key="topic" placeholder="ใคร ทำอะไร ที่ไหน และอยากให้คนดูรู้สึกอย่างไร">${escapeHtml(state.data.topic || "")}</textarea></div><div class="field full"><label>ข้อมูลที่ต้องใช้ตามจริง</label><textarea data-key="facts" placeholder="ชื่อ วันเวลา สถานที่ หน่วยงาน หรือตัวเลขที่ห้ามเปลี่ยน">${escapeHtml(state.data.facts || "")}</textarea></div><div class="field"><label>คนที่อยากให้ดู</label><input data-key="audience" value="${escapeHtml(state.data.audience || "")}" placeholder="เช่น ประชาชนทั่วไป"></div><div class="field"><label>น้ำเสียง</label><select data-key="tone"><option>สุภาพ ชัดเจน</option><option>อบอุ่น เป็นกันเอง</option><option>สนุก กระชับ</option><option>มีอารมณ์แบบภาพยนตร์</option><option>กำหนดเอง</option></select></div><div class="person-note full">หากเรื่องมีบุคคลจริง ระบบจะไม่สร้างใบหน้าปลอมแทนบุคคลนั้น แต่จะใช้ภาพกิจกรรม สถานที่ หรือภาพสื่อความหมาย พร้อมกล่าวชื่อในเสียงพากย์</div>`),
    () => `<div class="style-intro"><h3>เลือกบรรยากาศเริ่มต้น</h3><p>นี่เป็นเพียงทางลัด คุณผสมแนวและบอกเพิ่มเติมได้</p></div>${choices("visual", [["ให้ทันใจแนะนำ","เลือกแนวที่เหมาะกับเรื่อง","✨"],["ภาพยนตร์สมจริง","แสงและมิติแบบภาพยนตร์","🎥"],["ข่าวและประชาสัมพันธ์","สะอาด สุภาพ น่าเชื่อถือ","📺"],["อบอุ่น","เป็นธรรมชาติ เป็นกันเอง","🌤️"],["สดใส","มีพลัง สีสันชัด","☀️"],["อนิเมะ","เลือกได้ทั้งน่ารักและภาพยนตร์","🌸"],["แฟนตาซี","โลกเหนือจริงและจินตนาการ","🪄"],["กำหนดเอง","บอกแนวของคุณได้เต็มที่","⚙️"]])}${fields(`<div class="field"><label>จังหวะการเคลื่อนไหว</label><select data-key="movement"><option>ให้ทันใจแนะนำ</option><option>นุ่มนวล</option><option>กระชับ</option><option>มีพลัง</option><option>สงบ</option></select></div><div class="field"><label>บอกสไตล์เพิ่มเติม</label><input data-key="customStyle" value="${escapeHtml(state.data.customStyle || "")}" placeholder="เช่น อบอุ่นแต่จังหวะสนุก"></div>`)}`,
    storyboardPanel, methodPanel, productionPanel
  ];

  function render() {
    $("#stepper").innerHTML = steps.map((label, index) => `<div class="step ${index === state.step ? "active" : index < state.step ? "done" : ""}"><i>${index < state.step ? "✓" : index + 1}</i><span>${label}</span></div>`).join("");
    $("#stepPanel").innerHTML = panels[state.step]();
    $("#workspaceTitle").textContent = state.name || "สร้างวิดีโอใหม่";
    $("#prevStep").disabled = state.step === 0;
    $("#nextStep").hidden = state.step === steps.length - 1;
    $("#nextStep").disabled = state.step === 3 && !state.data.scenes.length;
    $("#stepPanel").querySelectorAll("[data-key]").forEach((control) => { const key = control.dataset.key; const value = key === "name" ? state.name : state.data[key]; if (value && control.tagName === "SELECT") control.value = value; });
    bindPanel(); setActiveNav("start");
  }
  function bindPanel() {
    $("#stepPanel").querySelectorAll("[data-key]").forEach((control) => {
      const apply = () => { const key = control.dataset.key; if (key === "name") state.name = control.value; else state.data[key] = control.value; save(); if (control.type === "radio" && state.step === 4) render(); };
      control.addEventListener("change", apply); if (control.type !== "radio") control.addEventListener("input", apply);
    });
    $("#stepPanel").querySelectorAll("[data-scene]").forEach((control) => control.addEventListener("input", () => { const scene = state.data.scenes.find((item) => item.id === control.dataset.scene); if (scene) scene[control.dataset.sceneKey] = control.value; save(); }));
    $("#buildStoryboard")?.addEventListener("click", buildStoryboard);
    $("#startProduction")?.addEventListener("click", startProduction);
    $("#downloadProject")?.addEventListener("click", downloadJson);
  }
  async function startProduction() {
    const box = $("#apiResult"); const button = $("#startProduction"); if (!box || !button) return;
    box.hidden = false; box.className = "api-result loading"; box.textContent = "กำลังเตรียมงาน กรุณาเปิดหน้านี้ไว้…";
    button.disabled = true; button.textContent = "กำลังเริ่มสร้าง…";
    try {
      const result = await requestJson("/api/produce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.name, ...state.data, scope: state.data.method }) });
      pollJob(result.jobId);
    } catch (error) { box.className = "api-result error"; box.textContent = error.message; button.disabled = false; button.textContent = "ลองอีกครั้ง"; }
  }
  async function pollJob(jobId) {
    const box = $("#apiResult"); const button = $("#startProduction");
    try {
      const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
      box.className = `api-result ${job.status === "failed" ? "error" : job.status === "completed" ? "success" : "loading"}`;
      box.textContent = `${job.message || "กำลังสร้างวิดีโอ"}${job.progress != null ? ` · ${job.progress}%` : ""}`;
      if (job.status === "completed") {
        button.textContent = "สร้างเรียบร้อย";
        $("#videoResult").innerHTML = `<video class="result-video" controls playsinline src="${escapeHtml(job.downloadUrl)}"></video><a class="primary result-download" href="${escapeHtml(job.downloadUrl)}" download>ดาวน์โหลดวิดีโอ MP4</a>`;
        return;
      }
      if (job.status === "failed") { button.disabled = false; button.textContent = "ลองอีกครั้ง"; return; }
      setTimeout(() => pollJob(jobId), 5000);
    } catch (error) { box.className = "api-result error"; box.textContent = error.message; button.disabled = false; button.textContent = "ตรวจสถานะอีกครั้ง"; }
  }
  function setActiveNav(mode) { document.querySelectorAll(".sidebar .nav-item").forEach((item) => item.classList.remove("active")); const target = mode === "start" ? $("[data-start].nav-item") : $(".sidebar a.nav-item"); target?.classList.add("active"); }
  async function openGenerator() {
    if (!serviceReady && !(await checkService())) {
      alert("ระบบสร้างวิดีโอยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่ครับ");
      return;
    }
    $("#workspace").hidden = false; render(); $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" }); closeSidebar();
  }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.remove("show"); $("#mobileMenu").setAttribute("aria-expanded", "false"); }
  function renderProjects() {
    const items = readProjects();
    $("#projectList").innerHTML = items.length ? items.map((item) => `<button class="project-item ghost" type="button" data-project="${item.id}"><span><b>${escapeHtml(item.name || "งานไม่มีชื่อ")}</b><small>${escapeHtml(item.data?.genre || "วิดีโอ")}</small></span><small>${new Date(item.updatedAt).toLocaleString("th-TH")}</small></button>`).join("") : `<div class="empty-projects">ยังไม่มีงานที่บันทึกไว้</div>`;
    $("#projectList").querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => { const item = items.find((project) => project.id === button.dataset.project); Object.assign(state, item); $("#projectDialog").close(); openGenerator(); }));
  }
  document.querySelectorAll("[data-start]").forEach((button) => button.addEventListener("click", openGenerator));
  $("#prevStep").addEventListener("click", () => { if (state.step > 0) { state.step--; render(); } });
  $("#nextStep").addEventListener("click", () => { if (state.step === 3 && !state.data.scenes.length) return showMessage("กรุณาให้ทันใจวางฉากก่อนครับ"); if (state.step < steps.length - 1) { state.step++; save(); render(); } });
  $("#closeWorkspace").addEventListener("click", () => { $("#workspace").hidden = true; setActiveNav("home"); scrollTo({ top: 0, behavior: "smooth" }); });
  ["#openProjects", "#openProjectsHero", "#openProjectsSide"].forEach((id) => $(id).addEventListener("click", () => { renderProjects(); $("#projectDialog").showModal(); closeSidebar(); }));
  $("#closeProjects").addEventListener("click", () => $("#projectDialog").close());
  $("#mobileMenu").addEventListener("click", () => { const open = !$("#sidebar").classList.contains("open"); $("#sidebar").classList.toggle("open", open); $("#sidebarBackdrop").classList.toggle("show", open); $("#mobileMenu").setAttribute("aria-expanded", String(open)); });
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  checkService().then(() => {
    if (new URLSearchParams(location.search).get("source") === "tanjai-ai-studio") openGenerator();
  });
})();

(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const STORAGE_KEY = "tanjai-ai-video-projects-v2";
  const steps = ["ตั้งค่าโครงการ", "ใส่เนื้อหา", "เลือกแนววิดีโอ", "ตรวจและแก้ไขแต่ละฉาก", "เลือกวิธีสร้าง", "ดาวน์โหลด"];
  const state = {
    id: crypto.randomUUID(), step: 0, name: "", updatedAt: Date.now(),
    data: { genre: "ประชาสัมพันธ์", aspect: "16:9 แนวนอน", duration: "60 วินาที", visual: "ภาพยนตร์สมจริง", scenes: [] }
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
  function readProjects() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
  function save() {
    state.updatedAt = Date.now();
    const projects = readProjects().filter((item) => item.id !== state.id);
    projects.unshift(JSON.parse(JSON.stringify(state)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, 30)));
    $("#saveState").textContent = `บันทึกร่างแล้ว ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  }
  function fields(content) { return `<div class="form-grid">${content}</div>`; }
  function choices(key, items) {
    const selected = state.data[key] || items[0][0];
    return `<div class="choice-grid">${items.map(([title, detail, icon]) => `<label class="choice"><input type="radio" name="${key}" data-key="${key}" value="${title}" ${selected === title ? "checked" : ""}><i>${icon}</i><b>${title}</b><span>${detail}</span></label>`).join("")}</div>`;
  }
  function sceneCount() {
    const seconds = parseInt(state.data.duration, 10) || 60;
    return Math.max(4, Math.min(12, Math.round(seconds / 10)));
  }
  async function buildStoryboard() {
    const button = $("#buildStoryboard");
    const box = $("#storyboardStatus");
    if (!state.data.topic?.trim()) {
      if (box) { box.hidden = false; box.className = "api-result error"; box.textContent = "กรุณาใส่เรื่องที่ต้องการเล่าก่อนครับ"; }
      return;
    }
    if (button) { button.disabled = true; button.textContent = "กำลังวางเรื่อง…"; }
    if (box) { box.hidden = false; box.className = "api-result loading"; box.textContent = "กำลังแบ่งเรื่องเป็นฉากที่ต่อเนื่องกัน"; }
    try {
      const response = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.name, ...state.data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ยังวางเรื่องไม่สำเร็จ");
      state.name = state.name || result.projectTitle;
      state.data.summary = result.summary;
      state.data.scenes = result.scenes.map((scene, index) => ({ ...scene, id: crypto.randomUUID(), order: index + 1, status: "ready" }));
      save(); render();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = "ให้ AI วางเรื่องใหม่"; }
      if (box) { box.hidden = false; box.className = "api-result error"; box.textContent = error.message; }
    }
  }
  function projectPayload() {
    return { format: "tanjai-ai-video-project", version: "0.6.1", projectId: state.id, projectName: state.name, ...state.data, updatedAt: new Date(state.updatedAt).toISOString() };
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(projectPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${(state.name || "tanjai-ai-video").replace(/[\\/:*?"<>|]+/g, "-")}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function storyboardPanel() {
    if (!state.data.scenes.length) return `<div class="empty-storyboard"><span>🎬</span><h3>พร้อมช่วยวางเรื่อง</h3><p>AI จะอ่านข้อมูลของคุณ แล้วแบ่งเป็นฉากที่ต่อเนื่องกัน พร้อมเสียงพากย์และ Prompt สำหรับแต่ละฉาก</p><button class="primary" id="buildStoryboard" type="button">ให้ AI วางเรื่อง</button><div class="api-result" id="storyboardStatus" hidden></div></div>`;
    return `<div class="storyboard-head"><div><h3>${state.data.scenes.length} ฉาก พร้อมตรวจ</h3><small>แก้เนื้อหา เสียงพากย์ และ Prompt ได้ก่อนเริ่มสร้าง</small></div><button class="ghost compact" id="buildStoryboard" type="button">ให้ AI วางเรื่องใหม่</button></div><div class="api-result" id="storyboardStatus" hidden></div><div class="storyboard-grid">${state.data.scenes.map((scene, index) => `<article class="scene-card"><div class="scene-number">${String(index + 1).padStart(2, "0")}<small>${scene.duration} วิ</small></div><div class="scene-body"><label>ภาพที่ต้องการ<input data-scene="${scene.id}" data-scene-key="visual" value="${escapeHtml(scene.visual || scene.title)}"></label><label>เสียงพากย์<textarea data-scene="${scene.id}" data-scene-key="narration">${escapeHtml(scene.narration)}</textarea></label><label>Prompt สำหรับสร้างภาพ<textarea data-scene="${scene.id}" data-scene-key="prompt">${escapeHtml(scene.prompt)}</textarea></label></div></article>`).join("")}</div>`;
  }
  function methodPanel() {
    const method = state.data.method || "tanjai";
    return `<div class="method-intro"><h3>อยากนำแผนวิดีโอนี้ไปทำต่อแบบไหน?</h3><p>เลือกดาวน์โหลด Prompt ไปใช้กับเครื่องมือที่คุณถนัด หรือให้ทันใจสร้างตัวอย่างวิดีโอให้เลย</p></div><div class="choice-grid method-grid"><label class="choice"><input type="radio" name="method" data-key="method" value="tanjai" ${method === "tanjai" ? "checked" : ""}><i>✨</i><b>สร้างวิดีโอในทันใจ</b><span>สร้างภาพ เสียงพากย์ และรวมเป็น MP4</span></label><label class="choice"><input type="radio" name="method" data-key="method" value="prompt" ${method === "prompt" ? "checked" : ""}><i>📦</i><b>ดาวน์โหลดชุด Prompt</b><span>นำแผนและ Prompt ไปใช้กับเครื่องมืออื่น</span></label></div><div class="method-note">${method === "tanjai" ? "ทันใจจะสร้างภาพและเสียงพากย์ของแต่ละฉาก แล้วรวมเป็นวิดีโอ MP4" : "ได้ไฟล์แผนเรื่อง เสียงพากย์ และ Prompt แยกทุกฉาก พร้อมนำไปใช้ต่อ"}</div>`;
  }
  function productionPanel() {
    const createHere = (state.data.method || "tanjai") === "tanjai";
    return `<div class="production-summary"><h3>${createHere ? "พร้อมสร้างวิดีโอตัวอย่าง" : "ชุด Prompt พร้อมดาวน์โหลด"}</h3><div class="summary-list"><div><small>ชื่อโครงการ</small><b>${escapeHtml(state.name || "ยังไม่ได้ตั้งชื่อ")}</b></div><div><small>รูปแบบ</small><b>${escapeHtml(state.data.genre)} · ${escapeHtml(state.data.aspect)}</b></div><div><small>จำนวนฉาก</small><b>${state.data.scenes.length} ฉาก</b></div><div><small>สิ่งที่จะได้รับ</small><b>${createHere ? "วิดีโอ MP4 พร้อมเสียงพากย์" : "แผนเรื่องและ Prompt ทุกฉาก"}</b></div></div><p>${createHere ? "การสร้างวิดีโอจริงมีค่าใช้จ่ายตามจำนวนฉาก ระบบจะเริ่มจากภาพคุณภาพทดลองเพื่อควบคุมค่าใช้จ่าย" : "ดาวน์โหลดแล้วนำ Prompt ไปสร้างภาพหรือวิดีโอต่อในเครื่องมืออื่นได้ทันที"}</p></div><div class="production-actions"><button class="ghost" id="downloadProject" type="button">ดาวน์โหลดชุด Prompt</button>${createHere ? `<button class="primary" id="startProduction" type="button" ${state.data.scenes.length ? "" : "disabled"}>สร้างวิดีโอ MP4</button>` : ""}</div><div class="api-result" id="apiResult" hidden></div><div id="videoResult"></div>`;
  }
  const panels = [
    () => fields(`<div class="field full"><label>ชื่อโครงการ</label><input data-key="name" value="${escapeHtml(state.name)}" placeholder="เช่น วิดีโอประชาสัมพันธ์งานแห่เทียนพรรษา"></div><div class="field"><label>ประเภทวิดีโอ</label><select data-key="genre"><option>ประชาสัมพันธ์</option><option>ข่าว / สรุปกิจกรรม</option><option>นิทานเด็ก</option><option>MV เพลง</option><option>หนังสั้น</option><option>โฆษณา</option><option>วิดีโอจากภาพนิ่ง</option><option>กำหนดเอง</option></select></div><div class="field"><label>สัดส่วนภาพ</label><select data-key="aspect"><option>16:9 แนวนอน</option><option>9:16 แนวตั้ง</option><option>1:1 จัตุรัส</option><option>4:5 โพสต์โซเชียล</option></select></div><div class="field"><label>ความยาวเป้าหมาย</label><select data-key="duration"><option>30 วินาที</option><option>60 วินาที</option><option>90 วินาที</option><option>180 วินาที</option></select></div><div class="field"><label>ภาษา</label><select data-key="language"><option>ภาษาไทย</option><option>ภาษาอังกฤษ</option><option>ไม่มีเสียงพากย์</option></select></div>`),
    () => fields(`<div class="field full"><label>หัวข้อหรือโครงเรื่อง</label><textarea data-key="topic" placeholder="เล่าให้ AI ฟังว่าเรื่องเกี่ยวกับอะไร ใคร ทำอะไร ที่ไหน และอยากให้คนดูรู้สึกอย่างไร">${escapeHtml(state.data.topic || "")}</textarea></div><div class="field full"><label>ข้อมูลจริงที่ห้ามแต่งเพิ่ม</label><textarea data-key="facts" placeholder="ชื่อบุคคล ตำแหน่ง วันที่ สถานที่ หน่วยงาน หรือข้อความที่ต้องใช้ตามจริง">${escapeHtml(state.data.facts || "")}</textarea></div><div class="field"><label>กลุ่มผู้ชม</label><input data-key="audience" value="${escapeHtml(state.data.audience || "")}" placeholder="เช่น ประชาชนทั่วไป"></div><div class="field"><label>น้ำเสียง</label><select data-key="tone"><option>สุภาพ ชัดเจน</option><option>อบอุ่น เป็นกันเอง</option><option>สนุก กระชับ</option><option>ภาพยนตร์ มีอารมณ์</option><option>กำหนดเอง</option></select></div>`),
    () => choices("visual", [["ภาพยนตร์สมจริง","แสงและมิติแบบภาพยนตร์","🎥"],["ข่าวประชาสัมพันธ์","สะอาด สุภาพ น่าเชื่อถือ","📺"],["แอนิเมชัน 3D","สดใส เหมาะกับครอบครัว","🧸"],["อนิเมะร่วมสมัย","เส้นคม สีสวย อารมณ์ชัด","🌸"],["อนิเมะภาพยนตร์","แสงละเอียด ฉากใหญ่","🎞️"],["อนิเมะน่ารัก","ตัวละครเป็นมิตร สีสด","🐰"],["อนิเมะแฟนตาซี","โลกเหนือจริงและเวทมนตร์","✨"],["ภาพวาดศิลปะ","พื้นผิวและฝีแปรงโดดเด่น","🎨"],["กำหนดเอง","ระบุทิศทางภาพภายหลัง","⚙️"]]),
    storyboardPanel,
    methodPanel,
    productionPanel
  ];

  function render() {
    $("#stepper").innerHTML = steps.map((label, index) => `<div class="step ${index === state.step ? "active" : index < state.step ? "done" : ""}"><i>${index < state.step ? "✓" : index + 1}</i><span>${label}</span></div>`).join("");
    $("#stepPanel").innerHTML = panels[state.step]();
    $("#workspaceTitle").textContent = state.name || "สร้างวิดีโอใหม่ด้วย AI";
    $("#prevStep").disabled = state.step === 0;
    $("#nextStep").hidden = state.step === steps.length - 1;
    $("#stepPanel").querySelectorAll("[data-key]").forEach((control) => {
      const key = control.dataset.key;
      const value = key === "name" ? state.name : state.data[key];
      if (value && control.tagName === "SELECT") control.value = value;
    });
    bindPanel();
  }
  function bindPanel() {
    $("#stepPanel").querySelectorAll("[data-key]").forEach((control) => {
      const apply = () => { const key = control.dataset.key; state.data[key] = control.value; if (key === "name") state.name = control.value; save(); };
      control.addEventListener("change", apply); control.addEventListener("input", apply);
    });
    $("#stepPanel").querySelectorAll("[data-scene]").forEach((control) => control.addEventListener("input", () => {
      const scene = state.data.scenes.find((item) => item.id === control.dataset.scene); if (scene) scene[control.dataset.sceneKey] = control.value; save();
    }));
    $("#buildStoryboard")?.addEventListener("click", buildStoryboard);
    $("#startProduction")?.addEventListener("click", startProduction);
    $("#downloadProject")?.addEventListener("click", downloadJson);
  }
  async function startProduction() {
    const box = $("#apiResult"); const button = $("#startProduction"); if (!box || !button) return;
    box.hidden = false; box.className = "api-result loading"; box.textContent = "กำลังสร้างภาพและเสียงให้ทีละฉาก กรุณาเปิดหน้านี้ไว้…";
    button.disabled = true; button.textContent = "กำลังสร้างวิดีโอ…";
    try {
      const response = await fetch("/api/produce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.name, ...state.data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ยังสร้างวิดีโอไม่สำเร็จ");
      box.className = "api-result success"; box.textContent = "สร้างวิดีโอเรียบร้อยแล้ว";
      $("#videoResult").innerHTML = `<video class="result-video" controls src="${escapeHtml(result.downloadUrl)}"></video><a class="primary result-download" href="${escapeHtml(result.downloadUrl)}" download>ดาวน์โหลดวิดีโอ MP4</a>`;
    } catch (error) {
      box.className = "api-result error"; box.textContent = error.message;
      button.disabled = false; button.textContent = "ลองสร้างอีกครั้ง";
    }
  }
  function openGenerator() { $("#workspace").hidden = false; render(); $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" }); closeSidebar(); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.remove("show"); $("#mobileMenu").setAttribute("aria-expanded", "false"); }
  function renderProjects() {
    const items = readProjects();
    $("#projectList").innerHTML = items.length ? items.map((item) => `<button class="project-item ghost" type="button" data-project="${item.id}"><span><b>${escapeHtml(item.name || "โครงการไม่มีชื่อ")}</b><small>${escapeHtml(item.data?.genre || "วิดีโอ AI")}</small></span><small>${new Date(item.updatedAt).toLocaleString("th-TH")}</small></button>`).join("") : `<div class="empty-projects">ยังไม่มีโครงการที่บันทึกไว้</div>`;
    $("#projectList").querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => { const item = items.find((project) => project.id === button.dataset.project); Object.assign(state, item); $("#projectDialog").close(); openGenerator(); }));
  }
  document.querySelectorAll("[data-start]").forEach((button) => button.addEventListener("click", openGenerator));
  $("#prevStep").addEventListener("click", () => { if (state.step > 0) { state.step--; render(); } });
  $("#nextStep").addEventListener("click", () => { if (state.step < steps.length - 1) { state.step++; save(); render(); } });
  $("#closeWorkspace").addEventListener("click", () => { $("#workspace").hidden = true; scrollTo({ top: 0, behavior: "smooth" }); });
  ["#openProjects", "#openProjectsHero", "#openProjectsSide"].forEach((id) => $(id).addEventListener("click", () => { renderProjects(); $("#projectDialog").showModal(); closeSidebar(); }));
  $("#closeProjects").addEventListener("click", () => $("#projectDialog").close());
  $("#mobileMenu").addEventListener("click", () => { const open = !$("#sidebar").classList.contains("open"); $("#sidebar").classList.toggle("open", open); $("#sidebarBackdrop").classList.toggle("show", open); $("#mobileMenu").setAttribute("aria-expanded", String(open)); });
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  if (new URLSearchParams(location.search).get("source") === "tanjai-ai-studio") openGenerator();
})();

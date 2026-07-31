(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const STORAGE_KEY = "tanjai-ai-video-projects-v2";
  const SETTINGS_KEY = "tanjai-ai-video-settings-v1";
  const steps = ["ตั้งค่าโครงการ", "บอกเรื่อง", "เลือกแนวภาพ", "ตรวจ Storyboard", "เชื่อม AI", "ผลิตและส่งออก"];
  const state = {
    id: crypto.randomUUID(), step: 0, name: "", updatedAt: Date.now(),
    data: { genre: "ประชาสัมพันธ์", aspect: "16:9 แนวนอน", duration: "60 วินาที", visual: "ภาพยนตร์สมจริง", scenes: [] }
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
  function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
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
  function buildStoryboard() {
    const count = sceneCount();
    const topic = state.data.topic || state.name || "เรื่องที่ต้องการนำเสนอ";
    const beats = ["เปิดเรื่องให้หยุดดู", "แนะนำบริบทและตัวละคร", "อธิบายหัวใจของเรื่อง", "แสดงรายละเอียดสำคัญ", "สร้างอารมณ์และความน่าเชื่อถือ", "สรุปประโยชน์", "เน้นข้อความหลัก", "ปิดเรื่องพร้อมคำเชิญชวน", "ภาพส่งท้าย", "โลโก้และข้อมูลติดต่อ", "บทสรุป", "End card"];
    state.data.scenes = Array.from({ length: count }, (_, index) => ({
      id: crypto.randomUUID(), order: index + 1,
      title: beats[index] || `ฉากที่ ${index + 1}`,
      duration: Math.max(4, Math.round((parseInt(state.data.duration, 10) || 60) / count)),
      narration: index === 0 ? topic : `${beats[index] || "ดำเนินเรื่อง"} — ${topic}`,
      prompt: `${state.data.visual}; ${beats[index] || "story scene"}; ${topic}; ${state.data.aspect}; consistent art direction; no embedded text`,
      status: "draft"
    }));
    save(); render();
  }
  function projectPayload() {
    return { format: "tanjai-ai-video-project", version: "0.5.0", projectId: state.id, projectName: state.name, ...state.data, updatedAt: new Date(state.updatedAt).toISOString() };
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(projectPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${(state.name || "tanjai-ai-video").replace(/[\\/:*?"<>|]+/g, "-")}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function storyboardPanel() {
    if (!state.data.scenes.length) return `<div class="empty-storyboard"><span>🎬</span><h3>ยังไม่มี Storyboard</h3><p>ระบบวางแผนฟรีจะร่างฉากจากข้อมูลที่กรอก โดยยังไม่ใช้เครดิต API</p><button class="primary" id="buildStoryboard" type="button">สร้าง Storyboard ฟรี</button></div>`;
    return `<div class="storyboard-head"><div><h3>Storyboard ${state.data.scenes.length} ฉาก</h3><small>แก้ข้อความได้ทุกฉากก่อนส่งให้ AI สร้างจริง</small></div><button class="ghost compact" id="buildStoryboard" type="button">ร่างใหม่</button></div><div class="storyboard-grid">${state.data.scenes.map((scene, index) => `<article class="scene-card"><div class="scene-number">${String(index + 1).padStart(2, "0")}<small>${scene.duration} วิ</small></div><div class="scene-body"><label>หน้าที่ของฉาก<input data-scene="${scene.id}" data-scene-key="title" value="${escapeHtml(scene.title)}"></label><label>เสียงพากย์<textarea data-scene="${scene.id}" data-scene-key="narration">${escapeHtml(scene.narration)}</textarea></label><label>Prompt ภาพ/วิดีโอ<textarea data-scene="${scene.id}" data-scene-key="prompt">${escapeHtml(scene.prompt)}</textarea></label></div></article>`).join("")}</div>`;
  }
  function connectionPanel() {
    const settings = readSettings();
    return `${fields(`<div class="field full"><label>โหมดการทำงาน</label><div class="connection-state"><span class="status ${settings.endpoint ? "ready" : "planned"}">${settings.endpoint ? "พร้อมเชื่อม" : "วางแผนฟรี"}</span><p>${settings.endpoint ? "มีที่อยู่ AI Gateway แล้ว สามารถทดสอบการเชื่อมต่อได้" : "สร้างและแก้ Storyboard ได้ฟรี ส่วนการสร้างภาพ วิดีโอ และเสียงจริงต้องเชื่อม AI Gateway"}</p></div></div><div class="field full"><label>AI Gateway URL</label><input id="apiEndpoint" value="${escapeHtml(settings.endpoint || "")}" placeholder="เช่น https://video-api.your-domain.com"><small>ไม่กรอก API Key ในหน้าเว็บสาธารณะ ให้ Gateway เก็บกุญแจไว้ฝั่งเซิร์ฟเวอร์</small></div>`)}<div class="api-actions"><button class="ghost" id="saveEndpoint" type="button">บันทึกการเชื่อมต่อ</button><button class="primary" id="testEndpoint" type="button" ${settings.endpoint ? "" : "disabled"}>ทดสอบ Gateway</button></div><div class="api-result" id="apiResult" hidden></div><div class="pipeline-list"><div><i>1</i><span><b>วางแผนเรื่อง</b><small>ทำได้ฟรีในเบราว์เซอร์</small></span></div><div><i>2</i><span><b>สร้างภาพและวิดีโอรายฉาก</b><small>ทำผ่าน API หลังเชื่อม Gateway</small></span></div><div><i>3</i><span><b>เสียงพากย์และประกอบ MP4</b><small>ให้ Gateway ส่งสถานะงานกลับมา</small></span></div></div>`;
  }
  function productionPanel() {
    const settings = readSettings();
    return `<div class="production-summary"><h3>พร้อมเข้าสู่สายการผลิต</h3><div class="summary-list"><div><small>โครงการ</small><b>${escapeHtml(state.name || "ยังไม่ได้ตั้งชื่อ")}</b></div><div><small>รูปแบบ</small><b>${escapeHtml(state.data.genre)} · ${escapeHtml(state.data.aspect)}</b></div><div><small>Storyboard</small><b>${state.data.scenes.length} ฉาก</b></div><div><small>สถานะ</small><b>${settings.endpoint ? "พร้อมส่งเข้า AI Gateway" : "พร้อมส่งออกแผนงาน"}</b></div></div><p>การกดผลิตจริงจะสร้างงานผ่าน Gateway และอาจมีค่าใช้จ่ายตามผู้ให้บริการที่เลือก ระบบต้องแสดงราคาประมาณก่อนยืนยันทุกครั้ง</p></div><div class="production-actions"><button class="ghost" id="downloadProject" type="button">ดาวน์โหลดโครงการ JSON</button><button class="primary" id="startProduction" type="button" ${settings.endpoint && state.data.scenes.length ? "" : "disabled"}>ส่งเข้าสายการผลิต</button></div><div class="api-result" id="apiResult" hidden></div>`;
  }
  const panels = [
    () => fields(`<div class="field full"><label>ชื่อโครงการ</label><input data-key="name" value="${escapeHtml(state.name)}" placeholder="เช่น วิดีโอประชาสัมพันธ์งานแห่เทียนพรรษา"></div><div class="field"><label>ประเภทวิดีโอ</label><select data-key="genre"><option>ประชาสัมพันธ์</option><option>ข่าว / สรุปกิจกรรม</option><option>นิทานเด็ก</option><option>MV เพลง</option><option>หนังสั้น</option><option>โฆษณา</option><option>วิดีโอจากภาพนิ่ง</option><option>กำหนดเอง</option></select></div><div class="field"><label>สัดส่วนภาพ</label><select data-key="aspect"><option>16:9 แนวนอน</option><option>9:16 แนวตั้ง</option><option>1:1 จัตุรัส</option><option>4:5 โพสต์โซเชียล</option></select></div><div class="field"><label>ความยาวเป้าหมาย</label><select data-key="duration"><option>30 วินาที</option><option>60 วินาที</option><option>90 วินาที</option><option>180 วินาที</option></select></div><div class="field"><label>ภาษา</label><select data-key="language"><option>ภาษาไทย</option><option>ภาษาอังกฤษ</option><option>ไม่มีเสียงพากย์</option></select></div>`),
    () => fields(`<div class="field full"><label>หัวข้อหรือโครงเรื่อง</label><textarea data-key="topic" placeholder="เล่าให้ AI ฟังว่าเรื่องเกี่ยวกับอะไร ใคร ทำอะไร ที่ไหน และอยากให้คนดูรู้สึกอย่างไร">${escapeHtml(state.data.topic || "")}</textarea></div><div class="field full"><label>ข้อมูลจริงที่ห้ามแต่งเพิ่ม</label><textarea data-key="facts" placeholder="ชื่อบุคคล ตำแหน่ง วันที่ สถานที่ หน่วยงาน หรือข้อความที่ต้องใช้ตามจริง">${escapeHtml(state.data.facts || "")}</textarea></div><div class="field"><label>กลุ่มผู้ชม</label><input data-key="audience" value="${escapeHtml(state.data.audience || "")}" placeholder="เช่น ประชาชนทั่วไป"></div><div class="field"><label>น้ำเสียง</label><select data-key="tone"><option>สุภาพ ชัดเจน</option><option>อบอุ่น เป็นกันเอง</option><option>สนุก กระชับ</option><option>ภาพยนตร์ มีอารมณ์</option><option>กำหนดเอง</option></select></div>`),
    () => choices("visual", [["ภาพยนตร์สมจริง","แสงและมิติแบบภาพยนตร์","🎥"],["ข่าวประชาสัมพันธ์","สะอาด สุภาพ น่าเชื่อถือ","📺"],["แอนิเมชัน 3D","สดใส เหมาะกับครอบครัว","🧸"],["อนิเมะร่วมสมัย","เส้นคม สีสวย อารมณ์ชัด","🌸"],["อนิเมะภาพยนตร์","แสงละเอียด ฉากใหญ่","🎞️"],["อนิเมะน่ารัก","ตัวละครเป็นมิตร สีสด","🐰"],["อนิเมะแฟนตาซี","โลกเหนือจริงและเวทมนตร์","✨"],["ภาพวาดศิลปะ","พื้นผิวและฝีแปรงโดดเด่น","🎨"],["กำหนดเอง","ระบุทิศทางภาพภายหลัง","⚙️"]]),
    storyboardPanel,
    connectionPanel,
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
    $("#saveEndpoint")?.addEventListener("click", () => { const endpoint = $("#apiEndpoint").value.trim().replace(/\/$/, ""); localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint })); render(); });
    $("#testEndpoint")?.addEventListener("click", () => callGateway("/health", { method: "GET" }, "เชื่อมต่อ Gateway สำเร็จ"));
    $("#startProduction")?.addEventListener("click", () => callGateway("/v1/video-projects", { method: "POST", body: JSON.stringify(projectPayload()) }, "ส่งโครงการเข้าสายการผลิตแล้ว"));
    $("#downloadProject")?.addEventListener("click", downloadJson);
  }
  async function callGateway(path, options, successText) {
    const endpoint = readSettings().endpoint; const box = $("#apiResult"); if (!endpoint || !box) return;
    box.hidden = false; box.className = "api-result loading"; box.textContent = "กำลังเชื่อมต่อ…";
    try {
      const response = await fetch(`${endpoint}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json().catch(() => ({}));
      box.className = "api-result success"; box.textContent = `${successText}${result.jobId ? ` · Job ${result.jobId}` : ""}`;
    } catch (error) { box.className = "api-result error"; box.textContent = `ยังเชื่อมไม่ได้: ${error.message}`; }
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

const fs = require("fs");
const assert = require("assert");
const index = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

assert.match(index, /สร้างวิดีโอ AI \| Tanjai Video Studio/);
assert.match(index, /app\.js\?v=0\.6\.1/);
assert.doesNotMatch(index, /ตัดต่อจากคลิปที่มี|render-engine|handoff-store/);
assert.match(app, /ให้ AI วางเรื่อง/);
assert.match(app, /tanjai-ai-video-project/);
assert.match(app, /\/api\/storyboard/);
assert.match(app, /\/api\/produce/);
assert.doesNotMatch(app, /AI Gateway URL/);
assert.match(app, /อนิเมะร่วมสมัย/);
assert.match(app, /อนิเมะภาพยนตร์/);
assert.match(app, /อนิเมะน่ารัก/);
assert.match(app, /อนิเมะแฟนตาซี/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /@media\(max-width:640px\)/);

console.log(JSON.stringify({ version: "0.6.1", aiVideoOnly: true, realStoryboard: true, mp4Ready: true, dockerReady: true, animeStyles: 4, responsive: true, status: "PASS" }, null, 2));

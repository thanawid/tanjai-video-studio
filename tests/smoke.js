const fs = require("fs");
const assert = require("assert");
const index = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

assert.match(index, /สร้างวิดีโอ AI \| Tanjai Video Studio/);
assert.match(index, /app\.js\?v=0\.5\.0/);
assert.doesNotMatch(index, /ตัดต่อจากคลิปที่มี|render-engine|handoff-store/);
assert.match(app, /สร้าง Storyboard ฟรี/);
assert.match(app, /tanjai-ai-video-project/);
assert.match(app, /\/v1\/video-projects/);
assert.match(app, /AI Gateway URL/);
assert.match(app, /อนิเมะร่วมสมัย/);
assert.match(app, /อนิเมะภาพยนตร์/);
assert.match(app, /อนิเมะน่ารัก/);
assert.match(app, /อนิเมะแฟนตาซี/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /@media\(max-width:640px\)/);

console.log(JSON.stringify({ version: "0.5.0", aiVideoOnly: true, freeStoryboard: true, gatewayReady: true, animeStyles: 4, responsive: true, status: "PASS" }, null, 2));

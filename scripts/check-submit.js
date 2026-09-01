// 番付を汚さない検査: sdk.js を遮断して stub を置き、#autotest の夜明けで submitScore が0回であることを数える。
//   NODE_PATH=../shikifuda-kasane/node_modules node scripts/check-submit.js
const puppeteer = require("puppeteer-core"), http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { html: "text/html", js: "text/javascript", m4a: "audio/mp4", webp: "image/webp", png: "image/png", jpg: "image/jpeg" };
(async () => {
  const srv = http.createServer((q, r) => { const rel = decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const f = path.join(ROOT, rel); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404).end(); return; } r.writeHead(200, { "Content-Type": MIME[path.extname(f).slice(1)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
  await new Promise((res) => srv.listen(0, res));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" }); const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setRequestInterception(true); page.on("request", (r) => /waiwai\.town/.test(r.url()) ? r.abort() : r.continue());
  await page.evaluateOnNewDocument(() => { window.__submits = []; Object.defineProperty(window, "waiwai", { configurable: true, value: { mode: "bridged", load: () => Promise.resolve(null), save: () => Promise.resolve(true), submitScore: (b, s, m) => { window.__submits.push([b, s, m]); return Promise.resolve({ ok: true, best: s, rank: 1, improved: true }); }, getMyScore: () => Promise.resolve(null), getTopScores: () => Promise.resolve({ entries: [], total: 0 }) } }); });
  const t0 = Date.now(); await page.goto(`http://127.0.0.1:${srv.address().port}/index.html#autotest`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("overlay").classList.contains("show"), { polling: 500, timeout: 240000 });
  const s = await page.evaluate(() => ({ score: document.getElementById("final-score").textContent, submits: window.__submits.length }));
  const ok = s.submits === 0 && errors.length === 0; console.log((ok ? "✅" : "❌") + " 自動プレイから送信0回", JSON.stringify({ ...s, sec: +((Date.now() - t0) / 1000).toFixed(1), errors }));
  await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
})();

// 御霊おとし 紹介PV（2026-09-13・わいわいタウン掲載作の毎日紹介）の素材を1回の走りで録る。
//   NODE_PATH=scripts/pv/node_modules node scripts/pv/capture-intro.js <出力先>
//
// 画＝CDP screencast（端末相当 360×640 @2x → 720×1280）・音＝WebAudio を tee して MediaRecorder。
// 型は kiyome-bayashi/scripts/pv/capture-pv.js（docs/MEDIA.md「音つきで録る」）。本体は無改変。
//
// この作の事情:
//  - **BGM は WebAudio ではなく <audio>（new Audio）で鳴る。**connect のフックだけでは録れないので、
//    HTMLMediaElement.prototype.play も包み、同じ AudioContext の createMediaElementSource へ繋ぎ替えて録る
//    （ゲーム内のダッキング＝台詞の間にBGMを沈める、もそのまま録れる）
//  - 満月成就と皆既月蝕は、自然に遊ぶと数分かかる。**ヘッダーの題字3連打（演出確認の口）で
//    手持ちを咲耶に変えて**狙って落とす。#test は開幕0.8秒で降ってくる＝自然なプレイが写らないので使わない
//  - `#start-silent` で撮らない（♪ に取り消し線が付いた絵になる）
//  - わいわいタウンへの通信は遮断する（本番の番付を撮影の巻き添えにしない）
const puppeteer = require("puppeteer-core"), http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.argv[2] || path.join(__dirname, "intro-raw");
const MIME = { html: "text/html", js: "text/javascript", m4a: "audio/mp4", wav: "audio/wav", mp3: "audio/mpeg", webp: "image/webp", png: "image/png", jpg: "image/jpeg", json: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function serve() { return new Promise((res) => { const s = http.createServer((q, r) => { const rel = decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const f = path.join(ROOT, rel); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404).end(); return; } r.writeHead(200, { "Content-Type": MIME[path.extname(f).slice(1)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }); s.listen(0, () => res(s)); }); }

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
    args: ["--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });
  const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.setRequestInterception(true); page.on("request", (r) => (/waiwai\.town/.test(r.url()) ? r.abort() : r.continue()));
  await page.evaluateOnNewDocument(() => {
    window.__audioBlobs = []; window.__audioStartAt = null; window.__marks = [];
    const origConnect = AudioNode.prototype.connect;
    const tap = (ctx) => {
      if (ctx.__streamDest) return;
      ctx.__streamDest = ctx.createMediaStreamDestination();
      window.__ctx = ctx;
      try {
        const rec = new MediaRecorder(ctx.__streamDest.stream, { mimeType: "audio/webm;codecs=opus" });
        rec.ondataavailable = (e) => { if (e.data && e.data.size) window.__audioBlobs.push(e.data); };
        window.__audioStartAt = Date.now() / 1000; rec.start(200); window.__mediaRecorder = rec;
      } catch (e) { console.warn("[capture] MediaRecorder 開始に失敗", e); }
    };
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (typeof AudioDestinationNode !== "undefined" && dest instanceof AudioDestinationNode) {
        tap(dest.context);
        origConnect.call(this, dest.context.__streamDest, ...rest);
      }
      return origConnect.apply(this, [dest, ...rest]);
    };
    // BGM（<audio>）を同じ AudioContext に通す
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) {
      const el = this;
      const route = () => {
        if (el.__routed) return true;
        if (!window.__ctx) return false;
        try { const src = window.__ctx.createMediaElementSource(el); src.connect(window.__ctx.destination); el.__routed = true; window.__marks.push({ ev: "bgm-route", t: Date.now() / 1000 }); } catch (e) { console.warn("[capture] BGM の繋ぎ替えに失敗", e); el.__routed = true; }
        return true;
      };
      if (!route()) { const iv = setInterval(() => { if (route()) clearInterval(iv); }, 10); }
      window.__marks.push({ ev: "bgm-play", t: Date.now() / 1000 });
      return origPlay.apply(this, a);
    };
  });

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async (ev) => { frames.push({ ts: ev.metadata.timestamp, data: ev.data }); try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {} });
  const marks = []; const mark = (ev) => { marks.push({ ev, t: Date.now() / 1000 }); console.log("・" + ev); };

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 720, maxHeight: 1280, everyNthFrame: 1 });
  mark("rec-start");
  await page.waitForFunction(() => { const o = document.getElementById("title-overlay"); return o && o.classList.contains("ready"); }, { polling: 50, timeout: 20000 });
  mark("card-ready");
  await sleep(1400);   // 案内カードを読める間だけ見せる

  // 盤の中で起きたことを控える（カットイン・皆既月蝕の出た秒）
  await page.evaluate(() => {
    const watch = (id, name) => new MutationObserver(() => { if (document.getElementById(id).classList.contains("show")) window.__marks.push({ ev: name, t: Date.now() / 1000 }); })
      .observe(document.getElementById(id), { attributes: true, attributeFilter: ["class"] });
    watch("cutin", "cutin-show"); watch("eclipse", "eclipse-show");
  });

  await page.click("#start"); mark("click-start");   // 音あり（実クリック＝AudioContext が開く）
  await sleep(3700);                                   // 帳が開ききるまで

  const box = await page.$eval("#game", (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const drop = async (lx) => { await page.mouse.click(box.x + (lx / 480) * box.w, box.y + (380 / 720) * box.h); };
  const summon = () => page.evaluate(() => { const h1 = document.querySelector("header h1"); for (let i = 0; i < 3; i++) h1.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });

  // 自然に遊ぶ（小さい御霊を寄せて、連なりの浄化を起こす）
  mark("play-start");
  const xs = [240, 250, 200, 280, 230, 300, 190, 260, 320, 215, 270, 245, 290, 225];
  for (const lx of xs) { await drop(lx); await sleep(720); }
  mark("play-end");
  // 満月成就（咲耶を2体重ねる）
  await summon(); await drop(120); mark("sakuya-1"); await sleep(950);
  await summon(); await drop(120); mark("sakuya-2"); await sleep(3600);
  // もう一つ満月 → 満月×2 が触れて皆既月蝕
  await summon(); await drop(370); mark("sakuya-3"); await sleep(950);
  await summon(); await drop(370); mark("sakuya-4");
  await sleep(7500);
  mark("rec-end");

  await cdp.send("Page.stopScreencast");
  const audio = await page.evaluate(async () => {
    if (window.__mediaRecorder && window.__mediaRecorder.state !== "inactive") await new Promise((r) => { window.__mediaRecorder.addEventListener("stop", r, { once: true }); window.__mediaRecorder.stop(); });
    const blob = new Blob(window.__audioBlobs || [], { type: "audio/webm" }); const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + c));
    return { b64: btoa(bin), startAt: window.__audioStartAt, bytes: bytes.length, marks: window.__marks };
  });
  const score = await page.$eval("#score", (e) => e.textContent).catch(() => "?");
  await browser.close(); srv.close();

  if (!frames.length) throw new Error("フレームが1枚も撮れなかった");
  const t0 = frames[0].ts;
  let list = "";
  frames.forEach((f, i) => { const n = `f${String(i).padStart(4, "0")}.jpg`; fs.writeFileSync(path.join(OUT, "frames", n), Buffer.from(f.data, "base64")); const d = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 30; list += `file '${n}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`; });
  list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "frames", "list.txt"), list);
  fs.writeFileSync(path.join(OUT, "audio.webm"), Buffer.from(audio.b64, "base64"));
  // 秒はすべて「録画の1コマ目」からの経過で書く。音の頭は audioFrom 秒の地点
  const rel = (m) => ({ ev: m.ev, 秒: +(m.t - t0).toFixed(3) });
  const meta = { コマ数: frames.length, 録画秒: +(frames.at(-1).ts - t0).toFixed(2), audioFrom: +(audio.startAt - t0).toFixed(3), audioBytes: audio.bytes,
    marks: marks.map(rel), 盤の出来事: (audio.marks || []).map(rel), 終わりの得点: score, errors };
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta, null, 1));
})();

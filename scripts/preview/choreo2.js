// プレビュー動画v2: 満月1つ目は録画前に作成（カットイン映さない）
// 録画: 通常プレイ積み上げ→合体→咲耶ペア→カットイン1回→満月×2→皆既月蝕
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "frames");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--window-size=640,640", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 640, height: 640, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(process.argv[2] || "https://hirohgxx.github.io/mitama-otoshi/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#start-silent", { visible: true, timeout: 30000 });
  await sleep(1200);

  let startedOk = false;
  for (let i = 0; i < 20 && !startedOk; i++) {
    await page.evaluate(() => document.getElementById("start-silent").click());
    await sleep(400);
    startedOk = await page.evaluate(() =>
      document.getElementById("title-overlay").classList.contains("hidden"));
  }
  if (!startedOk) throw new Error("could not start the game");

  const drop = async x => { await page.mouse.click(x, 350); };
  const summonSakuya = async () => {
    await page.evaluate(() => {
      const h1 = document.querySelector("header h1");
      for (let i = 0; i < 3; i++) h1.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
  };

  // ---- 録画前: 満月1つ目を左に作る（カットインは録画されない） ----
  await summonSakuya(); await drop(270); await sleep(900);
  await summonSakuya(); await drop(270); await sleep(6000); // カットイン終了・満月安定まで

  // ---- 録画開始 ----
  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async ev => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 2 });

  // 通常プレイ: 右側に積み上げ（自然な合体を狙って密集させる）
  const xs = [420, 445, 400, 430, 455, 410, 440, 425];
  for (const x of xs) { await drop(x); await sleep(800); }
  await sleep(600);

  // 咲耶ペア → カットイン（1回だけ）→ 満月×2 → 皆既月蝕
  await summonSakuya(); await drop(455); await sleep(700);
  await summonSakuya(); await drop(455); await sleep(9500);

  await cdp.send("Page.stopScreencast");
  await browser.close();

  let list = "";
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 15;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "list.txt"), list);
  const span = frames.length > 1 ? frames[frames.length - 1].ts - frames[0].ts : 0;
  console.log(`captured ${frames.length} frames over ${span.toFixed(1)}s`);
})();

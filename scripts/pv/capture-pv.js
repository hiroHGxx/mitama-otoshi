// 御霊おとしPV用 縦型720x1280キャプチャ
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
    args: ["--window-size=720,1280", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 720, height: 1280, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto("https://hirohgxx.github.io/mitama-otoshi/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#start-silent", { visible: true, timeout: 30000 });
  await sleep(1500);
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    await page.evaluate(() => document.getElementById("start-silent").click());
    await sleep(400);
    ok = await page.evaluate(() => document.getElementById("title-overlay").classList.contains("hidden"));
  }
  if (!ok) throw new Error("start failed");

  const rect = await page.evaluate(() => {
    const r = document.getElementById("game").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const px = lx => rect.left + (lx / 480) * rect.width;
  const py = ly => rect.top + (ly / 720) * rect.height;
  const drop = async lx => { await page.mouse.click(px(lx), py(380)); };
  const summon = () => page.evaluate(() => { const h1 = document.querySelector("header h1"); for (let i=0;i<3;i++) h1.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); });

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async ev => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 2 });

  const xs = [240, 300, 205, 270, 330, 225, 305, 260, 290];
  for (const lx of xs) { await drop(lx); await sleep(780); }
  await sleep(500);
  await summon(); await drop(140); await sleep(900);
  await summon(); await drop(140); await sleep(5200);
  await summon(); await drop(400); await sleep(800);
  await summon(); await drop(400); await sleep(9500);

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
  console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - frames[0].ts).toFixed(1)}s`);
})();

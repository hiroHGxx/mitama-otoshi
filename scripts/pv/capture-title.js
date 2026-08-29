// 御霊おとし 更新告知動画: タイトル→「月夜に入る」→帳が開く→少し遊ぶ、の実撮り（わいわいタウン埋め込み内）
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "frames_title");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--window-size=720,1324", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 720, height: 1324, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto("https://waiwai.town/apps/mitama-otoshi", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button,a"));
    const b = btns.find(x => (x.textContent || "").includes("このサイトで遊ぶ"));
    if (b) b.click();
  });

  // iframe が現れるのを待つ（この直後から撮影を始める＝札絵ズームの頭から拾う）
  let gameFrame = null;
  for (let i = 0; i < 30 && !gameFrame; i++) {
    gameFrame = page.frames().find(f => f.url().includes("hirohgxx.github.io"));
    if (!gameFrame) await sleep(100);
  }
  if (!gameFrame) throw new Error("game iframe not found");

  const off = await page.evaluate(() => {
    const ifr = document.getElementById("game-frame") || document.querySelector('iframe[src*="hirohgxx"]');
    const r = ifr.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  console.log("iframe offset:", JSON.stringify(off));

  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async ev => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });

  // 札絵→案内カード の自然な出現を待つ（実測2.87秒。少し余裕を見る）
  await sleep(2500);

  // #start（月夜に入る）を押す
  for (let i = 0; i < 20; i++) {
    const has = await gameFrame.evaluate(() => !!document.getElementById("start")).catch(() => false);
    if (has) break;
    await sleep(100);
  }
  const startRect = await gameFrame.evaluate(() => {
    const el = document.getElementById("start");
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(off.x + startRect.x, off.y + startRect.y);
  console.log("clicked start at", JSON.stringify(startRect));

  // 帳が開ききるまで待つ（350ms台詞 → 1650msで開き始め → 3150msで開ききる。余裕を見て3600ms）
  await sleep(3600);

  // 少し遊ぶ: 落として合体・浄化を見せる（capture-pv.js と同じ /480 換算）
  const rect = await gameFrame.evaluate(() => {
    const r = document.getElementById("game").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const px = lx => off.x + rect.left + (lx / 480) * rect.width;
  const py = ly => off.y + rect.top + (ly / 720) * rect.height;
  const xs = [240, 300, 205, 270, 330, 225, 305, 260, 290, 250];
  for (const lx of xs) {
    await page.mouse.click(px(lx), py(380));
    await sleep(700);
  }
  await sleep(500);

  await cdp.send("Page.stopScreencast");
  await browser.close();

  let list = "";
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 30;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, "list.txt"), list);
  console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - frames[0].ts).toFixed(1)}s`);
})().catch(e => { console.error("FATAL", e); process.exit(1); });

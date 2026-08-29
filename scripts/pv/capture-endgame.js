// 御霊おとし 更新告知動画: 「夜が明けた」→番付 の実撮り（わいわいタウン埋め込み内・本物の全国順位）
// 2026-08-29 引き継ぎ再撮: #autotest の再読み込みは「親ページから iframe.src を書き換える」
// のではなく「iframe の中から location.hash + location.reload() を呼ぶ」方式に変更。
// 親からの書き換えだと、わいわいタウン側の埋め込みトークン等が保たれず #autotest が一度も
// 発火しない（title-overlay が hidden にならない＝盤面が最後まで静止したまま）ことを実機で確認済み。
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "frames_end");
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
  page.on("console", m => { const t = m.text(); if (/waiwai|error/i.test(t)) console.log("[page]", t); });
  await page.goto("https://waiwai.town/apps/mitama-otoshi", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button,a"));
    const b = btns.find(x => (x.textContent || "").includes("このサイトで遊ぶ"));
    if (b) b.click();
  });
  await sleep(2500);

  const frameUrl = () => page.frames().find(f => f.url().includes("hirohgxx.github.io"));
  let gameFrame = frameUrl();
  if (!gameFrame) throw new Error("game iframe not found");

  // iframe オフセット（town の上部バー分だけ下にずれる）。reload 前に取っておく（reload後もiframe要素自体は同じ）
  const off = await page.evaluate(() => {
    const ifr = document.getElementById("game-frame") || document.querySelector('iframe[src*="hirohgxx"]');
    const r = ifr.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  console.log("iframe offset:", JSON.stringify(off));

  // #autotest で再読み込み（タイトルを自動スキップして落とし続ける撮影用デバッグ機能・SPEC.md §9）
  // ★iframe の中から呼ぶ（location.hash + location.reload()）。同一URL・同一セッションを保ったまま
  //   ハッシュだけ変えて自然にリロードするので、わいわいタウン側の埋め込み状態を壊さない。
  await gameFrame.evaluate(() => { location.hash = "autotest"; location.reload(); });
  await sleep(1500);
  gameFrame = frameUrl();
  console.log("reloaded frame url:", gameFrame && gameFrame.url());

  // started 確認（title-overlay が hidden になっているか）
  let started = false;
  for (let i = 0; i < 20; i++) {
    started = await gameFrame.evaluate(() => {
      const el = document.getElementById("title-overlay");
      return !!el && el.classList.contains("hidden");
    }).catch(() => false);
    if (started) break;
    await sleep(300);
  }
  console.log("autotest started:", started, "— waiting for game over...");
  if (!started) console.warn("★started=false。以降の記録は無駄撃ちの可能性が高い（要目視確認）");

  const t0 = Date.now();
  let over = false;
  for (let i = 0; i < 140; i++) { // 最大約140秒（実測70〜95秒想定・SPEC/MEDIA.md）
    await sleep(1000);
    const shown = await gameFrame.evaluate(() => {
      const o = document.getElementById("overlay");
      return o && o.classList.contains("show");
    }).catch(() => false);
    if (shown) { over = true; console.log(`game over detected at t=${((Date.now() - t0) / 1000).toFixed(1)}s`); break; }
  }
  if (!over) console.warn("game over NOT detected within time budget — capturing tail anyway");

  // ここから録画開始（結果カードの出た直後〜番付が埋まるまでの数秒だけを狙って撮る）
  // #overlay.show は display:none→flex の瞬時切替（CSSトランジション無し）なので、
  // 検出直後に録画を始めても「フェード途中を撮り逃す」心配は無い。
  const frames = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", async ev => {
    frames.push({ ts: ev.metadata.timestamp, data: ev.data });
    try { await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 1 });

  await sleep(900); // 結果カードだけの数コマを確保

  // 全国順位の行（rank-open）が生えるのを待って番付を開く（SDKの送受信に数秒かかる想定・SPEC §9-a）
  let opened = false;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    const has = await gameFrame.evaluate(() => !!document.querySelector(".rank-open")).catch(() => false);
    if (has) {
      await sleep(600); // 出てすぐより少し間を置いて見せる
      const rect = await gameFrame.evaluate(() => {
        const el = document.querySelector(".rank-open");
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(off.x + rect.x, off.y + rect.y);
      opened = true;
      console.log("banzuke opened at i=", i);
      break;
    }
  }
  console.log("banzuke opened:", opened);
  await sleep(opened ? 2600 : 3500);

  await cdp.send("Page.stopScreencast");
  await browser.close();

  let list = "";
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, "base64"));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : 1 / 20;
    list += `file '${name}'\nduration ${Math.max(dur, 0.01).toFixed(4)}\n`;
  });
  if (frames.length) {
    list += `file 'f${String(frames.length - 1).padStart(4, "0")}.jpg'\n`;
    fs.writeFileSync(path.join(OUT, "list.txt"), list);
    console.log(`captured ${frames.length} frames over ${(frames.at(-1).ts - frames[0].ts).toFixed(1)}s`);
  } else {
    console.warn("no frames captured");
  }
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ started, over, opened, offsetY: off.y }, null, 2));
})().catch(e => { console.error("FATAL", e); process.exit(1); });

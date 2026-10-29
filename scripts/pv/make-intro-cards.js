// 紹介PV（2026-09-13）の文字カードを撮る。テロップ2枚（透過）・札絵の総見せ9枚＋コピー（透過）・終わりのカード。
//   NODE_PATH=scripts/pv/node_modules node scripts/pv/make-intro-cards.js <出力先>
// 色は kitan-circle/data/design-tokens.json の系（宵闇藍 #131320/#1B1B2E・金泥 #D9A94C/#F0CE7E・月白 #E8E4D8・補助 #9D93B5）。
// 新しい色を発明しない。#7C7396 は使わない。型は kiyome-bayashi/scripts/pv/make-cards.js。
const puppeteer = require("puppeteer-core"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), OUT = process.argv[2] || path.join(__dirname, "intro-cards");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const uri = (rel, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(ROOT, rel)).toString("base64");
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&display=swap">';
const BASE = `${FONT}<style>*{margin:0;padding:0;box-sizing:border-box}
 body{width:720px;font-family:"Shippori Mincho B1","Hiragino Mincho ProN",serif;color:#E8E4D8}</style>`;
const telop = (main, sub) => `${BASE}<style>
 body{height:200px;background:transparent;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px}
 .m{font-size:40px;font-weight:800;letter-spacing:.10em;color:#F0CE7E;white-space:nowrap;text-shadow:0 2px 14px rgba(0,0,0,.95),0 0 30px rgba(0,0,0,.85)}
 .s{font-size:25px;font-weight:500;letter-spacing:.10em;color:#E8E4D8;white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.95),0 0 22px rgba(0,0,0,.8)}
</style><div class="m">${main}</div>${sub ? `<div class="s">${sub}</div>` : ""}`;
// 台詞の字幕（X は無音で自動再生される＝帳の暗い間に声が届かない。咲耶の開幕の台詞を字で出す）
const voice = (line) => `${BASE}<style>
 body{height:200px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;
   background:radial-gradient(ellipse 58% 50% at 50% 52%,rgba(19,19,32,.82) 0%,rgba(19,19,32,.55) 55%,rgba(19,19,32,0) 100%)}   /* 帳の金の縫い目の上でも読めるよう、宵闇藍の薄い座を敷く */
 .who{font-size:22px;font-weight:700;letter-spacing:.24em;color:#F0CE7E;text-shadow:0 2px 10px rgba(0,0,0,.95)}
 .line{font-size:36px;font-weight:700;letter-spacing:.08em;color:#E8E4D8;white-space:nowrap;text-shadow:0 2px 14px rgba(0,0,0,.95),0 0 26px rgba(0,0,0,.85)}
</style><div class="who">咲耶</div><div class="line">${line}</div>`;
// 札絵（九柱・階梯の順）
const LADDER = ["nemu", "oto", "anne", "nekomata", "benten", "uka", "izuna", "shion", "sakuya"];
const fuda = (k) => `${BASE}<style>body{height:1280px;background:#131320;overflow:hidden}
 img{width:720px;height:1280px;object-fit:cover}</style><img src="${uri(`assets/art/fuda_${k}.webp`, "image/webp")}">`;
const copy = `${BASE}<style>body{height:1280px;background:transparent}
 .c{position:absolute;left:0;right:0;top:78%;text-align:center;font-size:40px;font-weight:800;letter-spacing:.14em;color:#F0CE7E;white-space:nowrap;
   text-shadow:0 0 20px rgba(0,0,0,.95),0 2px 10px rgba(0,0,0,.95),0 0 36px rgba(0,0,0,.7)}</style>
 <div class="c">九柱を重ねて、満月へ。</div>`;
// 終わりのカード（CTA）。紹介の主リンクはわいわいタウン（番付はタウンの枠の中でしか出ない）
const endcard = `${BASE}<style>
 body{height:1280px;background:radial-gradient(ellipse at 50% 38%,#1B1B2E 0%,#131320 66%);overflow:hidden}
 .ring{position:absolute;left:50%;top:360px;width:470px;height:470px;transform:translate(-50%,-50%);filter:drop-shadow(0 0 26px rgba(224,86,47,.45))}
 h1{position:absolute;left:0;right:0;top:300px;text-align:center;font-size:100px;font-weight:800;letter-spacing:.14em;white-space:nowrap;
   background:linear-gradient(168deg,#f6e5ae 15%,#D9A94C 55%,#F0CE7E 85%);-webkit-background-clip:text;background-clip:text;color:transparent;
   filter:drop-shadow(0 0 22px rgba(240,206,126,.35)) drop-shadow(0 3px 10px rgba(0,0,0,.7))}
 .sub{position:absolute;left:0;right:0;top:650px;text-align:center;font-size:28px;letter-spacing:.12em;color:#E8E4D8;white-space:nowrap}
 .url{position:absolute;left:50%;top:770px;transform:translateX(-50%);font-size:30px;letter-spacing:.04em;color:#F0CE7E;white-space:nowrap;
   border:2px solid #6D5A33;border-radius:12px;padding:20px 30px}
 .note{position:absolute;left:0;right:0;top:880px;text-align:center;font-size:24px;letter-spacing:.10em;color:#9D93B5;white-space:nowrap}
 .credit{position:absolute;left:0;right:0;bottom:66px;font-size:20px;letter-spacing:.10em;color:#9D93B5;text-align:center;line-height:1.8}
</style>
 <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="#C93A2E" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="167 84" transform="rotate(-58 50 50)" opacity=".85"/></svg>
 <h1>御霊おとし</h1>
 <div class="sub">壺に落として、浄化して。</div>
 <div class="url">waiwai.town/apps/mitama-otoshi</div>
 <div class="note">ブラウザでそのまま遊べます・全国番付つき</div>
 <div class="credit">『月蝕綺譚 -Luna Occulta-』二次創作ファンゲーム<br>公式とは関係ありません</div>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const p = await b.newPage();
  const shot = async (html, file, w, h, transparent) => {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: "load" });
    await p.evaluate(async () => { await document.fonts.ready; });
    await new Promise((r) => setTimeout(r, 400));   // 字体が実際に差し替わるまで待つ
    // 文字のはみ出しを数える（white-space:nowrap の要素が 720 を越えていないか）
    const over = await p.evaluate(() => [...document.querySelectorAll("h1,.m,.s,.c,.sub,.url,.note,.line")].filter((e) => { const r = e.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(e); const t = range.getBoundingClientRect(); return t.left < 0 || t.right > 720; }).map((e) => e.textContent));
    await p.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent });
    console.log("📇 " + file + (over.length ? "  ⚠ はみ出し: " + over.join(" / ") : ""));
  };
  await shot(telop("同じ御霊を重ねて、一段上へ", "なぞって狙い、離して落とす"), "telop_a.png", 720, 200, true);
  await shot(telop("満月がふたつ重なれば——", ""), "telop_b.png", 720, 200, true);
  await shot(voice("「さ、開けるよ。」"), "voice_1.png", 720, 200, true);
  await shot(voice("「夜明けまでは、あたしが付き合う」"), "voice_2.png", 720, 200, true);
  for (const [i, k] of LADDER.entries()) await shot(fuda(k), `m_${i + 1}.png`, 720, 1280, false);
  await shot(copy, "m_copy.png", 720, 1280, true);
  await shot(endcard, "endcard.png", 720, 1280, false);
  await b.close();
})();

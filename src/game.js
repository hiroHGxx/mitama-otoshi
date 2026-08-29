// 御霊おとし — 月蝕綺譚 -Luna Occulta- 二次創作 落ち物パズル
// 物理: Matter.js / 描画: Canvas 2D

(() => {
  "use strict";

  const { Engine, World, Bodies, Body, Events, Composite } = Matter;

  // ---- 進化の階梯（小 → 大） ----
  const TIERS = [
    // 内環の色は各御霊の五行（公式設定・MCPで裏取り）: 火紅 #E0562F / 水青 #5FB4D9 / 木緑 #6FB069 / 金白金 #C6BFA8 / 土琥珀 #C08A3E
    { name: "ネム",   key: "nemu",   r: 18,  color: "#5FB4D9" },  // 甲賀・水
    { name: "於兎",   key: "oto",    r: 24,  color: "#C08A3E" },  // 甲賀・土
    { name: "餡音",   key: "anne",   r: 31,  color: "#6FB069" },  // 伊賀・木
    { name: "ネコマタ", key: "nekomata", r: 39, color: "#C6BFA8" },  // 雑賀・金
    { name: "弁天",   key: "benten", r: 48,  color: "#5FB4D9" },  // 雑賀・水
    { name: "宇迦",   key: "uka",    r: 58,  color: "#E0562F" },  // 甲賀・火
    { name: "イズナ", key: "izuna",  r: 70,  color: "#C6BFA8" },  // 甲賀・金
    { name: "紫苑",   key: "shion",  r: 84,  color: "#6FB069" },  // 伊賀・木
    { name: "咲耶",   key: "sakuya", r: 90,  color: "#E0562F" },  // 甲賀・火
    { name: "満月",   key: null,     r: 106, color: "#F0CE7E" },
  ];
  const POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
  const SPAWN_WEIGHTS = [30, 25, 20, 15, 10]; // tier 0-4

  // ---- 舞台 ----
  const W = 480, H = 720;
  const WALL = 14;             // 壺の壁の厚み
  const FLOOR_Y = H - 16;      // 壺の底（上面）
  const CUP_TOP = 150;         // 壺の縁
  const DROP_Y = 96;           // 落下待機の高さ
  const LOSE_Y = CUP_TOP - 4;  // この線より上で静止したら負け
  const DROP_COOLDOWN = 550;   // ms
  const GRACE_MS = 1200;       // 落下直後は負け判定しない

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- キャンバス ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = Math.min(devicePixelRatio || 1, 2);

  const mainEl = document.querySelector("main");
  function fitCanvas() {
    const box = mainEl.getBoundingClientRect();
    const scale = Math.min(box.width / W, box.height / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", fitCanvas);
  new ResizeObserver(fitCanvas).observe(mainEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCanvas);
  fitCanvas();

  // ---- 盤面背景（ゲーム開始後に読み込み、それまでは無地グラデ） ----
  const boardBg = new Image();
  function loadBoardBg() { if (!boardBg.src) boardBg.src = BOARD_BG; }

  // ---- 顔画像 ----
  const faces = {};
  let facesReady = false;
  {
    const keys = TIERS.filter(t => t.key).map(t => t.key);
    let loaded = 0;
    for (const k of keys) {
      const img = new Image();
      img.onload = () => { if (++loaded === keys.length) facesReady = true; };
      img.src = FACE_DATA[k];
      faces[k] = img;
    }
  }

  // ---- 物理エンジン ----
  // スリープ有効だと壁に接触した玉が空中で眠って「刺さる」ため無効化
  const engine = Engine.create({ enableSleeping: false });
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  const world = engine.world;

  // 見た目の壺: 壁の線は x=42..56 / 底の線は y=691..705 に描かれる。
  // 物理の内面はそれに 2px の余白を足して合わせ、めり込んで見えないようにする。
  const INSET = 2;
  const CUP_L = 30 + WALL + INSET;      // 物理の内側（左）
  const CUP_R = W - 30 - WALL - INSET;  // 物理の内側（右）
  const PHYS_FLOOR_TOP = FLOOR_Y - 13;  // 描画の底の上面に一致

  // 壁は摩擦を低くして、触れた玉が引っかからず滑り落ちるようにする
  const wallOpts = { isStatic: true, friction: 0.08, restitution: 0 };
  World.add(world, [
    Bodies.rectangle(W / 2, PHYS_FLOOR_TOP + 40, W, 80, wallOpts),  // 底
    // 物理壁は画面上端まで延長（縁に玉が乗るのを防ぐ）。厚みも増して貫通を防止
    Bodies.rectangle(CUP_L - 40, H / 2, 80, H, wallOpts),   // 左
    Bodies.rectangle(CUP_R + 40, H / 2, 80, H, wallOpts),   // 右
  ]);

  // ---- 状態 ----
  let started = false;       // タイトル画面の「月夜に入る」を押すまで false
  let pausedUntil = 0;       // カットイン等の演出中は物理を止める
  // 御霊図鑑: 公式の公開設定（kitan-lore MCPより。よみ・所属/五行・紹介文）
  const SPIRIT_INFO = {
    nemu:     { kana: "ねむ",     copy: "眠たげな猫の絵師。筆が走れば、極彩色が目を覚ます。" },
    oto:      { kana: "おと",     copy: "垂れ耳の月兎。その笑顔は満月より明るく、その拳は地を揺らす。" },
    anne:     { kana: "あんね",   copy: "赤いマフラーの看板娘。団子と笑顔で、夜と人の縁を結ぶ。" },
    nekomata: { kana: "ねこまた", copy: "妖刀村正を飼い慣らす化け猫の剣客。二太刀は無駄、急所に一太刀。" },
    benten:   { kana: "べんてん", copy: "川端の弁天堂に唄を奉じる、水辺の唄い手。三味線ひとつで、忘れられた唄を今宵も。" },
    uka:      { kana: "うか",     copy: "九つの尾に焔を灯す金狐。姉譲りの神通を、まだ持て余している。" },
    izuna:    { kana: "いずな",   copy: "黒狐の巫女。その神通は傷を癒し、夜すら宥める。" },
    shion:    { kana: "しおん",   copy: "影に咲く夜叉薊。言葉は少なく、刃は深く。" },
    sakuya:   { kana: "さくや",   copy: "緋桜を纏う甲賀の剣士。ひと太刀ごとに、夜へ春が散る。" },
  };
  const TIER_TAGS = ["甲賀・水", "甲賀・土", "伊賀・木", "雑賀・金", "雑賀・水", "甲賀・火", "甲賀・金", "伊賀・木", "甲賀・火", "階梯の果て"];
  const MOON_INFO = { kana: "まんげつ", copy: "御霊を重ねた先に生まれる、喰われた月の還り姿。ふたつ重なれば——皆既月蝕。" };

  // 称号: そのプレイの最高到達で決まる（皆既月蝕は別格）
  const TITLES = [
    "宵の口",
    "夜歩きの見習い",
    "夜歩きの手習い",
    "浄化の手練れ",
    "浄夜の導き手",
    "五行の使い手",
    "夜番の頭",
    "月導の行者",
    "緋桜の同志",
    "満月成就",
  ];
  const ECLIPSE_TITLE = "蝕を見届けた者";
  let eclipseThisRun = false;

  const pendingEclipses = []; // 皆既月蝕: 月×2を触れ合ったまま見せてから消す
  const pendingPurges = [];   // 月光の浄化: 満月誕生時に小さな御霊を消す
  let flashUntil = 0;        // 満月・皆既月蝕の画面フラッシュ演出
  let flashColor = "#F0CE7E";
  // ---- セーブ（わいわいタウンの枠の中でも消えないようにする） ----
  // 第三者iframe（わいわいタウンのサイト内プレイ）ではゲーム自身の localStorage が保持されない。
  // iPhone の Safari・Chrome の両方で実害を確認（枠の中から遊ぶとアプリ終了で最高得点がゼロに戻る／
  // Pages を直に開くと残る）。わいわいSDK の save/load は親ページ側へ代理保存するので主経路にし、
  // SDK が無い・読めない・応答しないときは今までどおりこのページの localStorage を直に使う
  // （Artifact 版は CSP で sdk.js が読めない＝window.waiwai がそもそも無い）。
  // 仕様の正本: https://waiwai.town/llms.txt「セーブデータの保全（わいわいSDK）」
  const SAVE_KEY = "mitama_save";
  const SAVE_TIMEOUT_MS = 2500; // ランキングの RANK_TIMEOUT_MS と同じ考え方（相手を待ちすぎない）
  const LEGACY_KEYS = {
    best: "mitama_best",
    dexMax: "mitama_dex_max",
    title: "mitama_title",
    titleRank: "mitama_title_rank",
    sound: "mitama_sound",
  };
  const TIMED_OUT = {}; // Promise.race の勝者が「時間切れ」であることの印

  // 記録の実体。best / dexMax / titleRank は増える一方なので、どの経路から読んでも大きいほうを採る
  // ＝片方が古くても記録が後退しない（移行と自己修復を同じ規則で兼ねる）。
  const saveData = { best: 0, dexMax: 4, title: "", titleRank: -1, sound: "on" };
  let saveResolve;
  const saveLoaded = new Promise((res) => { saveResolve = res; });
  let saveUseSdk = false;  // わいわい側の記録を読めた夜だけ true（読めていないのに書くと相手を潰す）
  let soundChosen = false; // タイトルの2択で決めたあとは、遅れて届いた記録で上書きしない

  // わいわいSDK の呼び出しの芯。例外・拒否・無応答のどれでも { ok:false } を返し、
  // 握りつぶさず warn は残す（2026-08-26「CSPで止まったのに静かに落ちていた」の轍を踏まない）。
  function waiwaiTry(fn, label, ms) {
    let call;
    try {
      call = fn();
    } catch (e) {
      console.warn("[waiwai] " + label + " を呼べなかった", e);
      return Promise.resolve({ ok: false });
    }
    const timeout = new Promise((res) => setTimeout(() => res(TIMED_OUT), ms));
    return Promise.race([Promise.resolve(call), timeout]).then(
      (v) => {
        if (v === TIMED_OUT) {
          console.warn("[waiwai] " + label + " が " + ms + "ms 以内に返らなかった");
          return { ok: false };
        }
        return { ok: true, value: v };
      },
      (e) => {
        console.warn("[waiwai] " + label + " が失敗した", e);
        return { ok: false };
      }
    );
  }

  function mergeSave(o) {
    if (!o || typeof o !== "object") return;
    const num = (v) => (typeof v === "number" && isFinite(v) ? Math.floor(v) : null);
    const b = num(o.best);
    if (b !== null) saveData.best = Math.max(saveData.best, Math.max(0, b));
    const d = num(o.dexMax);
    if (d !== null) saveData.dexMax = Math.max(saveData.dexMax, Math.min(TIERS.length - 1, d));
    const r = num(o.titleRank);
    if (r !== null && r > saveData.titleRank && typeof o.title === "string" && o.title) {
      saveData.titleRank = r;
      saveData.title = o.title.slice(0, 40);
    }
    if (o.sound === "off" || o.sound === "on") saveData.sound = o.sound; // 好みは後から読んだ側が勝つ
  }

  // 旧キー（このページ自身の localStorage）。移行元であり、SDK が使えない夜の置き場でもある。
  function readLegacy() {
    const d = {};
    try {
      const raw = {
        best: localStorage.getItem(LEGACY_KEYS.best),
        dexMax: localStorage.getItem(LEGACY_KEYS.dexMax),
        title: localStorage.getItem(LEGACY_KEYS.title),
        titleRank: localStorage.getItem(LEGACY_KEYS.titleRank),
        sound: localStorage.getItem(LEGACY_KEYS.sound),
      };
      d.__found = Object.keys(raw).some((k) => raw[k] !== null);
      if (raw.best !== null) d.best = +raw.best;
      if (raw.dexMax !== null) d.dexMax = +raw.dexMax;
      if (raw.title) d.title = raw.title;
      if (raw.titleRank !== null) d.titleRank = +raw.titleRank;
      if (raw.sound !== null) d.sound = raw.sound === "off" ? "off" : "on";
    } catch (e) {
      console.warn("[save] localStorage を読めなかった", e);
    }
    return d;
  }
  function writeLegacy() {
    try {
      localStorage.setItem(LEGACY_KEYS.best, saveData.best);
      localStorage.setItem(LEGACY_KEYS.dexMax, saveData.dexMax);
      localStorage.setItem(LEGACY_KEYS.sound, saveData.sound);
      if (saveData.title) {
        localStorage.setItem(LEGACY_KEYS.title, saveData.title);
        localStorage.setItem(LEGACY_KEYS.titleRank, saveData.titleRank);
      }
    } catch (e) {
      console.warn("[save] localStorage へ書けなかった", e);
    }
  }
  function dropLegacy() {
    // 公式の推奨手順「旧キーを読む → waiwai.save で書く → 旧キーを消す」の最後の一歩。
    // save が成功したときだけ呼ぶ（先に消すと、書けなかったときに記録が消える）。
    try {
      for (const k of Object.keys(LEGACY_KEYS)) localStorage.removeItem(LEGACY_KEYS[k]);
    } catch (e) {}
  }

  // 記録を書く。呼び出し側は await しない（画面を待たせない）。
  function persistSave() {
    return saveLoaded.then(() => {
      if (!saveUseSdk) {
        writeLegacy();
        return false;
      }
      return waiwaiTry(
        () => window.waiwai.save(SAVE_KEY, {
          best: saveData.best,
          dexMax: saveData.dexMax,
          title: saveData.title,
          titleRank: saveData.titleRank,
          sound: saveData.sound,
        }),
        "save(" + SAVE_KEY + ")",
        SAVE_TIMEOUT_MS
      ).then((r) => {
        if (!r.ok) writeLegacy(); // 書けなかった夜も、せめてこのブラウザには残す
        return r.ok;
      });
    }).catch((e) => {
      console.warn("[save] 書き込みでつまずいた", e);
      return false;
    });
  }

  (function loadSave() {
    const legacy = readLegacy();
    if (!window.waiwai) {
      console.warn("[save] わいわいSDK が読めていないので、このページの localStorage を直に使う");
      mergeSave(legacy);
      saveResolve();
      return;
    }
    waiwaiTry(() => window.waiwai.load(SAVE_KEY), "load(" + SAVE_KEY + ")", SAVE_TIMEOUT_MS).then((r) => {
      if (!r.ok) {
        // 読めていない状態で書くと、向こうにある記録を低い値で潰しかねない。この夜は書かない。
        console.warn("[save] わいわい側の記録を読めなかった。この夜は localStorage だけを使う");
        mergeSave(legacy);
        saveResolve();
        return;
      }
      saveUseSdk = true;
      mergeSave(legacy);   // 旧キー（移行元）
      mergeSave(r.value);  // わいわい側の記録。数は大きいほうが残り、音の好みは後から読んだこちらが勝つ
      saveResolve();
      if (legacy.__found) persistSave().then((ok) => { if (ok) dropLegacy(); });
    });
  })();

  let score = 0;
  let best = 0;
  let maxTier = 0;
  let currentTier = pickTier();
  let nextTier = pickTier();
  let aimX = W / 2;
  let canDrop = true;
  let gameOver = false;
  let overSince = 0;
  const mergeQueue = [];
  const particles = [];
  const floaters = [];
  const petals = [];       // 舞い散る桜の花びら（環境演出）
  let lastPetalAt = 0;
  const dust = [];         // 闇にただよう金泥の塵（環境演出）

  function pickTier() {
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
      if ((r -= SPAWN_WEIGHTS[i]) < 0) return i;
    }
    return 0;
  }

  function spawnBody(tier, x, y, vx = 0, vy = 0) {
    const t = TIERS[tier];
    const b = Bodies.circle(x, y, t.r, {
      restitution: 0.12,
      friction: 0.25,
      frictionStatic: 0.6,
      density: 0.0012,
    });
    b.tier = tier;
    b.bornAt = performance.now();
    b.merging = false;
    Body.setVelocity(b, { x: vx, y: vy });
    World.add(world, b);
    return b;
  }

  // ---- 音（効果音は WebAudio 生成・BGM は公式メインテーマ） ----
  let audioCtx = null;
  let soundOn = true; // 実際の値は saveLoaded の後に入る（waiwai.load は非同期のため）
  const BGM_VOL = 0.16;      // BGMは控えめに、効果音を主役にする
  const BGM_DUCK_VOL = 0.07; // 台詞が鳴っている間のBGM音量（月影とびと同値）
  const bgm = new Audio(BGM_DATA);
  bgm.loop = true;
  bgm.volume = BGM_VOL;

  const SFX_BUS = 0.9;       // 効果音バスの素の大きさ
  const SFX_DUCK = 0.45;     // 台詞が鳴っている間の倍率（約 -7dB。式札かさね・月影とびと同値）
  let sfxBus = null;   // 効果音のマスターゲイン
  let voiceBus = null; // 台詞は sfxBus を通さない（台詞の間だけ効果音を沈めるため）
  let kotoMainBuf = null; // 実サンプル琴（単音・基音 KOTO_MAIN_HZ）
  let kotoHighBuf = null; // 実サンプル琴（高音の装飾フレーズ・固定ピッチ）
  let voiceBuf = null;    // 開幕の台詞（咲耶）
  const KOTO_MAIN_HZ = 196.5;
  // 音源のバイト列を取り出す。Artifact 版は build-dist.js が音源を data URI に埋め込むが、
  // Artifact の CSP は data: への fetch を止めるため、そのままでは実サンプルが届かず
  // 琴が合成音のフォールバックのまま鳴り続けてしまう。data: のときは atob で自前に復号する。
  const byteCache = {};
  function fetchBytes(url) {
    if (byteCache[url]) return byteCache[url];
    const p = url.startsWith("data:")
      // 復号はタップの処理を止めないよう次のタスクへ回す
      ? Promise.resolve().then(() => {
          const bin = atob(url.slice(url.indexOf(",") + 1));
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr.buffer;
        })
      : fetch(url).then(r => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.arrayBuffer();
        });
    // 失敗した取り寄せは控えから外す＝あとで initAudio が呼ばれたときに一度やり直せる
    byteCache[url] = p.catch(e => { delete byteCache[url]; throw e; });
    return byteCache[url];
  }
  // 開幕の台詞は「月夜に入る」を押した 0.35 秒後に鳴る。押してから取り寄せ始めると
  // 初回訪問では間に合わない（式札かさねの SPEC に同じ記述がある）。ページを開いた時点で取り始める。
  // dist/artifact.html は data URI ＝ atob が即時に済むので、先読みせず遅延のままでよい。
  if (!VOICE_START_DATA.startsWith("data:")) {
    fetchBytes(VOICE_START_DATA).catch(e => console.warn("[voice] 開幕の台詞を取り寄せられなかった", e));
  }
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        sfxBus = audioCtx.createGain();
        sfxBus.gain.value = SFX_BUS;
        sfxBus.connect(audioCtx.destination);
        // 台詞のバスは sfxBus と同じここで作る。再生時に遅延生成すると、AudioContext と
        // 同時に鳴りはじめる開幕の台詞に間に合わず「開幕だけ沈まない」が起きる（式札かさねの実例）
        voiceBus = audioCtx.createGain();
        voiceBus.gain.value = SFX_BUS; // 台詞側のゲインは 1.0 のまま＝出力は現状のSE群と同等
        voiceBus.connect(audioCtx.destination);
        // 琴サンプルを非同期で読み込む。届くまでは合成音（Karplus-Strong）で代用
        const load = (url, set, label) => fetchBytes(url)
          .then(ab => audioCtx.decodeAudioData(ab))
          .then(set)
          .catch(e => console.warn("[audio] " + label + " を用意できなかった", e));
        load(KOTO_MAIN_DATA, b => { kotoMainBuf = b; }, "琴（単音）");
        load(KOTO_HIGH_DATA, b => { kotoHighBuf = b; }, "琴（装飾句）");
        load(VOICE_START_DATA, b => { voiceBuf = b; }, "開幕の台詞");
      }
    }
  }

  // ---- 開幕の台詞（咲耶）----
  // 台詞は voiceBus へ流し、鳴っている間だけ効果音とBGMを沈める。琴は「浄化」の唯一の報酬で
  // 毎タップ鳴るため、一律に下げず台詞の間だけ沈める（設計と実測は docs/VOICE.md「音量の設計」）。
  const activeVoices = new Set(); // ♪ で消したときに途中で止められるよう追う
  function playVoice() {
    if (!audioCtx || !soundOn || !voiceBuf || !voiceBus) return false;
    const src = audioCtx.createBufferSource();
    src.buffer = voiceBuf;
    const g = audioCtx.createGain();
    g.gain.value = 1.0; // 台詞は聞き取りやすさ優先で前に出す
    src.connect(g).connect(voiceBus);
    const t = audioCtx.currentTime + 0.02;
    activeVoices.add(src);
    src.onended = () => activeVoices.delete(src);
    src.start(t);
    duckForVoice(t, voiceBuf.duration);
    return true;
  }
  // 復号が間に合わなかったときだけ、短い間（0.8秒）だけ待って鳴らす。
  // 間に合わなければ諦める＝扉も盤面も何も変わらない
  function playVoiceWhenReady(waitLeftMs) {
    if (!soundOn || !audioCtx) return;
    if (playVoice()) return;
    if (waitLeftMs <= 0) { console.warn("[voice] 開幕の台詞が間に合わなかった（音源が届いていない）"); return; }
    setTimeout(() => playVoiceWhenReady(waitLeftMs - 80), 80);
  }
  // BGM は HTMLAudio の一本道。ゲイン曲線が使えないので短い階段で寄せる（急に戻すと段差が聞こえる）
  let bgmFade = null;
  function bgmTo(target, ms) {
    if (bgmFade) { clearInterval(bgmFade); bgmFade = null; }
    const from = bgm.volume;
    const t0 = performance.now();
    bgmFade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      try { bgm.volume = from + (target - from) * k; } catch (e) {}
      if (k >= 1) { clearInterval(bgmFade); bgmFade = null; }
    }, 40);
  }
  let duckTimer = null;
  function duckForVoice(startAt, dur) {
    if (sfxBus) {
      const g = sfxBus.gain;
      g.cancelScheduledValues(startAt);
      g.setTargetAtTime(SFX_BUS * SFX_DUCK, startAt, 0.05);                        // 0.15秒ほどで沈む
      g.setTargetAtTime(SFX_BUS, Math.max(startAt + 0.1, startAt + dur - 0.2), 0.12); // 語尾にかけて戻す
    }
    bgmTo(BGM_DUCK_VOL, 150);
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = setTimeout(() => { duckTimer = null; bgmTo(BGM_VOL, 400); }, Math.max(0, dur * 1000 - 200));
  }
  // ♪ で音を消したら、鳴っている台詞を止めて沈めた分もその場で戻す
  function stopVoices() {
    for (const s of activeVoices) { try { s.stop(); } catch (e) {} }
    activeVoices.clear();
    if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
    if (audioCtx && sfxBus) {
      const g = sfxBus.gain;
      g.cancelScheduledValues(audioCtx.currentTime);
      g.setTargetAtTime(SFX_BUS, audioCtx.currentTime, 0.05);
    }
    bgmTo(BGM_VOL, 200);
  }

  // --- 和楽器風の合成音 ---
  // 琴の爪弾き: Karplus-Strong 法（減衰する弦の物理モデル）をバッファに焼き込む
  const pluckCache = {};
  function pluckBuffer(freq) {
    const key = Math.round(freq);
    if (pluckCache[key]) return pluckCache[key];
    const sr = audioCtx.sampleRate;
    const len = Math.floor(sr * 1.1);
    const buf = audioCtx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1; // 弾いた瞬間のノイズ
    for (let i = N; i < len; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
    pluckCache[key] = buf;
    return buf;
  }
  function playBuffer(buf, gain, delay) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    const g = audioCtx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g).connect(sfxBus);
    src.start(t);
  }
  // 陰旋法（都節音階）: 和の響きになる音の並び
  const SCALE = [0, 1, 5, 7, 8];
  function scaleFreq(step) {
    const oct = Math.floor(step / SCALE.length);
    const semi = SCALE[step % SCALE.length] + oct * 12;
    return 220 * Math.pow(2, semi / 12);
  }
  // 実サンプルの音域制限: 弦サンプルは4倍速を超えると楽器らしさが崩れるので、
  // step 11（932Hz・変速率4.7）を上限に1オクターブ（5音）ずつ折り返す
  function noteFreq(step) {
    while (step > 11) step -= SCALE.length;
    return scaleFreq(step);
  }
  // 琴の一音: 実サンプルを変速再生。届いていなければ合成弦で代用
  function kotoPluck(freq, gain, delay) {
    if (!audioCtx || !soundOn) return;
    if (!kotoMainBuf) { playBuffer(pluckBuffer(freq), gain, delay); return; }
    const t = audioCtx.currentTime + (delay || 0);
    const rate = (freq / KOTO_MAIN_HZ) * (1 + (Math.random() - 0.5) * 0.008);
    const mk = (r, gg) => {
      const src = audioCtx.createBufferSource();
      src.buffer = kotoMainBuf;
      src.playbackRate.value = r;
      const g = audioCtx.createGain();
      g.gain.value = gg * (0.92 + Math.random() * 0.16); // 毎回の揺らぎで機械感を消す
      src.connect(g).connect(sfxBus);
      src.start(t);
    };
    mk(rate, gain);
    if (rate > 2.5) mk(rate / 2, gain * 0.4); // 高音は下のオクターブを薄く重ねて痩せを防ぐ
  }
  // 高音の装飾フレーズ: 固定ピッチ（曲のキー→都節Aへ合わせる 220/196.5 ≒ 1.12）
  function kotoKira(gain, delay) {
    if (!audioCtx || !soundOn || !kotoHighBuf) return;
    const t = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    src.buffer = kotoHighBuf;
    src.playbackRate.value = 1.12;
    const g = audioCtx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(sfxBus);
    src.start(t);
  }
  // 拍子木: 短いノイズを高めの帯域だけ通す
  function woodblock(delay) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * 0.06), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 6;
    const g = audioCtx.createGain();
    g.gain.value = 0.8;
    src.connect(bp).connect(g).connect(sfxBus);
    src.start(t);
  }
  // 鐘・太鼓用の単音（減衰つき正弦波）
  function toll(freq, dur, gain, delay, glideTo) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + dur);
  }

  // 鈴: 満月が盤面にある間、ちりんと薄く鳴る（緊張と期待）
  function sfxBell() {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime;
    [[2793, 0.030], [4186, 0.016], [5588, 0.008]].forEach(([f, amp]) => {
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.012);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.010);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g).connect(sfxBus);
      o.start(t);
      o.stop(t + 1.25);
    });
  }

  const sfxDrop = () => woodblock(0);
  const sfxMerge = (tier, chain) => {
    // 段位が上がるほど高い音の琴の爪弾き（二音で「つま弾き」感を出す）
    // 連鎖中は陰旋法のまま音階を駆け上がる
    if (!audioCtx) return;
    const up = Math.min(((chain || 1) - 1) * 2, 8);
    kotoPluck(noteFreq(tier + up), 0.9);
    kotoPluck(noteFreq(tier + up + 2), 0.5, 0.06);
    if (chain >= 2) kotoPluck(noteFreq(tier + up + 4), 0.35, 0.12);
    if (chain >= 3) kotoKira(0.3, 0.15); // 大連鎖には実録の装飾句を薄く添える
  };
  const sfxMoon = () => {
    // 琴のかき鳴らし＋高音のきらめき（太鼓・鐘は皆既月蝕専用にする）
    if (!audioCtx) return;
    [0, 2, 4, 5, 7].forEach((s, i) => kotoPluck(noteFreq(s + 5), 0.7, i * 0.09));
    kotoKira(0.5, 0.55);
  };
  // 風のうねり: ノイズをバンドパスに通して持ち上げる
  function windRise(dur, delay) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.001, t);
    g2.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.7);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g2).connect(sfxBus);
    src.start(t);
  }
  // 太鼓: 低い胴鳴り＋皮を打つ短いノイズ
  function taiko(delay, gain) {
    if (!audioCtx || !soundOn) return;
    toll(68, 0.5, gain || 0.55, delay, 40);        // 胴の重低音
    toll(165, 0.32, (gain || 0.55) * 0.7, delay, 95); // 面の音（スマホ可聴域）
    const t = audioCtx.currentTime + (delay || 0);
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, Math.floor(sr * 0.1), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    const g2 = audioCtx.createGain();
    g2.gain.value = 0.5;
    src.connect(lp).connect(g2).connect(sfxBus);
    src.start(t);
  }
  const sfxEclipse = () => {
    // 琴ベースで再構成（オシレータの重低音はスマホで鳴らないため、
    // 倍音の豊かな弦の音だけで組む）
    if (!audioCtx) return;
    // 柝（き）: 歌舞伎の「チョン、チョン」
    woodblock(0);
    woodblock(0.18);
    // 不穏な下降フレーズ
    [9, 7, 5, 4, 2].forEach((s, i) => kotoPluck(scaleFreq(s), 0.8, 0.4 + i * 0.11));
    // 重い低弦の二連（オクターブ重ねで太さを出す）
    kotoPluck(scaleFreq(0), 1.0, 1.05);
    kotoPluck(scaleFreq(0) / 2, 1.0, 1.07);
    kotoPluck(scaleFreq(1), 0.95, 1.45);
    kotoPluck(scaleFreq(1) / 2, 0.95, 1.47);
    // 締めの一撃（高音）
    kotoPluck(scaleFreq(10), 0.7, 1.85);
  };

  function applySound() {
    const btn = document.getElementById("mute");
    btn.classList.toggle("off", !soundOn);
    btn.textContent = soundOn ? "♪" : "♪";
    if (started) {
      if (soundOn) bgm.play().catch(() => {});
      else bgm.pause();
    }
    if (!soundOn) stopVoices(); // 台詞の途中で消したら、沈めた効果音も一緒に戻す
  }
  // ホーム画面に戻る・別タブに移るなど、画面が見えなくなったら音を止める
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      bgm.pause();
      if (audioCtx) audioCtx.suspend();
    } else {
      if (started && soundOn) bgm.play().catch(() => {});
      if (audioCtx) audioCtx.resume();
    }
  });
  addEventListener("pagehide", () => bgm.pause()); // iOS Safari の保険

  document.getElementById("mute").addEventListener("click", () => {
    soundOn = !soundOn;
    soundChosen = true;
    saveData.sound = soundOn ? "on" : "off";
    persistSave();
    applySound();
  });

  function drop() {
    if (!canDrop || gameOver || !started) return;
    if (performance.now() < pausedUntil) return; // 演出中は落とせない
    sfxDrop();
    const t = TIERS[currentTier];
    const x = Math.max(CUP_L + t.r + 2, Math.min(CUP_R - t.r - 2, aimX));
    spawnBody(currentTier, x, DROP_Y);
    currentTier = nextTier;
    nextTier = pickTier();
    canDrop = false;
    setTimeout(() => { canDrop = true; }, DROP_COOLDOWN);
  }

  // ---- 合体 ----
  // 連鎖を一瞬ずつ見せるため、合体直後の玉は MERGE_LOCK_MS の間は次の合体をしない。
  // ロック中に接触したペアも拾えるよう collisionActive（接触継続）でも判定する。
  const MERGE_LOCK_MS = 230;
  function tryMerge(ev) {
    if (gameOver) return; // 夜が明けたら合体も止める（記録を追い越させない）
    const now = performance.now();
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.tier === undefined || b.tier === undefined) continue;
      if (a.tier !== b.tier || a.merging || b.merging) continue;
      if (now < (a.mergeLockUntil || 0) || now < (b.mergeLockUntil || 0)) continue;
      a.merging = b.merging = true;
      mergeQueue.push([a, b]);
    }
  }
  Events.on(engine, "collisionStart", tryMerge);
  Events.on(engine, "collisionActive", tryMerge);

  // 連鎖: 因果ベースで判定する。合体で生まれた玉は親の連鎖深度+1を継承し、
  // 生まれて間もない（=熱い）うちに次の合体を引き起こしたときだけ連鎖が伸びる。
  // プレイヤーが落とした玉は深度0なので、タップ連打の同時多発浄化は連鎖にならない。
  const CHAIN_HOT_MS = 1600;
  const CHAIN_KANJI = ["", "", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  Events.on(engine, "afterUpdate", () => {
    while (mergeQueue.length) {
      const [a, b] = mergeQueue.pop();
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      const tier = a.tier;
      if (tier === TIERS.length - 1) {
        // 満月 ×2 → 皆既月蝕: 触れ合ったまま画面を止めて見せ、演出後に消す
        pendingEclipses.push({ a, b, mx, my, at: performance.now() + 1500 });
        showEclipse();
        sfxEclipse();
        continue;
      }
      World.remove(world, a);
      World.remove(world, b);
      {
        const nt = tier + 1;
        const nb = spawnBody(nt, mx, my);
        nb.mergeLockUntil = performance.now() + MERGE_LOCK_MS;
        score += POINTS[nt];
        if (nt > maxTier) { maxTier = nt; recordDexMax(); }
        addFloater(mx, my - TIERS[nt].r, "+" + POINTS[nt], TIERS[nt].color);
        goldBurst(mx, my, 14);
        const nowMs = performance.now();
        const hot = (body) => (body.chainDepth && nowMs - body.chainBornAt < CHAIN_HOT_MS) ? body.chainDepth : 0;
        const depth = Math.max(hot(a), hot(b)) + 1;
        nb.chainDepth = depth;
        nb.chainBornAt = nowMs;
        if (depth >= 2) {
          const k = CHAIN_KANJI[Math.min(depth, 10)];
          addChainBanner(k + "連浄化");
          goldBurst(mx, my, 6 + depth * 2);
        }
        sfxMerge(nt, depth);
        if (nt === TIERS.length - 1) {
          // 満月成就の見せ場
          addFloater(mx, my - TIERS[nt].r - 24, "満月成就", "#F0CE7E");
          goldBurst(mx, my, 40);
          showCutin();
          sfxMoon();
          // 月光の浄化: 三段目までの小さな御霊を最大4体、カットイン中に消す
          const smalls = Composite.allBodies(world)
            .filter(o => o.tier !== undefined && o.tier <= 2 && !o.merging)
            .slice(0, 4);
          for (const o of smalls) o.merging = true;
          if (smalls.length) pendingPurges.push({ bodies: smalls, at: performance.now() + 900 });
          flashUntil = performance.now() + 1400;
          flashColor = "#F0CE7E";
        }
      }
      updateHud();
    }
  });

  // ---- 演出 ----
  // 金泥の粒: 「金は面で塗らず、粒で灯す」（公式トンマナ）
  const GOLD_GRAINS = ["#F0CE7E", "#D9A94C", "#f6e5ae"];
  function goldBurst(x, y, n) {
    if (reducedMotion) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1,
        life: 1, color: GOLD_GRAINS[(Math.random() * GOLD_GRAINS.length) | 0],
      });
    }
  }
  function burst(x, y, color, n) {
    if (reducedMotion) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1,
        life: 1, color,
      });
    }
  }
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1 });
  }
  // 連鎖バナー: 掛け軸のような縦書き金文字。新しい連鎖で書き換わる
  let chainBanner = null;
  let moonOnBoard = false;  // 盤面に満月がある間は鈴の音が薄く鳴る
  let nextBellAt = 0;
  function addChainBanner(text) {
    chainBanner = { text, life: 1, bornAt: performance.now() };
  }

  // ---- 入力 ----
  function clientToWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }
  canvas.addEventListener("pointermove", (e) => {
    aimX = clientToWorldX(e.clientX);
  });
  canvas.addEventListener("pointerdown", (e) => {
    aimX = clientToWorldX(e.clientX);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (gameOver) return;
    aimX = clientToWorldX(e.clientX);
    drop();
  });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  // iOS Safari 対策: viewport の user-scalable=no を無視して
  // ダブルタップズーム／ピンチズームが発動するため、JSで直接抑止する
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350 && !e.target.closest("button")) {
      e.preventDefault(); // 連打をダブルタップズームにさせない
    }
    lastTouchEnd = now;
  }, { passive: false });
  // ピンチズーム抑止。**等倍のときだけ**塞ぐ。無条件に塞ぐと、いったん拡大に入った後
  // 戻すためのピンチまでこちらが止めてしまい、出口が無くなる（2026-08-29 実機報告）。
  // visualViewport が無い環境は 1 とみなす＝従来どおり常に抑止に落ちる。
  document.addEventListener("gesturestart", (e) => {
    const s = (window.visualViewport && window.visualViewport.scale) || 1;
    if (s <= 1.01) e.preventDefault();
  });

  document.getElementById("retry").addEventListener("click", restart);

  function restart() {
    for (const b of Composite.allBodies(world)) {
      if (b.tier !== undefined) World.remove(world, b);
    }
    nightId++; // 前の夜のランキング応答が、新しい夜の結果カードに遅れて出るのを防ぐ
    score = 0; maxTier = 0; gameOver = false; overSince = 0;
    chainBanner = null; moonOnBoard = false; eclipseThisRun = false;
    currentTier = pickTier(); nextTier = pickTier(); canDrop = true;
    document.getElementById("overlay").classList.remove("show");
    closeBanzuke(); // 番付を開いたまま「もう一夜」に戻ることは無いはずだが、閉じ残しを作らない
    updateHud();
  }

  // ---- 負け判定 ----
  function checkGameOver(now) {
    if (gameOver) return;
    let danger = false;
    for (const b of Composite.allBodies(world)) {
      if (b.tier === undefined) continue;
      if (now - b.bornAt < GRACE_MS) continue;
      if (b.position.y - TIERS[b.tier].r < LOSE_Y && b.speed < 0.35) {
        danger = true;
        break;
      }
    }
    if (danger) {
      if (!overSince) overSince = now;
      if (now - overSince > 2000) endGame();
    } else {
      overSince = 0;
    }
  }

  // ---- わいわいタウン 全国ランキング（あってもなくても遊びは変わらない） ----
  // SDK は page.html の <script src="https://waiwai.town/sdk.js" crossorigin="anonymous"> で読む。
  // タウンの中（iframe）＝全国ランキングに載る／タウンの外（GitHub Pages・itch 等）＝SDK が
  // このブラウザだけの自己ベスト保持に自動で落ちる／CSP で sdk.js が読めない（Claude Artifact）＝
  // window.waiwai がそもそも無い。**どの場合も結果カードは今までどおり出る**のが最優先。
  const RANK_BOARD = "main";
  // SDK 自身の待ち時間はハンドシェイク最大2秒＋要求ごと5秒（sdk.js の HELLO_TIMEOUT_MS /
  // REQUEST_TIMEOUT_MS）。結果カードをその7秒に付き合わせないよう、こちらで短く切る。
  const RANK_TIMEOUT_MS = 2500;
  const BANZUKE_LIMIT = 10; // 番付に載せる上位の人数
  let nightId = 0; // 「もう一夜」ごとに増える。応答が返ったとき、まだ同じ夜かを見る印

  const rankNum = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.floor(v) : null);
  const scoreNum = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null);

  // 呼び出しは必ずここを通す。例外・拒否・無応答のどれでも null を返し、握りつぶさず warn は残す
  // （2026-08-26 の「CSPで止まったのに静かに合成音へ落ちていた」の轍を踏まないため）。
  function waiwaiCall(fn, label) {
    if (!window.waiwai) return Promise.resolve(null);
    return waiwaiTry(fn, label, RANK_TIMEOUT_MS).then((r) => (r.ok ? r.value : null));
  }

  const rankEls = {
    box: document.getElementById("final-rank"),
    mark: document.getElementById("final-rank-mark"),
    line: document.getElementById("final-rank-line"),
  };

  // ---- 番付（全国ランキングの一覧・上位10人＋自分） ----
  // 開き方は御霊図鑑とまったく同じ（✕ と外側タップで閉じる）。作法を増やさない。
  // 中身は結果カードに順位を出したときに一緒に取り込んだ控えから描く＝押してから待たせない・
  // 押してから失敗する経路も作らない。取れていなければ入口（釦）自体が生えない。
  const bzEls = {
    box: document.getElementById("banzuke"),
    close: document.getElementById("bz-close"),
    sub: document.getElementById("bz-sub"),
    list: document.getElementById("bz-list"),
    gap: document.getElementById("bz-gap"),
    me: document.getElementById("bz-me"),
  };
  const banzuke = { entries: null, total: null, myRank: null, myScore: null };

  // 相手の応答は他人が入れた名前を含むので、必ず textContent で置く（innerHTML を使わない）。
  // 形が崩れている項目は静かに捨てる（1件も残らなければ entries は null ＝入口を出さない）。
  function normalizeEntries(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const e of list) {
      if (!e || typeof e !== "object") continue;
      const rank = rankNum(e.rank);
      const score = scoreNum(e.score);
      if (rank === null || score === null) continue;
      const raw = typeof e.name === "string" ? e.name.trim() : "";
      out.push({ rank: rank, name: (raw || "ナナシ").slice(0, 20), score: score });
      if (out.length >= BANZUKE_LIMIT) break;
    }
    out.sort((a, b) => a.rank - b.rank);
    return out.length ? out : null;
  }

  function bzRow(rank, name, score, isMe) {
    const li = document.createElement("li");
    li.className = "bz-row" + (rank <= 3 ? " top" : "") + (isMe ? " me" : "");
    if (isMe) li.setAttribute("aria-current", "true");
    const r = document.createElement("span");
    r.className = "bz-rank";
    r.textContent = rank;
    const n = document.createElement("span");
    n.className = "bz-name";
    n.textContent = name;
    const s = document.createElement("span");
    s.className = "bz-score";
    s.textContent = score;
    li.appendChild(r);
    li.appendChild(n);
    li.appendChild(s);
    return li;
  }

  function renderBanzuke() {
    const rows = banzuke.entries || [];
    bzEls.list.textContent = "";
    const inList = banzuke.myRank !== null && rows.some((e) => e.rank === banzuke.myRank);
    for (const e of rows) bzEls.list.appendChild(bzRow(e.rank, e.name, e.score, e.rank === banzuke.myRank));
    // 上位に居ない夜だけ、間を空けて自分の行を下に足す（居るときは二重に出さない）
    bzEls.me.textContent = "";
    const showMe = !inList && banzuke.myRank !== null && banzuke.myScore !== null;
    if (showMe) bzEls.me.appendChild(bzRow(banzuke.myRank, "あなた", banzuke.myScore, true));
    bzEls.me.hidden = !showMe;
    bzEls.gap.hidden = !showMe;
    if (banzuke.total !== null) {
      bzEls.sub.textContent = "";
      bzEls.sub.appendChild(document.createTextNode("全国 "));
      const em = document.createElement("em");
      em.textContent = banzuke.total;
      bzEls.sub.appendChild(em);
      bzEls.sub.appendChild(document.createTextNode("人"));
      bzEls.sub.hidden = false;
    } else {
      bzEls.sub.hidden = true;
    }
  }

  function openBanzuke() {
    if (!banzuke.entries) return; // 控えが無いのに開かない（入口も出ていないはずだが念のため）
    renderBanzuke();
    bzEls.box.classList.add("show");
  }
  function closeBanzuke() {
    bzEls.box.classList.remove("show");
  }
  bzEls.close.addEventListener("click", closeBanzuke);
  bzEls.box.addEventListener("click", (e) => { if (e.target === bzEls.box) closeBanzuke(); });

  function clearRankUI() {
    rankEls.box.hidden = true;
    rankEls.mark.hidden = true;
    rankEls.line.hidden = true;
    rankEls.line.textContent = "";
    banzuke.entries = null;
    banzuke.total = null;
    banzuke.myRank = null;
    banzuke.myScore = null;
    closeBanzuke();
  }

  // 取れたものだけ出す。取れなかった行は出さない（「取得できませんでした」も出さない）
  function showRankUI(rank, total, improved, entries, myScore) {
    let any = false;
    if (improved) {
      rankEls.mark.hidden = false;
      any = true;
    }
    if (rank !== null) {
      rankEls.line.textContent = "";
      // 上位の顔ぶれまで取れた夜だけ、行を釦で包んで番付への入口にする
      // （御霊図鑑の階梯と同じ手。押し所は釦側で確保する）。取れていなければ素の span のまま。
      const canOpen = entries !== null;
      const holder = document.createElement(canOpen ? "button" : "span");
      if (canOpen) {
        holder.type = "button";
        holder.className = "rank-open";
        holder.setAttribute("aria-label", "番付を見る");
        holder.addEventListener("click", openBanzuke);
        banzuke.entries = entries;
        banzuke.total = total;
        banzuke.myRank = rank;
        banzuke.myScore = myScore;
      }
      const em = document.createElement("em");
      em.textContent = rank;
      holder.appendChild(document.createTextNode("全国 "));
      holder.appendChild(em);
      holder.appendChild(document.createTextNode(
        " 位" + (total !== null && total >= rank ? " ／ " + total + "人中" : "")
      ));
      if (canOpen) {
        const mark = document.createElement("span");
        mark.className = "rank-open-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "›";
        holder.appendChild(mark);
      }
      rankEls.line.appendChild(holder);
      rankEls.line.hidden = false;
      any = true;
    }
    rankEls.box.hidden = !any;
  }

  // 応答の形（2026-08-29 に sdk.js と親側 static/play-score.js の実装で確認）:
  //   submitScore  タウン内 { ok, best, rank, improved } / タウン外 { ok, best, local:true, improved }
  //   getTopScores タウン内 { entries, total }           / タウン外 { entries, local:true }（total なし）
  //   getMyScore   タウン外 { best, local:true } または null（タウン内の非 null の形は未確認）
  // 順位は submitScore の rank を正本にする。getMyScore は rank が取れなかったときの保険で、
  // 形が未確認なので「数でなければ捨てる」読み方しかしない。
  async function reportScore(finalScore, tier, title, myNight) {
    if (!window.waiwai) {
      // 画面には何も出さないが、記録には残す。「静かに失敗して誰も気づかない」を作らないため
      console.warn("[waiwai] SDK が読めていないので全国順位は出さない（Artifact の CSP・読み込み失敗など）");
      return;
    }
    const res = await waiwaiCall(
      () => window.waiwai.submitScore(RANK_BOARD, finalScore, { tier: tier, title: title }),
      "submitScore"
    );
    if (nightId !== myNight) return; // もう次の夜が始まっている
    if (!res) return;                // 送れていない＝順位も総数も名乗らない
    let rank = rankNum(res.rank);
    const improved = res.improved === true;
    if (rank === null && !res.local) {
      const mine = await waiwaiCall(() => window.waiwai.getMyScore(RANK_BOARD), "getMyScore");
      if (nightId !== myNight) return;
      if (mine) rank = rankNum(mine.rank);
    }
    // 総数と番付の顔ぶれは同じ1回で取る（結果カードの「◯人中」と番付の中身は同じ応答の別の欄）。
    // 押してから取りにいかない＝開くのを待たせないし、押してから失敗する経路も生えない。
    let total = null;
    let entries = null;
    if (rank !== null) {
      const top = await waiwaiCall(
        () => window.waiwai.getTopScores(RANK_BOARD, BANZUKE_LIMIT),
        "getTopScores"
      );
      if (nightId !== myNight) return;
      if (top) {
        total = rankNum(top.total);
        entries = normalizeEntries(top.entries);
        if (entries === null) console.warn("[waiwai] 上位の顔ぶれが読めなかったので番付への入口は出さない");
      }
    }
    // 順位は自己ベストに対して付くので、自分の行に出す点も送信の応答が返した best を優先する
    const myScore = scoreNum(res.best) !== null ? scoreNum(res.best) : scoreNum(finalScore);
    showRankUI(rank, total, improved, entries, myScore);
  }

  function endGame() {
    gameOver = true;
    // あふれる直前に成立した浄化・皆既月蝕を先に清算してから記録を確定する。
    // 保留のまま凍らせると、プレイヤーが勝ち取った点を取り上げることになる。
    while (pendingPurges.length) {
      const { bodies } = pendingPurges.shift();
      for (const o of bodies) {
        score += POINTS[o.tier];
        World.remove(world, o);
      }
    }
    while (pendingEclipses.length) {
      const { a, b } = pendingEclipses.shift();
      World.remove(world, a);
      World.remove(world, b);
      score += 100;
      eclipseThisRun = true; // 称号「蝕を見届けた者」もここで確定する
    }
    best = Math.max(best, score);
    saveData.best = best;
    recordDexMax();  // saveData を書き換えるだけ
    saveBestTitle(); // 同上
    persistSave();   // 3つまとめて1回だけ書く（await しない）
    document.getElementById("final-title").textContent = currentTitle();
    document.getElementById("final-score").textContent = score;
    document.getElementById("final-tier").textContent = "頂：" + TIERS[maxTier].name;
    const fudaKey = TIERS[maxTier].key || "sakuya"; // 満月到達時は咲耶の札
    const fudaEl = document.getElementById("final-fuda");
    fudaEl.src = FUDA_ART[fudaKey];
    fudaEl.style.display = "block";
    clearRankUI(); // 前の夜の順位を残さない
    document.getElementById("overlay").classList.add("show");
    updateHud();
    // 記録を確定したあとに送る。await しない＝結果カードの表示も「もう一夜」も待たせない
    reportScore(score, maxTier, currentTitle(), nightId).catch((e) => {
      // ここに落ちるのは想定外（waiwaiCall は reject しない）。unhandledrejection にはしない
      console.warn("[waiwai] 順位の表示でつまずいた", e);
    });
  }

  // ---- 御霊図鑑 ----
  // 出現抽選に入る1〜5段は最初から閲覧可。6段以上は到達した段位まで解禁（localStorageに永続）
  let dexMax = 4; // 実際の値は saveLoaded の後に入る
  function recordDexMax() {
    if (maxTier > dexMax) {
      dexMax = maxTier;
      saveData.dexMax = dexMax;
    }
  }
  let dexOpen = false;
  let dexIndex = 0;
  const dexEls = {
    box: document.getElementById("dex"),
    fuda: document.getElementById("dex-fuda"),
    moon: document.getElementById("dex-moon"),
    name: document.getElementById("dex-name"),
    tag: document.getElementById("dex-tag"),
    copy: document.getElementById("dex-copy"),
    prev: document.getElementById("dex-prev"),
    next: document.getElementById("dex-next"),
  };
  function renderDex() {
    const t = TIERS[dexIndex];
    const unlocked = dexIndex <= dexMax;
    const isMoon = !t.key;
    dexEls.fuda.style.display = isMoon ? "none" : "block";
    dexEls.moon.style.display = isMoon ? "block" : "none";
    if (isMoon) {
      dexEls.moon.classList.toggle("locked", !unlocked);
    } else {
      dexEls.fuda.src = FUDA_ART[t.key];
      dexEls.fuda.classList.toggle("locked", !unlocked);
    }
    if (unlocked) {
      const info = isMoon ? MOON_INFO : SPIRIT_INFO[t.key];
      dexEls.name.innerHTML = "";
      dexEls.name.append(t.name);
      const small = document.createElement("small");
      small.textContent = info.kana;
      dexEls.name.append(small);
      dexEls.tag.textContent = TIER_TAGS[dexIndex];
      dexEls.copy.textContent = info.copy;
    } else {
      dexEls.name.textContent = "？？？";
      dexEls.tag.textContent = "";
      dexEls.copy.textContent = "この御霊には、まだ出会っていない。階梯を重ねて、夜の先へ。";
    }
    dexEls.prev.disabled = dexIndex === 0;
    dexEls.next.disabled = dexIndex === TIERS.length - 1;
  }
  function openDex(i) {
    dexIndex = i;
    dexOpen = true;
    renderDex();
    dexEls.box.classList.add("show");
  }
  function closeDex() {
    dexOpen = false;
    dexEls.box.classList.remove("show");
  }
  document.getElementById("dex-close").addEventListener("click", closeDex);
  dexEls.box.addEventListener("click", (e) => { if (e.target === dexEls.box) closeDex(); });
  dexEls.prev.addEventListener("click", () => { if (dexIndex > 0) { dexIndex--; renderDex(); } });
  dexEls.next.addEventListener("click", () => { if (dexIndex < TIERS.length - 1) { dexIndex++; renderDex(); } });

  // ---- 称号 ----
  function currentTitle() {
    return eclipseThisRun ? ECLIPSE_TITLE : TITLES[maxTier];
  }
  function saveBestTitle() {
    // 序列: 皆既月蝕(=10) > 段位。より高い誉れだけ上書き
    const rank = eclipseThisRun ? 10 : maxTier;
    if (rank > saveData.titleRank) {
      saveData.titleRank = rank;
      saveData.title = currentTitle();
    }
  }
  // タイトル画面: これまでの誉れ。#best-title は hidden で始まるので、読み終えてから一度だけ出す
  // ＝「無いものが出る」だけで「違う値が差し替わる」チラつきは起きない
  function showBestTitle() {
    const el = document.getElementById("best-title");
    if (!saveData.title) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = "";
    el.append("これまでの誉れ：");
    const em = document.createElement("em");
    em.textContent = saveData.title;
    el.append(em);
  }

  // 記録が届いたら画面に反映する。案内カードはこれを待ってから出る（下のオープニング）ので、
  // プレイヤーの目には「0点が出てから最高得点に差し替わる」瞬間が無い。
  saveLoaded.then(() => {
    best = Math.max(best, saveData.best);
    dexMax = Math.max(dexMax, saveData.dexMax);
    if (!soundChosen) {
      soundOn = saveData.sound !== "off";
      applySound();
    }
    showBestTitle();
    updateHud();
  });

  // ---- HUD ----
  // スコアは表示値が実値を追いかけて回る（カウントアップ）。加点時に軽くポップ。
  const scoreEl = document.getElementById("score");
  let shownScore = 0;
  // 階梯の現在地: 到達済みに reached・最高到達に current を付ける。
  // ボタンの実体は下の「進化の階梯」で作り、この配列に貯める。
  const ladderBtns = [];
  function updateLadder() {
    for (let i = 0; i < ladderBtns.length; i++) {
      ladderBtns[i].classList.toggle("reached", i <= maxTier);
      ladderBtns[i].classList.toggle("current", i === maxTier);
    }
  }
  function updateHud() {
    document.getElementById("best").textContent = best;
    updateLadder();
    if (score > shownScore) {
      scoreEl.classList.remove("bump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("bump");
    }
  }
  function tickScore() {
    if (shownScore === score) return;
    if (score < shownScore) shownScore = score; // リトライ時は即リセット
    else shownScore = Math.min(score, shownScore + Math.max(1, Math.ceil((score - shownScore) * 0.22)));
    scoreEl.textContent = shownScore;
  }
  updateHud();

  // ---- 描画 ----
  function drawMoon() {
    // 到達した最高段位に応じて、新月 → 三日月 → 半月 → 満月と満ちていく
    const cx = W / 2, cy = 250, R = 140;
    const f = maxTier / (TIERS.length - 1); // 0..1
    ctx.save();

    // 影の月（輪郭がうっすら見える下地）
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#F0CE7E";
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#F0CE7E";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 満ちた部分（右側から満ちる）
    if (f > 0) {
      ctx.globalAlpha = 0.32;
      if (f >= 1) {
        ctx.shadowColor = "#F0CE7E";
        ctx.shadowBlur = 40;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2); // 右の縁
      const rx = R * Math.abs(2 * f - 1);
      // f<0.5: 明暗の境界が右寄りに湾曲 / f>0.5: 左寄りに湾曲
      ctx.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, f <= 0.5);
      ctx.fillStyle = "#F0CE7E";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVessel() {
    ctx.save();
    const visL = CUP_L - INSET - WALL / 2, visR = CUP_R + INSET + WALL / 2;
    // 漆塗りの胴（上から下へ沈む色。紫がかった漆黒で深みを出す）
    const wg = ctx.createLinearGradient(0, CUP_TOP, 0, FLOOR_Y);
    wg.addColorStop(0, "#565073");
    wg.addColorStop(0.45, "#3b3458");
    wg.addColorStop(1, "#262040");
    ctx.strokeStyle = wg;
    ctx.lineWidth = WALL;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(visL, CUP_TOP);
    ctx.lineTo(visL, FLOOR_Y - 6);
    ctx.lineTo(visR, FLOOR_Y - 6);
    ctx.lineTo(visR, CUP_TOP);
    ctx.stroke();
    // 外縁の金の糸（蒔絵の縁取り）
    ctx.strokeStyle = "rgba(217, 169, 76, .35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(visL - WALL / 2 + 0.6, CUP_TOP);
    ctx.lineTo(visL - WALL / 2 + 0.6, FLOOR_Y - 6);
    ctx.moveTo(visR + WALL / 2 - 0.6, CUP_TOP);
    ctx.lineTo(visR + WALL / 2 - 0.6, FLOOR_Y - 6);
    ctx.moveTo(visL, FLOOR_Y - 6 + WALL / 2 - 0.6);
    ctx.lineTo(visR, FLOOR_Y - 6 + WALL / 2 - 0.6);
    ctx.stroke();
    // 金の稜線（内側のエッジ）
    ctx.strokeStyle = "rgba(217, 169, 76, .55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CUP_L, CUP_TOP);
    ctx.lineTo(CUP_L, FLOOR_Y - 13);
    ctx.lineTo(CUP_R, FLOOR_Y - 13);
    ctx.lineTo(CUP_R, CUP_TOP);
    ctx.stroke();
    // 縁の珠は金の玉に（やわらかな後光つき）
    for (const x of [visL, visR]) {
      const og = ctx.createRadialGradient(x, CUP_TOP, WALL * 0.5, x, CUP_TOP, WALL * 2.4);
      og.addColorStop(0, "rgba(240, 206, 126, .16)");
      og.addColorStop(1, "rgba(240, 206, 126, 0)");
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(x, CUP_TOP, WALL * 2.4, 0, Math.PI * 2);
      ctx.fill();
      const kg = ctx.createRadialGradient(x - 3, CUP_TOP - 3, 2, x, CUP_TOP, WALL);
      kg.addColorStop(0, "#F0CE7E");
      kg.addColorStop(1, "#8a744a");
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.arc(x, CUP_TOP, WALL * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(x, y, angle, tier, ghost, born) {
    const t = TIERS[tier];
    ctx.save();
    ctx.translate(x, y);
    if (ghost) ctx.globalAlpha = 0.85;
    // 生まれた瞬間にぽんっと膨らむ（連鎖の各段が目で追える）
    if (born) {
      const p = Math.min(1, (performance.now() - born) / 200);
      if (p < 1) {
        const s = 0.55 + 0.45 * p + 0.1 * Math.sin(p * Math.PI);
        ctx.scale(s, s);
      }
    }
    // 本体（象牙の玉のような地）
    ctx.beginPath();
    ctx.arc(0, 0, t.r, 0, Math.PI * 2);
    if (t.key) {
      const bgGrad = ctx.createRadialGradient(-t.r * 0.3, -t.r * 0.3, t.r * 0.2, 0, 0, t.r);
      bgGrad.addColorStop(0, "#fffdf7");
      bgGrad.addColorStop(1, "#efe4cd");
      ctx.fillStyle = bgGrad;
      ctx.fill();
      if (facesReady) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, t.r - 1.5, 0, Math.PI * 2);
        ctx.clip();
        const d = (t.r - 1.5) * 2;
        ctx.drawImage(faces[t.key], -d / 2, -d / 2, d, d);
        ctx.restore();
      }
    } else {
      // 満月: 脈動する金の後光（reduced-motion時は静かな光のみ）
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 640);
      const halo = ctx.createRadialGradient(0, 0, t.r * 0.72, 0, 0, t.r * 1.45);
      halo.addColorStop(0, "rgba(240, 206, 126, 0)");
      halo.addColorStop(0.6, `rgba(240, 206, 126, ${(0.08 + 0.10 * pulse).toFixed(3)})`);
      halo.addColorStop(1, "rgba(240, 206, 126, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, t.r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      // 本体のパスを引き直す（後光でパスを上書きしたため）
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      // 満月
      const g = ctx.createRadialGradient(-t.r * 0.25, -t.r * 0.25, t.r * 0.1, 0, 0, t.r);
      g.addColorStop(0, "#fff3c8");
      g.addColorStop(1, "#e8c96a");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = "rgba(180,150,80,.25)";
      for (const [cx2, cy2, cr] of [[-30, -10, 14], [22, 18, 10], [8, -34, 8], [-8, 30, 6]]) {
        ctx.beginPath();
        ctx.arc(cx2, cy2, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 上位の御霊は淡い光彩をまとう
    if (tier >= 5) {
      ctx.save();
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10 + tier * 2;
      ctx.beginPath();
      ctx.arc(0, 0, t.r - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // 内環（段位色）
    ctx.beginPath();
    ctx.arc(0, 0, t.r - 2.2, 0, Math.PI * 2);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 外環（金）
    const rim = ctx.createLinearGradient(-t.r, -t.r, t.r, t.r);
    rim.addColorStop(0, "#e8d49a");
    rim.addColorStop(0.5, "#8a744a");
    rim.addColorStop(1, "#d9bd7a");
    ctx.beginPath();
    ctx.arc(0, 0, t.r - 0.4, 0, Math.PI * 2);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 金の照り返し（右下・環境光のうつり込み）
    ctx.beginPath();
    ctx.arc(0, 0, t.r - 3.5, 0.55, 2.0);
    ctx.strokeStyle = "rgba(240, 206, 126, .20)";
    ctx.lineWidth = Math.max(1.2, t.r * 0.04);
    ctx.lineCap = "round";
    ctx.stroke();
    // 光沢（左上のつや）
    ctx.beginPath();
    ctx.arc(0, 0, t.r - 4.5, -2.35, -1.15);
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = Math.max(1.5, t.r * 0.05);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    ctx.clearRect(0, 0, W, H);

    // 夜空（生成背景。未ロード時は無地グラデ）
    if (boardBg.complete && boardBg.naturalWidth) {
      const ir = boardBg.naturalWidth / boardBg.naturalHeight;
      const cr = W / H;
      let dw = W, dh = H, dx = 0, dy = 0;
      if (ir > cr) { dw = H * ir; dx = (W - dw) / 2; }
      else { dh = W / ir; dy = (H - dh) / 2; }
      ctx.drawImage(boardBg, dx, dy, dw, dh);
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#12122a");
      bg.addColorStop(1, "#1c1836");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }

    drawMoon();

    // 金の塵: 闇の中を金泥の粒がゆっくり昇る（粒で灯す）
    if (!reducedMotion) {
      if (dust.length < 18 && Math.random() < 0.06) {
        dust.push({
          x: 20 + Math.random() * (W - 40), y: H + 6,
          vy: -(0.08 + Math.random() * 0.15), phase: Math.random() * Math.PI * 2,
          size: 0.8 + Math.random() * 1.5, a: 0.10 + Math.random() * 0.22,
        });
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.phase += 0.008;
        d.x += Math.sin(d.phase) * 0.25;
        d.y += d.vy;
        if (d.y < -8) { dust.splice(i, 1); continue; }
        ctx.globalAlpha = d.a * (0.65 + 0.35 * Math.sin(d.phase * 3));
        ctx.fillStyle = "#F0CE7E";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 桜の花びら: ときどき舞い込んでゆっくり落ちる
    if (!reducedMotion && now - lastPetalAt > 2100 && petals.length < 7) {
      lastPetalAt = now;
      petals.push({
        x: 60 + Math.random() * (W - 120), y: -14,
        vy: 0.32 + Math.random() * 0.25, phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.02,
        size: 5 + Math.random() * 3,
      });
    }
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.phase += 0.02;
      p.x += Math.sin(p.phase) * 0.5;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > H + 16) { petals.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#8E6B9E";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    drawVessel();

    // 負け線
    if (overSince && !gameOver) {
      ctx.strokeStyle = "rgba(229,100,122," + (0.4 + 0.3 * Math.sin(now / 120)) + ")";
    } else {
      ctx.strokeStyle = "rgba(240,232,216,.14)";
    }
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(CUP_L, LOSE_Y);
    ctx.lineTo(CUP_R, LOSE_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 待機中の御霊と照準
    if (!gameOver) {
      const t = TIERS[currentTier];
      const x = Math.max(CUP_L + t.r + 2, Math.min(CUP_R - t.r - 2, aimX));
      ctx.save();
      ctx.strokeStyle = "rgba(240,232,216,.12)";
      ctx.setLineDash([3, 9]);
      ctx.beginPath();
      ctx.moveTo(x, DROP_Y + t.r);
      ctx.lineTo(x, FLOOR_Y - 6);
      ctx.stroke();
      ctx.restore();
      drawBall(x, DROP_Y, 0, currentTier, !canDrop);
    }

    // 落下済みの御霊
    moonOnBoard = false;
    for (const b of Composite.allBodies(world)) {
      if (b.tier === undefined) continue;
      if (b.tier === TIERS.length - 1) moonOnBoard = true;
      drawBall(b.position.x, b.position.y, b.angle, b.tier, false, b.bornAt);
    }

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // スコア表示
    ctx.font = "700 15px 'Shippori Mincho', 'Hiragino Mincho ProN', serif";
    ctx.textAlign = "center";
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 0.7; f.life -= 0.018;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 連鎖バナー: 右肩に縦書きの金文字（掛け軸ふう）
    if (chainBanner) {
      const age = (now - chainBanner.bornAt) / 1400;
      if (age >= 1) { chainBanner = null; }
      else {
        const inP = Math.min(1, age * 6);              // すっと現れ
        const outP = age > 0.75 ? (1 - age) / 0.25 : 1; // ふっと消える
        ctx.save();
        ctx.globalAlpha = inP * outP;
        ctx.font = "800 30px 'Shippori Mincho B1', 'Hiragino Mincho ProN', serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#F0CE7E";
        ctx.shadowColor = "rgba(240, 206, 126, .55)";
        ctx.shadowBlur = 14;
        const bx = CUP_R - 34;
        let by = 236 - 8 * (1 - inP);
        for (const ch of chainBanner.text) {
          ctx.fillText(ch, bx, by);
          by += 34;
        }
        ctx.restore();
      }
    }

    // ビネット: 四隅をわずかに沈めて盤面を締める
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, "rgba(6,6,18,0)");
    vg.addColorStop(1, "rgba(6,6,18,.26)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 満月成就・皆既月蝕のフラッシュ
    if (now < flashUntil) {
      const p = (flashUntil - now) / 1400;
      ctx.globalAlpha = 0.35 * p;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---- 次の御霊プレビュー（DOM） ----
  const nextEl = document.getElementById("next-face");
  function updateNext() {
    const t = TIERS[nextTier];
    nextEl.style.borderColor = t.color;
    nextEl.src = FACE_DATA[t.key];
  }

  // ---- 進化の階梯（画面下の一覧） ----
  {
    const ladder = document.getElementById("ladder");
    TIERS.forEach((t, i) => {
      if (i > 0) {
        const s = document.createElement("span");
        s.className = "sep";
        s.textContent = "▸";
        ladder.appendChild(s);
      }
      const size = Math.round(16 + i * 1.6);
      let el;
      if (t.key) {
        el = document.createElement("img");
        el.src = FACE_DATA[t.key];
        el.alt = t.name;
      } else {
        el = document.createElement("span");
        el.className = "moon-tier";
        el.title = t.name;
      }
      el.style.width = el.style.height = size + "px";
      el.style.borderColor = t.color;
      // アイコン自体は段位ごとに大きさが変わる意匠なので、押し所は button 側で確保する
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ladder-btn";
      btn.setAttribute("aria-label", t.name + "の図鑑を開く");
      btn.addEventListener("click", () => openDex(i));
      btn.appendChild(el);
      ladder.appendChild(btn);
      ladderBtns.push(btn);
    });
    updateLadder();
  }

  // ---- 札絵（タイトル背景・カットイン・結果画面） ----
  // オープニング: 札絵だけを見せてから、案内カードを一段で出す。
  // 透過は通過点であって滞在地ではない（2026-08-29 オーナー裁定）。以前は 300ms で `peek` が付き
  // カードが 55% のまま約2.6秒とどまっていて、その間だけ文字が読みの床（コントラスト4.5）を割っていた。
  {
    const ov = document.getElementById("title-overlay");
    const bgEl = document.getElementById("title-bg");
    const keys = Object.keys(FUDA_ART);
    const bgKey = keys[Math.floor(Math.random() * keys.length)];
    // 起点は「ページを開いた時刻」。performance.now() はそこからの経過ミリ秒なので、
    // 札絵の読み込みが速い端末でも遅い端末でも狙いの時刻がずれない
    // （以前は img.onload 起点だったので、読み込みが遅いほどカードが後ろへずれていた）
    const ART_HOLD_MS = 1200;  // 札絵だけを見せる時間。カードはこの後 0.7 秒で 0% → 100%
    const showCard = () => ov.classList.add("ready");
    // 記録（最高得点・これまでの誉れ）を読み終えてから出す＝出てから値が差し替わるのを作らない。
    // saveLoaded は SAVE_TIMEOUT_MS 以内に必ず解決するので、待ちには上限がある。
    const revealCard = () => saveLoaded.then(showCard);
    const img = new Image();
    img.onload = () => {
      bgEl.style.backgroundImage = "url(" + FUDA_ART[bgKey] + ")";
      ov.classList.add("art-in");
      setTimeout(revealCard, Math.max(0, (reducedMotion ? 400 : ART_HOLD_MS) - performance.now()));
    };
    img.onerror = revealCard;                      // 札絵が出ないなら、待つ意味が無い
    img.src = FUDA_ART[bgKey];
    ov.addEventListener("pointerdown", revealCard); // タップで飛ばす
    setTimeout(showCard, 5000);                     // 読み込みが遅い場合の保険（無条件）
  }
  function showCutin() {
    const box = document.getElementById("cutin");
    // img要素を作り直してアニメwebpを毎回先頭から再生する。衣装はランダム
    const old = document.getElementById("cutin-img");
    const fresh = old.cloneNode();
    fresh.src = CUTIN_ARTS[(Math.random() * CUTIN_ARTS.length) | 0];
    old.replaceWith(fresh);
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 1750);
    pausedUntil = Math.max(pausedUntil, performance.now() + 1750);
  }
  function showEclipse() {
    const box = document.getElementById("eclipse");
    const img = document.getElementById("eclipse-img");
    if (!img.src) img.src = ECLIPSE_ART;
    // 火の粉: 表示のたびにランダム配置で作り直す
    const em = document.getElementById("e-embers");
    em.innerHTML = "";
    if (!reducedMotion) {
      for (let i = 0; i < 16; i++) {
        const sp = document.createElement("span");
        sp.style.left = (4 + Math.random() * 92) + "%";
        sp.style.setProperty("--dur", (1.5 + Math.random() * 0.9) + "s");
        sp.style.setProperty("--delay", (0.35 + Math.random() * 0.9) + "s");
        sp.style.setProperty("--sway", (Math.random() * 60 - 30) + "px");
        const sz = 3 + Math.random() * 4;
        sp.style.width = sp.style.height = sz + "px";
        em.appendChild(sp);
      }
    }
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 2400);
    pausedUntil = Math.max(pausedUntil, performance.now() + 2400);
    // 発動の瞬間、盤面が揺れる
    const m = document.querySelector("main");
    m.classList.remove("shake");
    void m.offsetWidth;
    m.classList.add("shake");
    setTimeout(() => m.classList.remove("shake"), 550);
  }
  function preloadFuda() {
    for (const k of Object.keys(FUDA_ART)) {
      const img = new Image();
      img.src = FUDA_ART[k];
    }
    for (const u of CUTIN_ARTS) new Image().src = u;
    new Image().src = ECLIPSE_ART;
  }

  // ---- 帳（とばり）----
  // 閉じた黒緞子が現れ、咲耶の「開けるよ。」を言い終えた間（0.64秒の休符）に拍子木とともに開く。
  // 台詞の刻みは実測（ffmpeg silencedetect）: 0.06〜0.36「さ、」／0.72〜1.28「開けるよ。」／
  // 1.28〜1.92 休符／1.92〜2.76「夜明けまでは、」／3.01〜4.01「あたしが付き合う。」
  const VOICE_AT_MS = 350;   // 台詞の開始（式札かさねと同じ 0.35 秒）
  const DOOR_OPEN_AT = 1650; // = 350 + 1280。「開けるよ。」の直後＝休符の頭で開きはじめる
  // 演出は視覚なので、音なしで入った人にも同じ時間割で開く
  function openDoor() {
    const door = document.getElementById("door");
    if (!door) return 0;
    // 開く速さは CSS 側（.door-half の transition）で決まる。reduced-motion は .35s
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moveMs = reduce ? 350 : 1500;
    door.classList.remove("open");
    door.classList.add("show");
    setTimeout(() => { door.classList.add("open"); woodblock(0); }, DOOR_OPEN_AT);
    setTimeout(() => door.classList.remove("show"), DOOR_OPEN_AT + moveMs + 100);
    return DOOR_OPEN_AT + moveMs; // 開ききるまでは落とせない
  }

  // ---- タイトル画面（音あり／音なしの2つの入口） ----
  function enterNight(withSound) {
    soundOn = withSound;
    soundChosen = true;
    saveData.sound = soundOn ? "on" : "off";
    persistSave();
    started = true;
    document.getElementById("title-overlay").classList.add("hidden");
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    applySound();
    fitCanvas();
    loadBoardBg();
    // 帳が開くまでは玉を落とせない（開始タップの名残がそのまま投下にならない意味も兼ねる）
    pausedUntil = performance.now() + openDoor();
    setTimeout(() => playVoiceWhenReady(800), VOICE_AT_MS);
    setTimeout(preloadFuda, 1200); // 遊びはじめの裏で札絵を先読み
  }
  document.getElementById("start").addEventListener("click", () => enterNight(true));
  document.getElementById("start-silent").addEventListener("click", () => enterNight(false));
  applySound(); // 音ボタンの初期表示

  // ---- 演出確認: ヘッダーのタイトルを素早く3回タップで咲耶ペアを召喚 ----
  {
    let taps = [];
    document.querySelector("header h1").addEventListener("pointerdown", () => {
      const now = performance.now();
      taps = taps.filter(t => now - t < 1500);
      taps.push(now);
      if (taps.length >= 3 && started && !gameOver) {
        taps = [];
        currentTier = 8; // 手持ちの玉が咲耶に変わる（狙って落とせる）
      }
    });
  }

  // ---- 演出確認モード（#test 付きで開くと咲耶が自動で降ってくる） ----
  // ゲーム開始後: 咲耶×2 → 満月成就（カットイン）、6秒後にもう一組 → 満月×2 → 皆既月蝕
  if (location.hash === "#test") {
    const waiter = setInterval(() => {
      if (!started) return;
      clearInterval(waiter);
      // 左右に置くだけでは2体が触れる保証が無く、先にできた満月に阻まれて
      // 離れたまま止まる（UT 2026-08-28 R-5）。内向きの初速で必ず寄せる。
      // y=280 は、床に着いた満月（上端 y=479）に重なって湧かない高さ。
      const pair = () => {
        spawnBody(8, CUP_L + 94, 280, 6, 0);
        spawnBody(8, CUP_R - 94, 280, -6, 0);
      };
      setTimeout(pair, 800);
      setTimeout(pair, 6500);
    }, 300);
  }

  // ---- 自動テスト（#autotest 付きで開くと自動で落とし続ける） ----
  if (location.hash === "#autotest") {
    // 記録を読み終えてから始める（HUD の「最高」が 0 から差し替わるのを作らない）
    saveLoaded.then(() => {
      started = true;
      document.getElementById("title-overlay").classList.add("hidden");
      setInterval(() => {
        aimX = CUP_L + 40 + Math.random() * (CUP_R - CUP_L - 80);
        drop();
      }, 700);
    });
  }

  // ---- メインループ ----
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(now - last, 33);
    last = now;
    while (pendingPurges.length && now >= pendingPurges[0].at) {
      const { bodies } = pendingPurges.shift();
      for (const o of bodies) {
        goldBurst(o.position.x, o.position.y, 10);
        score += POINTS[o.tier];
        World.remove(world, o);
      }
      if (bodies.length) {
        addFloater(W / 2, 260, "月光の浄化", "#F0CE7E");
        updateHud();
      }
    }
    while (pendingEclipses.length && now >= pendingEclipses[0].at) {
      const { a, b, mx, my } = pendingEclipses.shift();
      World.remove(world, a);
      World.remove(world, b);
      score += 100;
      eclipseThisRun = true;
      addFloater(mx, my, "皆既月蝕 +100", "#E0562F");
      burst(mx, my, "#E0562F", 50);
      flashUntil = now + 900;
      flashColor = "#8a1f3d";
      updateHud();
    }
    // 夜が明けたら盤面は止める。物理も合体も動いたままだと、結果カードで凍らせた得点を
    // ヘッダーが追い越して、同じ画面に別々の数字が出る（UT 2026-08-28 R-1）。
    if (now >= pausedUntil && !dexOpen && !gameOver) {
      Engine.update(engine, dt);
      checkGameOver(now);
    }
    updateNext();
    tickScore();
    if (moonOnBoard && !gameOver && now >= nextBellAt) {
      sfxBell();
      nextBellAt = now + 2600 + Math.random() * 900;
    }
    render(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

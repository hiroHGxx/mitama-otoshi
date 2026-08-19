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
  let score = 0;
  let best = 0;
  try { best = +(localStorage.getItem("mitama_best") || 0); } catch (e) {}
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
  let soundOn = true;
  try { soundOn = localStorage.getItem("mitama_sound") !== "off"; } catch (e) {}
  const bgm = new Audio(BGM_DATA);
  bgm.loop = true;
  bgm.volume = 0.16; // BGMは控えめに、効果音を主役にする

  let sfxBus = null; // 効果音のマスターゲイン
  function initAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        sfxBus = audioCtx.createGain();
        sfxBus.gain.value = 0.9;
        sfxBus.connect(audioCtx.destination);
      }
    }
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
    playBuffer(pluckBuffer(scaleFreq(tier + up)), 0.9);
    playBuffer(pluckBuffer(scaleFreq(tier + up + 2)), 0.5, 0.06);
    if (chain >= 2) playBuffer(pluckBuffer(scaleFreq(tier + up + 4)), 0.35, 0.12);
  };
  const sfxMoon = () => {
    // 琴のかき鳴らし＋高音のきらめき（太鼓・鐘は皆既月蝕専用にする）
    if (!audioCtx) return;
    [0, 2, 4, 5, 7].forEach((s, i) => playBuffer(pluckBuffer(scaleFreq(s + 5)), 0.7, i * 0.09));
    [0, 2, 4].forEach((s, i) => playBuffer(pluckBuffer(scaleFreq(s + 10)), 0.4, 0.55 + i * 0.12));
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
    [9, 7, 5, 4, 2].forEach((s, i) => playBuffer(pluckBuffer(scaleFreq(s)), 0.8, 0.4 + i * 0.11));
    // 重い低弦の二連（オクターブ重ねで太さを出す）
    playBuffer(pluckBuffer(scaleFreq(0)), 1.0, 1.05);
    playBuffer(pluckBuffer(scaleFreq(0) / 2), 1.0, 1.07);
    playBuffer(pluckBuffer(scaleFreq(1)), 0.95, 1.45);
    playBuffer(pluckBuffer(scaleFreq(1) / 2), 0.95, 1.47);
    // 締めの一撃（高音）
    playBuffer(pluckBuffer(scaleFreq(10)), 0.7, 1.85);
  };

  function applySound() {
    const btn = document.getElementById("mute");
    btn.classList.toggle("off", !soundOn);
    btn.textContent = soundOn ? "♪" : "♪";
    if (started) {
      if (soundOn) bgm.play().catch(() => {});
      else bgm.pause();
    }
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
    try { localStorage.setItem("mitama_sound", soundOn ? "on" : "off"); } catch (e) {}
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
  document.addEventListener("gesturestart", (e) => e.preventDefault()); // ピンチズーム抑止

  document.getElementById("retry").addEventListener("click", restart);

  function restart() {
    for (const b of Composite.allBodies(world)) {
      if (b.tier !== undefined) World.remove(world, b);
    }
    score = 0; maxTier = 0; gameOver = false; overSince = 0;
    chainBanner = null; moonOnBoard = false; eclipseThisRun = false;
    currentTier = pickTier(); nextTier = pickTier(); canDrop = true;
    document.getElementById("overlay").classList.remove("show");
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

  function endGame() {
    gameOver = true;
    best = Math.max(best, score);
    try { localStorage.setItem("mitama_best", best); } catch (e) {}
    recordDexMax();
    saveBestTitle();
    document.getElementById("final-title").textContent = currentTitle();
    document.getElementById("final-score").textContent = score;
    document.getElementById("final-tier").textContent = "頂：" + TIERS[maxTier].name;
    const fudaKey = TIERS[maxTier].key || "sakuya"; // 満月到達時は咲耶の札
    const fudaEl = document.getElementById("final-fuda");
    fudaEl.src = FUDA_ART[fudaKey];
    fudaEl.style.display = "block";
    document.getElementById("overlay").classList.add("show");
    updateHud();
  }

  // ---- 御霊図鑑 ----
  // 出現抽選に入る1〜5段は最初から閲覧可。6段以上は到達した段位まで解禁（localStorageに永続）
  let dexMax = 4;
  try { dexMax = Math.max(4, +(localStorage.getItem("mitama_dex_max") || 4)); } catch (e) {}
  function recordDexMax() {
    if (maxTier > dexMax) {
      dexMax = maxTier;
      try { localStorage.setItem("mitama_dex_max", dexMax); } catch (e) {}
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
    try {
      const prev = +(localStorage.getItem("mitama_title_rank") || -1);
      if (rank > prev) {
        localStorage.setItem("mitama_title_rank", rank);
        localStorage.setItem("mitama_title", currentTitle());
      }
    } catch (e) {}
  }
  // タイトル画面: これまでの誉れ
  try {
    const bt = localStorage.getItem("mitama_title");
    if (bt) {
      const el = document.getElementById("best-title");
      el.hidden = false;
      el.innerHTML = "";
      el.append("これまでの誉れ：");
      const em = document.createElement("em");
      em.textContent = bt;
      el.append(em);
    }
  } catch (e) {}

  // ---- HUD ----
  // スコアは表示値が実値を追いかけて回る（カウントアップ）。加点時に軽くポップ。
  const scoreEl = document.getElementById("score");
  let shownScore = 0;
  function updateHud() {
    document.getElementById("best").textContent = best;
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
      el.addEventListener("click", () => openDex(i));
      ladder.appendChild(el);
    });
  }

  // ---- 札絵（タイトル背景・カットイン・結果画面） ----
  // オープニング: 札絵を数秒フルで見せてから案内カードを出す（タップで飛ばせる）
  {
    const ov = document.getElementById("title-overlay");
    const bgEl = document.getElementById("title-bg");
    const keys = Object.keys(FUDA_ART);
    const bgKey = keys[Math.floor(Math.random() * keys.length)];
    const showCard = () => ov.classList.add("ready");
    const img = new Image();
    img.onload = () => {
      bgEl.style.backgroundImage = "url(" + FUDA_ART[bgKey] + ")";
      ov.classList.add("art-in");
      setTimeout(showCard, reducedMotion ? 400 : 2600);
    };
    img.onerror = showCard;
    img.src = FUDA_ART[bgKey];
    ov.addEventListener("pointerdown", showCard);  // タップで飛ばす
    setTimeout(showCard, 5000);                    // 読み込みが遅い場合の保険
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

  // ---- タイトル画面（音あり／音なしの2つの入口） ----
  function enterNight(withSound) {
    soundOn = withSound;
    try { localStorage.setItem("mitama_sound", soundOn ? "on" : "off"); } catch (e) {}
    started = true;
    document.getElementById("title-overlay").classList.add("hidden");
    initAudio();
    applySound();
    fitCanvas();
    loadBoardBg();
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
      const pair = () => {
        spawnBody(8, CUP_L + 102, 260);
        spawnBody(8, CUP_R - 102, 260);
      };
      setTimeout(pair, 800);
      setTimeout(pair, 6500);
    }, 300);
  }

  // ---- 自動テスト（#autotest 付きで開くと自動で落とし続ける） ----
  if (location.hash === "#autotest") {
    started = true;
    document.getElementById("title-overlay").classList.add("hidden");
    setInterval(() => {
      aimX = CUP_L + 40 + Math.random() * (CUP_R - CUP_L - 80);
      drop();
    }, 700);
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
    if (now >= pausedUntil && !dexOpen) {
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

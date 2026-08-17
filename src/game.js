// 御霊おとし — 月蝕綺譚 -Luna Occulta- 二次創作 落ち物パズル
// 物理: Matter.js / 描画: Canvas 2D

(() => {
  "use strict";

  const { Engine, World, Bodies, Body, Events, Composite } = Matter;

  // ---- 進化の階梯（小 → 大） ----
  const TIERS = [
    { name: "ネム",   key: "nemu",   r: 18,  color: "#6ec6ff" },
    { name: "於兎",   key: "oto",    r: 24,  color: "#c9a15e" },
    { name: "餡音",   key: "anne",   r: 31,  color: "#7ac074" },
    { name: "ネコマタ", key: "nekomata", r: 39, color: "#e89a3c" },
    { name: "弁天",   key: "benten", r: 48,  color: "#66d1c1" },
    { name: "宇迦",   key: "uka",    r: 58,  color: "#f08c5a" },
    { name: "イズナ", key: "izuna",  r: 70,  color: "#d9c86a" },
    { name: "紫苑",   key: "shion",  r: 84,  color: "#9a7fd1" },
    { name: "咲耶",   key: "sakuya", r: 100, color: "#f06292" },
    { name: "満月",   key: null,     r: 120, color: "#f2d98c" },
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
  const CUP_L = 42 + WALL + INSET;      // 物理の内側（左）
  const CUP_R = W - 42 - WALL - INSET;  // 物理の内側（右）
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

  function drop() {
    if (!canDrop || gameOver) return;
    const t = TIERS[currentTier];
    const x = Math.max(CUP_L + t.r + 2, Math.min(CUP_R - t.r - 2, aimX));
    spawnBody(currentTier, x, DROP_Y);
    currentTier = nextTier;
    nextTier = pickTier();
    canDrop = false;
    setTimeout(() => { canDrop = true; }, DROP_COOLDOWN);
  }

  // ---- 合体 ----
  Events.on(engine, "collisionStart", (ev) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.tier === undefined || b.tier === undefined) continue;
      if (a.tier !== b.tier || a.merging || b.merging) continue;
      a.merging = b.merging = true;
      mergeQueue.push([a, b]);
    }
  });

  Events.on(engine, "afterUpdate", () => {
    while (mergeQueue.length) {
      const [a, b] = mergeQueue.pop();
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      const tier = a.tier;
      World.remove(world, a);
      World.remove(world, b);
      if (tier === TIERS.length - 1) {
        // 満月 ×2 → 皆既月蝕
        score += 100;
        addFloater(mx, my, "皆既月蝕 +100", "#f2d98c");
        burst(mx, my, "#f2d98c", 40);
      } else {
        const nt = tier + 1;
        spawnBody(nt, mx, my);
        score += POINTS[nt];
        maxTier = Math.max(maxTier, nt);
        addFloater(mx, my - TIERS[nt].r, "+" + POINTS[nt], TIERS[nt].color);
        burst(mx, my, TIERS[nt].color, 14);
      }
      updateHud();
    }
  });

  // ---- 演出 ----
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

  document.getElementById("retry").addEventListener("click", restart);

  function restart() {
    for (const b of Composite.allBodies(world)) {
      if (b.tier !== undefined) World.remove(world, b);
    }
    score = 0; maxTier = 0; gameOver = false; overSince = 0;
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
    document.getElementById("final-score").textContent = score;
    document.getElementById("final-tier").textContent = "頂：" + TIERS[maxTier].name;
    document.getElementById("overlay").classList.add("show");
    updateHud();
  }

  // ---- HUD ----
  function updateHud() {
    document.getElementById("score").textContent = score;
    document.getElementById("best").textContent = best;
  }
  updateHud();

  // ---- 描画 ----
  function drawMoon() {
    // 最大到達段位に応じて月が満ちる
    const cx = W / 2, cy = 250, R = 140;
    const phase = maxTier / (TIERS.length - 1); // 0..1
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#f2d98c";
    ctx.fill();
    if (phase < 1) {
      // 影で欠けを表現
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx - R * 1.6 * phase + R * 0.6, cy, R * 0.98, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVessel() {
    ctx.save();
    ctx.strokeStyle = "#4a4468";
    ctx.lineWidth = WALL;
    ctx.lineCap = "round";
    const visL = CUP_L - INSET - WALL / 2, visR = CUP_R + INSET + WALL / 2;
    ctx.beginPath();
    ctx.moveTo(visL, CUP_TOP);
    ctx.lineTo(visL, FLOOR_Y - 6);
    ctx.lineTo(visR, FLOOR_Y - 6);
    ctx.lineTo(visR, CUP_TOP);
    ctx.stroke();
    // 縁の飾り
    ctx.fillStyle = "#5b5480";
    for (const x of [visL, visR]) {
      ctx.beginPath();
      ctx.arc(x, CUP_TOP, WALL * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall(x, y, angle, tier, ghost) {
    const t = TIERS[tier];
    ctx.save();
    ctx.translate(x, y);
    if (ghost) ctx.globalAlpha = 0.85;
    // 本体
    ctx.beginPath();
    ctx.arc(0, 0, t.r, 0, Math.PI * 2);
    if (t.key) {
      ctx.fillStyle = "#fdfbf6";
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
    // 環（段位色）
    ctx.beginPath();
    ctx.arc(0, 0, t.r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    ctx.clearRect(0, 0, W, H);

    // 夜空
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#12122a");
    bg.addColorStop(1, "#1c1836");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawMoon();
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
    for (const b of Composite.allBodies(world)) {
      if (b.tier === undefined) continue;
      drawBall(b.position.x, b.position.y, b.angle, b.tier, false);
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
  }

  // ---- 次の御霊プレビュー（DOM） ----
  const nextEl = document.getElementById("next-face");
  function updateNext() {
    const t = TIERS[nextTier];
    nextEl.style.borderColor = t.color;
    nextEl.src = FACE_DATA[t.key];
  }

  // ---- 自動テスト（#autotest 付きで開くと自動で落とし続ける） ----
  if (location.hash === "#autotest") {
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
    Engine.update(engine, dt);
    checkGameOver(now);
    updateNext();
    render(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

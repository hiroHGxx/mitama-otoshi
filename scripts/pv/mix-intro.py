#!/usr/bin/env python3
"""紹介PV（2026-09-13）の音を組む。  python3 scripts/pv/mix-intro.py <素材フォルダ> <出力wav>

素材フォルダは capture-intro.js の出力（full.wav＝録音をPCMに落としたもの・meta.json）。

考え方:
  録音には BGM（<audio> を WebAudio に通したもの）と効果音・声が混ざっている。
  BGM は原本 kitan_maintheme.m4a と**サンプル単位で一致する**（相関 0.997・ずれ一定・漂流なし）ので、
  「原本×その時の音量」を録音から引けば、効果音と声だけの素材が取り出せる。
  場面を切り貼りするのはこの素材だけにし、BGM は原本から**切れ目なしの1本**で敷き直す
  （場面を飛ばしても曲が途切れない・ゲーム内の BGM 0.16 は PV には小さすぎるので持ち上げる）。

  ・台詞の間は、ゲーム内と同じく BGM を沈める（録音から実測した音量の形をそのまま使う）
  ・書き出しの頭打ちは AAC 化の後で測る（MEDIA.md）。ここでは -2dBFS を上限に揃えるだけ
"""
import json, sys, wave
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
SR = 48000
BGM_FILE = f"{SRC}/bgm.wav"          # 原本を 48k ステレオへ落としたもの（assemble-intro.sh が作る）
meta = json.load(open(f"{SRC}/meta.json"))
AF = meta["audioFrom"]               # 録画の何秒目で録音が始まったか

# ── PVの場面表（assemble-intro.sh と同じ値。v0/v1 は録画の秒・pv は PV上の開始秒）──
SEG = [  # (名前, v0, v1)
    ("S0 題字と案内", 0.30, 2.20),
    ("S1 帳と咲耶の声", 2.20, 6.90),
    ("S2 自然なプレイ", 9.30, 13.30),
    ("S3 咲耶→満月成就", 16.00, 19.90),
    ("S4a 咲耶をもう一組", 20.93, 22.53),
    ("S4b 満月×2→皆既月蝕", 23.90, 26.60),
]
TAIL = 3.60 + 3.20                    # S5 札絵の総見せ ＋ S6 終わりのカード（音は BGM だけ）
BGM_GAIN = 0.60                       # PV での BGM の大きさ（原本比）
FADE_OUT = 2.5

def read(p):
    w = wave.open(p); n = w.getnframes(); ch = w.getnchannels(); assert w.getframerate() == SR
    a = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch).astype(np.float64) / 32768
    return a if ch == 2 else np.repeat(a, 2, axis=1)

rec = read(f"{SRC}/full.wav"); bgm = read(BGM_FILE)

# 1) 録音と原本のずれ（サンプル）を探す: 効果音の無い窓で相関を取る
def best_offset(a0, a1, ch=0, rng=range(-2400, 2400)):
    seg = rec[int(a0 * SR):int(a1 * SR), ch]; best = (-1, 0)
    for o in rng:
        p0 = int(a0 * SR) + o
        if p0 < 0: continue
        ref = bgm[p0:p0 + len(seg), ch]
        c = np.dot(seg, ref) / np.sqrt(np.dot(seg, seg) * np.dot(ref, ref) + 1e-20)
        if c > best[0]: best = (c, o)
    return best
quiet = (meta["録画秒"] - AF - 1.0, meta["録画秒"] - AF - 0.1)   # 録り終わり直前＝盤は静か
corr, OFF = best_offset(*quiet)
print(f"原本とのずれ {OFF} サンプル（{OFF / SR * 1000:.1f}ms）相関 {corr:.3f}")
assert corr > 0.95, "BGM が原本と一致しない（引き算できない）"

def bgm_at(i0, n):   # 録音の i0 サンプル目から n サンプルぶんに対応する原本
    out = np.zeros((n, 2)); s = i0 + OFF
    a, b = max(s, 0), min(s + n, len(bgm))
    if b > a: out[a - s:b - s] = bgm[a:b]
    return out
ref_all = bgm_at(0, len(rec))

# 2) 録音の中の BGM の音量を、窓ごとの最小二乗で測る（台詞の間に沈む形も含めて）
W, H = 2048, 512
g = np.zeros(len(rec))
cent, vals = [], []
for i0 in range(0, len(rec) - W, H):
    r = rec[i0:i0 + W].ravel(); f = ref_all[i0:i0 + W].ravel()
    den = np.dot(f, f)
    if den < 1e-9: continue
    cent.append(i0 + W // 2); vals.append(np.dot(r, f) / den)
cent, vals = np.array(cent), np.array(vals)
g_full = float(np.median(vals[(cent > (quiet[0]) * SR) & (cent < quiet[1] * SR)]))
# 台詞のあたり（録音の頭〜5.5秒）だけ実測の形を使い、それ以外は一定とみなす（効果音が大きい所で推定が暴れるため）
m = cent < 5.5 * SR
shape = np.interp(np.arange(len(rec)), cent[m], np.clip(vals[m], 0, g_full * 1.2), right=g_full)
k = np.ones(480) / 480; shape = np.convolve(shape, k, mode="same")   # 10ms で均す
shape[int(5.5 * SR):] = g_full
sfx = rec - shape[:, None] * ref_all
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print(f"録音の BGM 音量 {g_full:.4f}（原本比）／ 静かな窓: 録音 {db(rec[int(quiet[0]*SR):int(quiet[1]*SR)]):.1f}dB → 引いた残り {db(sfx[int(quiet[0]*SR):int(quiet[1]*SR)]):.1f}dB")

# 3) 効果音・声の素材を場面ごとに切って並べる（切れ目は 20ms で閉じる。最後の場面の尻は太鼓の余韻を 0.35 秒で落とす）
def env_edges(n, fin, fout):
    e = np.ones(n)
    if fin: e[:fin] = np.linspace(0, 1, fin)
    if fout: e[-fout:] = np.minimum(e[-fout:], np.linspace(1, 0, fout))
    return e
pv_len = sum(v1 - v0 for _, v0, v1 in SEG) + TAIL
N = int(round(pv_len * SR))
track_sfx = np.zeros((N, 2)); pos = 0; seg_pv = []
for idx, (name, v0, v1) in enumerate(SEG):
    n = int(round((v1 - v0) * SR)); a0 = int(round((v0 - AF) * SR))
    piece = np.zeros((n, 2)); s, e = max(a0, 0), min(a0 + n, len(sfx))
    if e > s: piece[s - a0:e - a0] = sfx[s:e]
    last = idx == len(SEG) - 1
    piece *= env_edges(n, 960 if idx > 1 else 0, int(0.35 * SR) if last else 960)[:, None]
    track_sfx[pos:pos + n] += piece; seg_pv.append((name, pos / SR, v0)); pos += n

# 4) BGM は原本から切れ目なしの1本。ゲーム内で鳴り始めた瞬間（録音の頭＋ずれ）から敷く
s1_pv, s1_v0 = seg_pv[1][1], seg_pv[1][2]
bgm_start_pv = s1_pv + (AF - s1_v0) + (-OFF) / SR
start = int(round(bgm_start_pv * SR)); n = N - start
track_bgm = np.zeros((N, 2)); track_bgm[start:] = bgm[:n]
# 台詞の間の沈み: 録音の形（shape/g_full）を PV の時刻へ写す
duck = np.ones(N)
rs = int(round((s1_pv + (AF - s1_v0)) * SR))   # 録音の頭が PV の何サンプル目か
L = min(int(5.5 * SR), N - rs); duck[rs:rs + L] = shape[:L] / g_full
track_bgm *= (BGM_GAIN * duck)[:, None]
fo = int(FADE_OUT * SR); track_bgm[-fo:] *= np.linspace(1, 0, fo)[:, None]
fi = int(0.05 * SR); track_bgm[start:start + fi] *= np.linspace(0, 1, fi)[:, None]

mix = track_sfx + track_bgm
peak = np.max(np.abs(mix)); lim = 10 ** (-2 / 20)   # AAC 化で約0.2dB持ち上がる（実測 -3.0→-3.2 の逆向きもある）ので -2 に置く
if peak > lim: mix *= lim / peak
print(f"PV {pv_len:.2f}秒 ／ 頭打ち前のピーク {20*np.log10(peak):.1f}dBFS → {20*np.log10(np.max(np.abs(mix))):.1f}dBFS")
for name, p, _ in seg_pv: print(f"  {name:<14} PV {p:5.2f}秒〜")
w = wave.open(OUT, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()

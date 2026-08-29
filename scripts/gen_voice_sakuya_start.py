#!/usr/bin/env python3
"""咲耶「さ、開けるよ。——夜明けまでは、あたしが付き合う」を Irodori-TTS で生成し、
ゲーム用の m4a に仕上げる。

やること:
  ①Irodori-TTS で生成（参照音声・声質説明文・seed は docs/VOICE.md の「生成条件」が正本）
  ②発声区間検出でトリム
  ③**切れ際を検査**する。末尾が鳴ったまま急に止まっていたら50msのフェードで畳む
    （tsukikage-tobi/scripts/prep_voice.py の手法を移植）
  ④ピークを -1dB に正規化
  ⑤WAVで③④まで済ませてから、1回だけ 96kbps AAC (m4a) に書き出す
    （再エンコードでピークが振り切れる事故を避けるため）

使い方:
    export PATH="$HOME/.local/bin:$PATH"
    python3 scripts/gen_voice_sakuya_start.py

参照音声は URL から取得する（キャッシュがあれば使い回す）。
"""
import os
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IRODORI_DIR = os.path.normpath(os.path.join(ROOT, "..", "tools", "Irodori-TTS"))

REF_URL = "https://vibe.co.jp/luna-occulta/media/voice/sakuya_sample.wav"  # 公式配布・Irodori用
CAPTION = "若い女性の澄んだ声。まっすぐで芯があり、明るく前向きなトーンでハキハキと話している。"
# 画面・記録の表記は「さ、開けるよ。——夜明けまでは、あたしが付き合う」だが、
# 生成に渡す文字列からは「——」を外す（三点リーダと同種の罠。間は句読点で作る）
TEXT = "さ、開けるよ。夜明けまでは、あたしが付き合う。"
SEED = 35  # 3テイク（35/36/37）を比較し、読み・切れ際とも良好だった35を採用（docs/VOICE.md参照）

THRESH = 0.012          # 無音とみなす振幅
PAD = 0.06               # 前後に残す余白（秒）
TAIL_RATIO_LIMIT = 0.12  # これを超えたら「鳴ったまま切れている」

OUT_M4A = os.path.join(ROOT, "assets", "audio", "voice_sakuya_start.m4a")


def download_ref(dest):
    if os.path.exists(dest):
        return
    req = urllib.request.Request(REF_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)


def generate(ref_wav, out_wav):
    cmd = [
        "uv", "run", "--no-sync", "python", "infer.py",
        "--hf-checkpoint", "Aratako/Irodori-TTS-v4.1-Small",
        "--text", TEXT, "--ref-wav", ref_wav, "--caption", CAPTION,
        "--model-device", "mps", "--codec-device", "mps",
        "--seed", str(SEED), "--output-wav", out_wav,
    ]
    subprocess.run(cmd, cwd=IRODORI_DIR, check=True)


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def prep(src_wav, out_m4a):
    a = decode(src_wav)
    idx = np.where(np.abs(a) > THRESH)[0]
    if len(idx) == 0:
        sys.exit("無音のようです（生成に失敗している可能性）")
    start = max(0, idx[0] / 44100 - PAD)
    end = min(len(a) / 44100, idx[-1] / 44100 + PAD)

    # 切れ際の検査: 見るのは「余白を足したあとの終端」ではなく**鳴っている最後の瞬間**。
    # 終端側は余白のぶん無音なので、そこを見ても何も起きない（tsukikage-tobiで踏んだ罠）。
    peak = float(np.abs(a).max())
    tail = float(np.abs(a[max(0, idx[-1] - 441):idx[-1] + 1]).max())
    fade = ""
    if tail > peak * TAIL_RATIO_LIMIT:
        last = idx[-1] / 44100
        fade = f",afade=t=out:st={max(start, last - 0.045):.3f}:d=0.050"
        print(f"  ※ 末尾が鳴ったまま切れていた（ピーク比 {tail/peak:.0%}）。50msのフェードで畳んだ")
    else:
        print(f"  末尾は自然に減衰している（ピーク比 {tail/peak:.0%}）。フェード不要")

    gain = min(10 ** (-1 / 20) / max(peak, 1e-6), 4.0)  # ピークを-1dBへ（上げすぎない）

    os.makedirs(os.path.dirname(out_m4a), exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", src_wav,
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-vn", "-map", "0:a", "-af", f"volume={gain:.3f}{fade}",
        "-c:a", "aac", "-b:a", "96k", out_m4a,
    ], check=True)
    print(f"voiced: {start:.2f}s〜{end:.2f}s（{end-start:.2f}秒）→ {os.path.relpath(out_m4a, ROOT)}")


def main():
    work = os.path.join(tempfile.gettempdir(), "mitama_voice_sakuya")
    os.makedirs(work, exist_ok=True)
    ref_wav = os.path.join(work, "sakuya_sample.wav")
    raw_wav = os.path.join(work, f"raw_seed{SEED}.wav")

    print(f"[1/3] 参照音声を用意（{ref_wav}）")
    download_ref(ref_wav)
    print(f"[2/3] Irodori-TTS で生成（seed={SEED}）")
    generate(ref_wav, raw_wav)
    print("[3/3] 後処理（トリム→切れ際検査→正規化→AAC化）")
    prep(raw_wav, OUT_M4A)


if __name__ == "__main__":
    main()

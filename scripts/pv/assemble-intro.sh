#!/bin/bash
# 御霊おとし 紹介PV（2026-09-13・わいわいタウン掲載作の毎日紹介の1本目）
# 縦720×1280・約25.6秒・本作の実音（琴・拍子木・太鼓・咲耶の声）＋公式BGM
#
#   NODE_PATH=scripts/pv/node_modules node scripts/pv/capture-intro.js  <素材>   # 1回の走りを録る
#   NODE_PATH=scripts/pv/node_modules node scripts/pv/make-intro-cards.js <カード>
#   bash scripts/pv/assemble-intro.sh <素材> <カード> [出力]
#
# 型は kitan-works/docs/MEDIA.md「PVの型」（開幕 → 実機プレイ＋テロップ → 見せ場 → 総見せ → CTA）。
# カット点は **この走りの録画を 0.1〜0.25秒刻みで開いて決めた実測値**。撮り直したら必ず見直す
# （盤の出来事は meta.json の「盤の出来事」に秒で残る。カットインの見え始めは記録より約0.3秒遅い）。
#
# ── 場面表（v＝録画の秒）───────────────────────────────────────────
#   S0 題字の札絵→案内カード                 v [ 0.30,  2.20]  1.90s  PV  0.00
#   S1 帳が閉じて開く＋咲耶「さ、開けるよ。…」 v [ 2.20,  6.90]  4.70s  PV  1.90  台詞を途中で切らない
#   S2 自然なプレイ（二連浄化）＋テロップa   v [ 9.30, 13.30]  4.00s  PV  6.60
#   S3 咲耶を重ねて満月成就（カットイン）     v [16.00, 19.90]  3.90s  PV 10.60
#   S4a もう一組の咲耶 ＋テロップb           v [20.93, 22.53]  1.60s  PV 14.50  2回目のカットインは飛ばす
#   S4b 満月×2 → 皆既月蝕                    v [23.90, 26.60]  2.70s  PV 16.10  絵が不透明のうちに切る
#   S5 札絵の総見せ（階梯の順に九柱×0.4s）＋コピー            3.60s  PV 18.80
#   S6 終わりのカード（わいわいタウン）                        3.20s  PV 22.40
#   合計 25.60s（どの場面も1/30秒の整数倍＝画と音の尺がずれない）
set -e
SRC="${1:?素材フォルダ}"; CARDS="${2:?カードのフォルダ}"; OUT="${3:-$SRC/mitama-otoshi-pv.mp4}"
D="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$D/../.." && pwd)"; T="$SRC/seg"
mkdir -p "$T"
V="-c:v libx264 -pix_fmt yuv420p -r 30 -crf 18 -an"

# --- 素材を固める ---
[ -f "$SRC/full.mp4" ] || ffmpeg -y -v error -f concat -safe 0 -i "$SRC/frames/list.txt" -vf "fps=30,scale=720:1280,format=yuv420p" -c:v libx264 -crf 16 -r 30 "$SRC/full.mp4"
# webm(opus) のまま切らない（先頭パケットで尺がずれる・MEDIA.md）→ PCM に落とす
[ -f "$SRC/full.wav" ] || ffmpeg -y -v error -i "$SRC/audio.webm" -ar 48000 -ac 2 -c:a pcm_s16le "$SRC/full.wav"
[ -f "$SRC/bgm.wav" ]  || ffmpeg -y -v error -i "$REPO/assets/audio/kitan_maintheme.m4a" -t 60 -ar 48000 -ac 2 -c:a pcm_s16le "$SRC/bgm.wav"

# --- 画 ---
# 尺はコマ数で切る（-t だと overlay の同期で1コマ欠けることがある＝画と音がずれていく）
cut() { ffmpeg -y -v error -ss "$2" -i "$SRC/full.mp4" -vf "fps=30,format=yuv420p" -frames:v "$(python3 -c "print(round($3*30))")" $V "$T/$1.mp4"; }
cut v0 0.30 1.90
# S1 に咲耶の台詞の字幕を載せる。刻みは声の実測（src/game.js の帳の注記: 0.06〜1.28「さ、開けるよ。」／1.92〜4.01「夜明けまでは、…」）
#   声の頭は S1 の 0.49s（録画 v2.69 ＝ 押した 0.35s 後）→ 字幕1 0.45〜1.95s・字幕2 2.30〜4.60s
ffmpeg -y -v error -ss 2.20 -i "$SRC/full.mp4" -loop 1 -framerate 30 -t 5 -i "$CARDS/voice_1.png" -loop 1 -framerate 30 -t 5 -i "$CARDS/voice_2.png" \
  -filter_complex "[1]format=rgba,fade=in:st=0.45:d=0.15:alpha=1,fade=out:st=1.75:d=0.20:alpha=1[a];[2]format=rgba,fade=in:st=2.30:d=0.15:alpha=1,fade=out:st=4.40:d=0.20:alpha=1[b];[0][a]overlay=0:840[x];[x][b]overlay=0:840,fps=30,format=yuv420p" -frames:v 141 $V "$T/v1.mp4"
ffmpeg -y -v error -ss 9.30 -t 4.00 -i "$SRC/full.mp4" -loop 1 -framerate 30 -t 5 -i "$CARDS/telop_a.png" \
  -filter_complex "[1]format=rgba,fade=in:st=0.30:d=0.40:alpha=1,fade=out:st=3.45:d=0.45:alpha=1[t];[0][t]overlay=0:680,fps=30,format=yuv420p" -frames:v 120 $V "$T/v2.mp4"
cut v3 16.00 3.90
cut v4a 20.93 1.60
cut v4b 23.90 2.70
# テロップb は S4a〜S4b の頭に跨るので、2つを繋いでから載せる（皆既月蝕の絵＝S4b 0.60s より前に消す）
printf "file 'v4a.mp4'\nfile 'v4b.mp4'\n" > "$T/l4.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$T/l4.txt" -c copy "$T/v4raw.mp4"
ffmpeg -y -v error -i "$T/v4raw.mp4" -loop 1 -framerate 30 -t 5 -i "$CARDS/telop_b.png" \
  -filter_complex "[1]format=rgba,fade=in:st=0.15:d=0.35:alpha=1,fade=out:st=1.85:d=0.35:alpha=1[t];[0][t]overlay=0:300,fps=30,format=yuv420p" -frames:v 129 $V "$T/v4.mp4"
# S5 総見せ: 切り替えは硬いカット（zoompan は使わない＝枠の丸めで揺れる・MEDIA.md）
: > "$T/m.txt"
for i in 1 2 3 4 5 6 7 8 9; do printf "file '%s/m_%s.png'\nduration 0.4\n" "$CARDS" "$i" >> "$T/m.txt"; done
printf "file '%s/m_9.png'\n" "$CARDS" >> "$T/m.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$T/m.txt" -loop 1 -framerate 30 -t 3.60 -i "$CARDS/m_copy.png" \
  -filter_complex "[0]fps=30,format=rgba[b];[1]format=rgba,fade=in:st=0.25:d=0.40:alpha=1[t];[b][t]overlay=0:0,format=yuv420p" -frames:v 108 $V "$T/v5.mp4"
ffmpeg -y -v error -loop 1 -framerate 30 -t 3.20 -i "$CARDS/endcard.png" -vf "fade=out:st=2.75:d=0.45,format=yuv420p" $V "$T/v6.mp4"
printf "file 'v0.mp4'\nfile 'v1.mp4'\nfile 'v2.mp4'\nfile 'v3.mp4'\nfile 'v4.mp4'\nfile 'v5.mp4'\nfile 'v6.mp4'\n" > "$T/vlist.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$T/vlist.txt" -c copy "$T/video.mp4"
for f in v0 v1 v2 v3 v4 v5 v6; do printf "  %-3s %sコマ\n" $f "$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$T/$f.mp4")"; done   # 57/141/120/117/129/108/96

# --- 音 ---
python3 "$D/mix-intro.py" "$SRC" "$T/audio.wav"

# --- 合わせる ---
ffmpeg -y -v error -i "$T/video.mp4" -i "$T/audio.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,sample_rate -show_entries format=duration,size -of default=nw=1 "$OUT"
echo "  AAC後のピーク: $(ffmpeg -v info -i "$OUT" -af volumedetect -f null - 2>&1 | grep -o 'max_volume: .*')"

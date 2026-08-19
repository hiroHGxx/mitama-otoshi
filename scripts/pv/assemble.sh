#!/bin/zsh
# 御霊おとしPV組み立て（縦型720x1280・約24秒・公式BGM入り）
# 前提: 同ディレクトリに以下がある状態で実行する
#   - gameplay.mp4  … capture-pv.js で撮った縦型実機素材（約24秒）
#   - s1.png / s6.png / telop.png / m_copy.png / m_*.png … render-cards.js の出力
# 使い方:
#   cd 作業ディレクトリ && npm i puppeteer-core
#   node capture-pv.js && node render-cards.js && zsh assemble.sh
#
# カット点はgameplay.mp4の内容に依存する。フレームを見て以下を調整すること:
#   PLAY_SS/PLAY_T   … 積み上げプレイ（1〜5段の自然な合体）
#   CUTIN_SS/CUTIN_T … 1回目のカットイン（スライド全体）
#   ECL_SS/ECL_T     … 満月×2接触〜血月アートが「完全不透明のうち」に切る
#                      （演出フェード後半は盤面が透けるのでフレーム単位で確認）
set -e
V="-c:v libx264 -crf 20 -pix_fmt yuv420p -r 30"
PLAY_SS=1.8;  PLAY_T=6.2
CUTIN_SS=9.3; CUTIN_T=2.8
ECL_SS=17.15; ECL_T=2.15
BGM="../../assets/audio/kitan_maintheme.m4a"

# S1: 導入（キービジュアル・ゆっくり寄り）
ffmpeg -y -v error -loop 1 -i s1.png -t 3.4 -vf "scale=1440:2560,zoompan=z='min(1+0.0011*on,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30" ${=V} seg1.mp4
# S2: 実機プレイ＋テロップ（静止画にfade alphaを使うので -loop 1 必須）
ffmpeg -y -v error -ss $PLAY_SS -t $PLAY_T -i gameplay.mp4 -loop 1 -framerate 30 -i telop.png -filter_complex "[1]format=rgba,fade=in:st=0.4:d=0.4:alpha=1,fade=out:st=3.4:d=0.5:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" ${=V} seg2.mp4
# S3: カットイン
ffmpeg -y -v error -ss $CUTIN_SS -t $CUTIN_T -i gameplay.mp4 -vf "fps=30,format=yuv420p" ${=V} seg3.mp4
# S4: 満月×2 → 皆既月蝕（アート完全不透明のうちに切る）
ffmpeg -y -v error -ss $ECL_SS -t $ECL_T -i gameplay.mp4 -vf "fps=30,format=yuv420p" ${=V} seg4.mp4
# S5: 札絵モンタージュ＋コピー
ffmpeg -y -v error -f concat -safe 0 -i mlist.txt -loop 1 -framerate 30 -i m_copy.png -filter_complex "[1]format=rgba,fade=in:st=0.25:d=0.4:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" -t 4.5 ${=V} seg5.mp4
# S6: エンドカード（寄り＋フェードアウト）
ffmpeg -y -v error -loop 1 -i s6.png -t 5.0 -vf "scale=1440:2560,zoompan=z='min(1+0.0005*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30,fade=out:st=4.3:d=0.7" ${=V} seg6.mp4

# 連結 → BGM（合計尺 TOTAL に合わせてフェードを再計算）
TOTAL=$(echo "3.4 + $PLAY_T + $CUTIN_T + $ECL_T + 4.5 + 5.0" | bc)
FADE_ST=$(echo "$TOTAL - 2.4" | bc)
ffmpeg -y -v error -f concat -safe 0 -i clist.txt -c copy silent.mp4
ffmpeg -y -v error -i silent.mp4 -i "$BGM" -filter_complex "[1:a]atrim=0:$TOTAL,afade=t=in:st=0:d=0.6,afade=t=out:st=$FADE_ST:d=2.4,volume=0.95[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -movflags +faststart mitama-pv.mp4
echo "done: mitama-pv.mp4 (${TOTAL}s)"

#!/bin/zsh
# 御霊おとし 更新告知PV（縦720x1280・13.0秒・公式BGM+咲耶ボイス入り）
# 2026-08-29 前任からの引き継ぎ撮影分。素材は capture-title.js（frames_title）と
# capture-endgame.js（frames_end）の実撮り。組み立てだけを行う（撮影は別スクリプト）。
#
# 前提: 同ディレクトリに frames_title/list.txt・frames_end/list.txt がある状態で実行する
#   node capture-title.js    # 案内カード→月夜に入る→帳が開く→少し遊ぶ（1229枚・frames_title/）
#   node capture-endgame.js  # #autotest→夜が明けた→番付（frames_end/）
#     ★#autotest の再読み込みは iframe の「中から」location.hash+location.reload() で行うこと。
#       親ページから iframe.src を書き換える方式は、わいわいタウンの埋め込み状態が壊れて
#       #autotest が一度も発火しない（実機で確認済み・2026-08-29）。
#
# 手順:
#   1. crop=720:1280:0:44 で両フレーム集合を「わいわいタウンの上部バー抜き」のフル尺
#      中間ファイルに固める（title-full.mp4 / end-full.mp4）。offsetY=44 は両スクリプトの
#      ログで実測済み（iframe offset）。
#   2. 見せる4カットを中間ファイルから ss/t で切り出す（u1〜u4.mp4）。カット点は
#      frames_title/frames_end を実際に開いて決めた実測値（下記コメント）。
#   3. 無音のまま連結 → BGM（ダッキング付き）+ボイス（1.65秒開始）を filter_complex_script
#      でミックスして書き出す。
#
# 使い方: zsh assemble-update.sh
set -e
V="-c:v libx264 -crf 18 -pix_fmt yuv420p -r 30"
BGM="../../assets/audio/kitan_maintheme.m4a"
VOICE="../../assets/audio/voice_sakuya_start.m4a"

# ---- 1. フル尺中間ファイル（わいわいタウンのヘッダーを crop で除去） ----
[ -f title-full.mp4 ] || ffmpeg -y -v error -f concat -safe 0 -i frames_title/list.txt \
  -vf "crop=720:1280:0:44,fps=30,format=yuv420p" ${=V} title-full.mp4
[ -f end-full.mp4 ] || ffmpeg -y -v error -f concat -safe 0 -i frames_end/list.txt \
  -vf "crop=720:1280:0:44,fps=30,format=yuv420p" ${=V} end-full.mp4

# ---- 2. カット出し（すべて title-full.mp4 / end-full.mp4 の実時間） ----
# u1 タイトル（案内カード。1.2秒で出るようになったので短く）。クリックの瞬間（実測 source 3.03s
#    付近＝この直後に帳が閉幕で現れる）の直前で切る。ss=2.9 だとまだ案内カードが数フレーム
#    残っていて u2 の頭に紛れ込む（実測で確認済み・2026-08-29）。3.03 以降なら閉幕後。
ffmpeg -y -v error -ss 1.6   -t 1.433 -i title-full.mp4 -vf "fps=30,format=yuv420p" ${=V} u1.mp4
# u2 帳（いちばんの見せ場）: クリック直後の閉幕保持→拍子木とともに開く。source 4.9s付近で開き始め
#    6.1s手前で開ききる（CSS transition 1.5s・DOOR_OPEN_AT 1650ms と実測はおおむね一致。
#    クリック自体が予想よりやや遅れて起きていたぶん開始が後ろ倒しになった）
ffmpeg -y -v error -ss 3.03  -t 3.1   -i title-full.mp4 -vf "fps=30,format=yuv420p" ${=V} u2.mp4
# u3 少し遊ぶ: 二連浄化→三連浄化と連続で決まる区間（score 16→31）
ffmpeg -y -v error -ss 11.3  -t 4.0   -i title-full.mp4 -vf "fps=30,format=yuv420p" ${=V} u3.mp4
# u4 夜が明けた→番付（実撮りの全国順位。frames_end はほぼ全域を使う）
ffmpeg -y -v error -ss 0     -t 4.5   -i end-full.mp4   -vf "fps=30,format=yuv420p" ${=V} u4.mp4

printf "file 'u1.mp4'\nfile 'u2.mp4'\nfile 'u3.mp4'\nfile 'u4.mp4'\n" > ulist.txt

# ---- 3. 音ミックス（BGM ダッキング＋ボイス1.783秒開始）----
# 声の位置: クリック(=u1/u2境界=映像1.433秒) + 350ms = 1.783秒開始（ゲーム内の関係と一致）。
# ダッキング: 1.63→1.78秒でBGM 0.35→0.15（0.16→0.07相当の比）、5.66→5.86秒で0.15→0.35に戻す
# （ボイス長4.08秒ぶん）。連結後の実尺は端数が出るため 13.033 秒で trim/fade する。
cat > update-filter.txt << 'EOF'
[0:v]fade=t=out:st=12.73:d=0.3[v];
[1:a]atrim=0:13.033,afade=t=in:st=0:d=0.5,afade=t=out:st=12.03:d=1.0,volume=eval=frame:volume='if(lt(t,1.63),0.35,if(lt(t,1.78),0.35-1.3333*(t-1.63),if(lt(t,5.66),0.15,if(lt(t,5.86),0.15+1.0*(t-5.66),0.35))))'[bgm];
[2:a]adelay=1783|1783[voice];
[bgm][voice]amix=inputs=2:duration=first:normalize=0[aout]
EOF

ffmpeg -y -v error -f concat -safe 0 -i ulist.txt \
  -i "$BGM" -i "$VOICE" \
  -filter_complex_script update-filter.txt \
  -map "[v]" -map "[aout]" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 160k -movflags +faststart \
  update-20260829.mp4

echo "done: update-20260829.mp4 (13.0s)"

#!/bin/bash
# 正典ちびシートから顔アイコンを切り出す。
# キャラごとに「クロップサイズ / Yオフセット / Xオフセット」を補正済み。
# 基準: 目の中間点がクロップの (50%, 48%) に来ること（codex視覚測定×3回で校正）。
# 顔がシート下端に近いキャラ（anne/nekomata/sakuya）はクロップを小さくして対応
cd "$(dirname "$0")/.."
crop() { # name size offY offX
  sips -c $2 $2 --cropOffset $3 $4 assets/sheets/$1.png --out assets/faces/$1.png >/dev/null 2>&1
  sips -z 160 160 assets/faces/$1.png >/dev/null 2>&1
}
crop nemu     360 630 114
crop oto      360 637 119
crop anne     320 693 149
crop nekomata 240 526 66
crop benten   320 668 47
crop uka      360 648 117
crop izuna    360 658 175
crop shion    340 680 63
crop sakuya   340 79 50   # 下段の顔は下端に近すぎるため上段立ち絵の頭部を使用
echo "faces cropped"

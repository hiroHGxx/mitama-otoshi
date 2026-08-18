#!/bin/bash
# 正典ちびシートから顔アイコンを切り出す。
# キャラごとに「クロップサイズ / Yオフセット / Xオフセット」を補正済み
# （髪型の偏りで顔が円の中心からズレるため、目の位置が中心に来るよう調整）
cd "$(dirname "$0")/.."
crop() { # name size offY offX
  sips -c $2 $2 --cropOffset $3 $4 assets/sheets/$1.png --out assets/faces/$1.png >/dev/null 2>&1
  sips -z 160 160 assets/faces/$1.png >/dev/null 2>&1
}
crop nemu     360 620 160
crop oto      360 646 148
crop anne     360 632 129
crop nekomata 260 460 55
crop benten   320 620 30
crop uka      360 620 177
crop izuna    360 632 148
crop shion    340 630 90
crop sakuya   360 628 124
echo "faces cropped"

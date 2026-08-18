#!/bin/bash
# 正典ちびシートから顔アイコンを切り出す。
# キャラごとに「クロップサイズ / Yオフセット / Xオフセット」を補正済み。
# 基準: 顔の中心線（鼻筋）が円の中心・目の高さが中心のやや上（48%）に来ること
cd "$(dirname "$0")/.."
crop() { # name size offY offX
  sips -c $2 $2 --cropOffset $3 $4 assets/sheets/$1.png --out assets/faces/$1.png >/dev/null 2>&1
  sips -z 160 160 assets/faces/$1.png >/dev/null 2>&1
}
crop nemu     360 620 122
crop oto      360 660 148
crop anne     360 648 133
crop nekomata 260 482 55
crop benten   320 663 27
crop uka      360 650 150
crop izuna    360 656 147
crop shion    340 647 90
crop sakuya   360 646 124
echo "faces cropped"

#!/bin/bash
# 正典ちびシートから顔アイコンを切り出す。
# 全キャラ共通で「上段の立ち絵の頭部」から切り出す（余白が十分で中心合わせが効くため）。
# キャラごとの「クロップサイズ / Yオフセット / Xオフセット」は
# 目の中間点がクロップの (50%, 48%) に来るよう校正済み。
cd "$(dirname "$0")/.."
crop() { # name size offY offX
  sips -c $2 $2 --cropOffset $3 $4 assets/sheets/$1.png --out assets/faces/$1.png >/dev/null 2>&1
  sips -z 160 160 assets/faces/$1.png >/dev/null 2>&1
}
crop nemu     340 85 39
crop oto      340 85 50
crop anne     360 76 46
crop nekomata 280 9 48
crop uka      340 87 50
crop izuna    340 79 50
crop shion    300 91 78
crop sakuya   340 79 50

# 弁天のみ特別処理: 中央寄せクロップだと右端に隣の立ち絵が写り込むため、
# Chrome ヘッドレスの canvas で右端の帯 (x>=252) を白塗りしてから縮小する
sips -c 280 280 --cropOffset 47 20 assets/sheets/benten.png --out scripts/benten_raw.png >/dev/null 2>&1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=280,280 --screenshot=assets/faces/benten.png \
  --virtual-time-budget=2000 --allow-file-access-from-files \
  "file://$(pwd)/scripts/clean-benten.html" >/dev/null 2>&1
rm -f scripts/benten_raw.png
sips -z 160 160 assets/faces/benten.png >/dev/null 2>&1
echo "faces cropped"

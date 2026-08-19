#!/bin/zsh
# 札絵モンタージュ用HTML（m_*.html）を生成する。REPO は絶対パスで指定。
REPO="${1:-/Users/USER/Documents/user/Products/game/mitama-otoshi}"
for k in nemu oto anne nekomata benten uka izuna shion sakuya; do
cat > "m_$k.html" << EOF2
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;width:720px;height:1280px;overflow:hidden;background:#131320}
img{width:720px;height:1280px;object-fit:cover}</style>
<img src="file://$REPO/assets/art/fuda_$k.webp">
EOF2
done
echo "m_*.html generated (fuda from $REPO)"

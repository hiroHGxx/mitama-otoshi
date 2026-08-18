# 御霊おとし（みたまおとし）

『月蝕綺譚 -Luna Occulta-』の**非公式二次創作**ファンゲームです。
ちび御霊を壺に落として、同じ御霊同士を重ねると一段上の御霊へ「浄化」。
最後には満月が生まれ、満月がふたつ重なると「皆既月蝕」——。

スイカゲーム式の落ち物パズル。スマホのブラウザでそのまま遊べます。

**▶ 遊ぶ: https://hirohgxx.github.io/mitama-otoshi/**

![御霊おとし](ogp.png)

## 遊び方

- 画面をなぞって位置を決め、指を離すと御霊が落ちます
- 同じ御霊がぶつかると合体して一段上の御霊になります
- 壺からあふれたらおしまい（夜明け）

### 進化の階梯

ネム → 於兎 → 餡音 → ネコマタ → 弁天 → 宇迦 → イズナ → 紫苑 → 咲耶 → 満月

## 開発

```bash
# 顔アイコン（assets/faces/*.png）を data URI 化して src/faces.js を生成
./scripts/build-faces.sh

# 単一ファイル版を dist/ に生成（index.html / artifact.html）
node scripts/build-dist.js
```

- 物理エンジン: [Matter.js](https://brm.io/matter-js/)（MIT・`vendor/` に同梱）
- `index.html#autotest` で開くと自動プレイのデバッグモード

## 二次創作について・クレジット

本作は『月蝕綺譚 -Luna Occulta-』（Studio VIBE / CryptoNinja 外伝）の
[二次創作ガイドライン](https://vibe.co.jp/luna-occulta/fanworks)および
[CryptoNinja ガイドライン](https://www.ninja-dao.com/guidelines)に基づくファンメイド作品で、**公式とは関係ありません**。

- **キャラクター画像**: 公式[素材蔵](https://vibe.co.jp/luna-occulta/fanworks/assets)配布の正典シート（ちびシート）から切り出して使用（「二次創作のゲーム・画像作品に組み込んでOK」のお約束に基づく）
- **札絵・必殺カットイン**: 公式素材蔵配布の札絵（fuda）・必殺カットイン（cutin）を使用（同上）
- **皆既月蝕・盤面背景のイラスト**: 正典シートを参照資料として Lovart（GPT Image 2）で生成（ガイドラインの「AIによるイラスト生成OK」「正典シートのAI利用OK」に基づく）
- **BGM**: 公式素材蔵配布のタイトル曲（メインテーマ）を AAC に変換して使用（「作品に組み込んで公開するのはOK」のお約束に基づく）。楽曲の単体利用・再配布はできません
- **効果音**: WebAudio による自作（Karplus-Strong 合成ほか）
- 正典シートの原本はこのリポジトリには含めていません（ビルド時に公式素材蔵から取得します）

キャラクター・楽曲および原作の権利は原権利者（Studio VIBE / CryptoNinja）に帰属します。
本作は無料で公開しており、収益化はしていません。

# 後片付け（dry-run） — 2026-08-28 / run g1a7

## 作られたもの

| 対象 | 種類 | 場所 | 操作 | 復元可否 |
|---|---|---|---|---|
| `mitama_best` = 612 / 901 ほか | localStorage | origin `http://127.0.0.1:8971`（UT専用） | 作成 | 破棄で足りる |
| `mitama_dex_max` = 6 | localStorage | 同上 | 作成 | 同上 |
| `mitama_title_rank` = 6 / `mitama_title` = 夜番の頭 | localStorage | 同上 | 作成 | 同上 |
| `mitama_sound` = on / off | localStorage | 同上 | 作成 | 同上 |

Playwright の各 context は使い捨てで、ブラウザを閉じた時点で上の localStorage は消えている。
Chrome のタブで開いた 1 件（`http://127.0.0.1:8971`）だけが残りうる。

## 提案する操作（承認待ち）

1. UT用に立てた配信 `python3 -m http.server 8971` を止める（オーナーの承認後）
2. Chrome に残った `127.0.0.1:8971` のタブを閉じる
3. `dist/artifact.html` を `file://` で開いた履歴 — 何も書き込んでいないので操作なし

## 触らないもの

- **本番 origin（github.io）の localStorage**: 最初から触れていない。オーナーの最高得点・図鑑解禁・称号はそのまま
- `docs/ut/`（この記録一式）と `ut.config.yaml`: 成果物なので残す
- ゲーム本体（`index.html` / `src/` / `assets/`）: 1行も変えていない

## baseline との差

`git status` で `docs/ut/`・`ut.config.yaml` の新規追加のみ。ゲーム本体に差分なし。

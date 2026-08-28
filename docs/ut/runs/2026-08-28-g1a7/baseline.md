# baseline — 2026-08-28 / run g1a7

UT開始前に控えた状態。**本番 origin（https://hirohgxx.github.io/）には一切触れていない。**

| 対象 | 開始前 | 取得方法 |
|---|---|---|
| localStorage（http://127.0.0.1:8971 origin） | `{}`（空） | 開いた直後に `Object.entries(localStorage)` |
| localStorage（本番 origin） | **未取得・未変更**（本番では実施しないため触れていない） | — |
| リポジトリの作業ツリー | `docs/ut/` と `ut.config.yaml` 以外は無改変 | `git status` |
| 配信 | `python3 -m http.server 8971`（このリポジトリを配信・UT専用） | curl 200 |

このゲームは通信をしない。作られるデータは localStorage の5キーだけで、
それらは UT 用の origin の中にしかできない。**不可逆・外部影響の操作は存在しない。**

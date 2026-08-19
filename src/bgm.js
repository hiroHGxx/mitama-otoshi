// BGM は別ファイルを遅延ストリーミング（初回ロードを軽くするため）。
// Artifact 用ビルドでは build-dist.js がこの定数を data URI に置換して単一ファイル化する。
const BGM_DATA = "assets/audio/kitan_maintheme.m4a";
// 琴の実サンプル（AI生成の琴独奏曲から切り出したワンショット）。
// main は単音（基音 196.5Hz / G3）で音程を変えて使い回す。high は装飾フレーズで固定ピッチ再生専用。
const KOTO_MAIN_DATA = "assets/audio/koto_pluck_main.m4a";
const KOTO_HIGH_DATA = "assets/audio/koto_pluck_high.m4a";

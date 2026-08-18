// src/page.html から2種のビルドを生成:
//  index.html（リポジトリ直下） … GitHub Pages 用の単一ファイル。
//    JS を全部インライン化することで「HTMLとJSのキャッシュずれ」を構造的に防ぐ。
//    BGM は assets/audio/ から遅延ストリーミング（初回ロード軽量化）。
//  dist/artifact.html … Claude Artifact 用。外部ファイルを参照できないため
//    BGM も data URI で埋め込んだ完全自己完結版（外殻タグなし）。
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src", "page.html"), "utf8");

function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"><\/script>/g, (_, p) => {
    const js = fs.readFileSync(path.join(root, p), "utf8");
    return "<script>\n" + js + "\n</script>";
  });
}

// GitHub Pages 用（単一ファイル・BGMは外部参照のまま）
const pages = inlineScripts(src);
fs.writeFileSync(path.join(root, "index.html"), pages);

// Artifact 用（BGMを data URI 化 + 外殻タグ除去）
const bgmB64 = fs.readFileSync(path.join(root, "assets/audio/kitan_maintheme.m4a")).toString("base64");
let art = pages.replace(
  'const BGM_DATA = "assets/audio/kitan_maintheme.m4a";',
  'const BGM_DATA = "data:audio/mp4;base64,' + bgmB64 + '";'
);
const head = art.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta[^>]*>\s*/g, "")
  .replace(/<title>[\s\S]*?<\/title>\s*/, "");
const body = art.match(/<body>([\s\S]*)<\/body>/)[1];
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "artifact.html"), "<title>御霊おとし</title>\n" + head + body);
fs.rmSync(path.join(root, "dist", "index.html"), { force: true });
console.log("index.html:", fs.statSync(path.join(root, "index.html")).size,
  "/ dist/artifact.html:", fs.statSync(path.join(root, "dist/artifact.html")).size);

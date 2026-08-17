// index.html から2種のビルドを生成:
//  dist/artifact.html … Artifact 用（doctype/html/head/body タグなし・全インライン）
//  dist/index.html    … GitHub Pages 用（完全な単一ファイルHTML）
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), "utf8");
  return "<script>\n" + js + "\n</script>";
});
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "index.html"), html);

// artifact 用: 外殻タグと meta を除去し、title を先頭に
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta[^>]*>\s*/g, "")
  .replace(/<title>[\s\S]*?<\/title>\s*/, "");
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = "<title>御霊おとし</title>\n" + head + body;
fs.writeFileSync(path.join(root, "dist", "artifact.html"), artifact);
console.log("dist/index.html:", fs.statSync(path.join(root, "dist/index.html")).size,
  "/ dist/artifact.html:", fs.statSync(path.join(root, "dist/artifact.html")).size);

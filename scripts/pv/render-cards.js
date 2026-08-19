const puppeteer = require("puppeteer-core");
const path = require("path");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new", args: ["--window-size=720,1280", "--hide-scrollbars", "--allow-file-access-from-files"],
    defaultViewport: { width: 720, height: 1280 },
  });
  const page = await browser.newPage();
  const jobs = [["s1", false], ["telop", true], ["s6", false],
    ...["nemu","oto","anne","nekomata","benten","uka","izuna","shion","sakuya"].map(k => [`m_${k}`, false])];
  for (const [name, transparent] of jobs) {
    await page.goto("file://" + path.join(__dirname, name + ".html"), { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(__dirname, name + ".png"), omitBackground: transparent });
  }
  await browser.close();
  console.log("cards done");
})();

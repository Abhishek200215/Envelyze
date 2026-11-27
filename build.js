/* Builds Envelyze.html — the single-file version — from
   index.html + style.css + javascript.js, so the two never drift apart.

   Usage:  node build.js                                                   */

"use strict";

const fs = require("fs");
const path = require("path");

const dir = __dirname;
const read = name => fs.readFileSync(path.join(dir, name), "utf8");

const html = read("index.html");
const css = read("style.css");
const js = read("javascript.js");

if (/<\/script/i.test(js)) {
  throw new Error("javascript.js contains </script — it would end the inline script early.");
}

const cssTag = '<link rel="stylesheet" href="style.css">';
const jsTag = '<script src="javascript.js"></script>';

if (html.indexOf(cssTag) === -1 || html.indexOf(jsTag) === -1) {
  throw new Error("index.html no longer links style.css / javascript.js the expected way.");
}

const out = html
  .replace(cssTag, () => "<style>\n" + css.replace(/\s+$/, "") + "\n</style>")
  .replace(jsTag, () => "<script>\n" + js.replace(/\s+$/, "") + "\n</script>");

fs.writeFileSync(path.join(dir, "Envelyze.html"), out);
console.log("Built Envelyze.html (" + (out.length / 1024).toFixed(1) + " KB)");

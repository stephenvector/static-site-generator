import express from "express";
import ws from "ws";
import path from "path";
import chokidar from "chokidar";
import marked from "marked";
import matter from "gray-matter";
import fs from "fs-extra";
import yargs from "yargs/yargs";
import hljs from "highlight.js";
import { minify } from "html-minifier";

/**
 * TYPES
 */

type WebPage = {
  slug: string;
  title: string;
  html: string;
};

/**
 * GLOBAL VARIABLES
 */
const webpages: { [k: string]: WebPage } = {};

/**
 * CONSTANTS
 */

const MODE_DEV = "dev";
const MODE_BUILD = "build";

const CONTENT_TAG_REGEX = /{{CONTENT}}/g;
const SITE_NAME_TAG_REGEX = /{{SITE_NAME}}/g;
const GOOGLE_ANALYTICS_SCRIPT_TAG_REGEX = /{{GOOGLE_ANALYTICS_SCRIPT}}/g;
const GOOGLE_ANALYTICS_ID_TAG_REGEX = /{{GOOGLE_ANALYTICS_ID}}/g;

const CONTENT_TAG = "{{CONTENT}}";
const SITE_NAME_TAG = "{{SITE_NAME}}";
const GOOGLE_ANALYTICS_SCRIPT_TAG = "{{GOOGLE_ANALYTICS_SCRIPT}}";
const GOOGLE_ANALYTICS_ID_TAG = "{{GOOGLE_ANALYTICS_ID}}";

const CLIENT_WEBSOCKET_SCRIPT = `<script type="text/javascript">
const socket = new WebSocket("ws://localhost:3000/")
socket.addEventListener('message', function (event) {
  console.log(event)
  window.location.reload();
});</script>`;

const GOOGLE_ANALYTICS_SCRIPT = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID_TAG}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GOOGLE_ANALYTICS_ID_TAG}');
</script>`;
export const HTML_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${SITE_NAME_TAG}</title>
<style type="text/css">
*, *:before, *:after {
  box-sizing: inherit;
}
html {
  box-sizing: border-box;
  font-size: 20px;
}
body {
  padding: 0;
  background: #fff;
  color: #000;
  font-family: sans-serif;
}
.wrapper {
  max-width: 36rem;
  margin: 0 auto;
  padding: 1.5rem;
}
.wrapper > header > a {
  font-weight: bold;
}
a {
  text-decoration: none;
  color: inherit;
}
h1 {
  font-size: 2.5rem;
  margin: 1.5rem 0;
  letter-spacing: -0.03em;
  line-height: 0.95;
}
p {
  margin: 1.5rem 0;
  line-height: 1.5;
  font-size: 110%;
  font-family: Georgia, Cambria, "Times New Roman", Times, serif
}
.hljs {
  display: block;
  overflow-x: auto;
  padding: 1rem;
  color: #333;
  background: #f2f2f2;
}
.hljs-comment,
.hljs-quote {
  color: #999;
  font-style: italic;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-subst {
  color: #333;
  font-weight: bold;
}
.hljs-number,
.hljs-literal,
.hljs-variable,
.hljs-template-variable,
.hljs-tag .hljs-attr {
  color: #088;
}
.hljs-string,
.hljs-doctag {
  color: #d14;
}
.hljs-title,
.hljs-section,
.hljs-selector-id {
  color: #900;
  font-weight: bold;
}
.hljs-subst {
  font-weight: normal;
}
.hljs-type,
.hljs-class .hljs-title {
  color: #458;
  font-weight: bold;
}
.hljs-tag,
.hljs-name,
.hljs-attribute {
  color: #000080;
  font-weight: normal;
}
.hljs-regexp,
.hljs-link {
  color: #092;
}
.hljs-symbol,
.hljs-bullet {
  color: #907;
}
.hljs-built_in,
.hljs-builtin-name {
  color: #08b;
}
.hljs-meta {
  color: #999;
  font-weight: bold;
}
.hljs-deletion {
  background: #fdd;
}
.hljs-addition {
  background: #dfd;
}
.hljs-emphasis {
  font-style: italic;
}
.hljs-strong {
  font-weight: bold;
}
pre {
  overflow-x: auto;
  border-radius: 0.5rem;
  padding: 1rem;
  color: #333;
  background: #f2f2f2;
}
</style>
<meta name="viewport" content="width=device-width, initial-scale=1">
${GOOGLE_ANALYTICS_SCRIPT_TAG}
</head>
<body>
  <div class="wrapper">
    <header>
      <a href="/">${SITE_NAME_TAG}</a>
    </header>
    <section>${CONTENT_TAG}</section>
  </div>
</body>
</html>
`;

/**
 * FUNCTIONS
 */

function getFlattenedObject(obj: object) {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const typeofValue = typeof v;

    if (typeofValue === "object") {
      const flattenedValueObject = getFlattenedObject(v);
      Object.entries(flattenedValueObject).forEach(([a, b]) => {
        acc[`${k}.${a}`] = b;
      });
    } else {
      acc[k] = v;
    }

    return acc;
  }, {} as Record<string, any>);
}

function getMarkdownFileWatcher() {
  return chokidar
    .watch([`${inputDir}/**/*.md`], {
      ignored: [/(^|[\/\\])\../, /node_modules/],
      persistent: true,
    })
    .on("all", (event, markdownFilePath) => {
      processWebpageFile(markdownFilePath.toString());
    });
}

function develop() {
  const app = express();
  app.use(express.static("public"));
  const wsServer = new ws.Server({ noServer: true });
  const server = app.listen(3000, () => {
    console.log("Dev server listening at http://localhost:3000");
  });

  server.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (socket) => {
      wsServer.emit("connection", socket, request);
    });
  });

  chokidar
    .watch([`${inputDir}/**/*.md`], {
      ignored: [/(^|[\/\\])\../, /node_modules/],
      persistent: true,
    })
    .on("all", (event, markdownFilePath) => {
      processWebpageFile(markdownFilePath.toString());
      writeSiteToDisk();
      wsServer.clients.forEach((client) => {
        client.send("message");
      });
    })
    .on("ready", () => {
      writeSiteToDisk();
    });
}

function getHomepage() {
  let renderedLinks = ``;
  Object.entries(webpages).forEach(([_filePath, page]) => {
    renderedLinks += `<h2><a href="/${page.slug}/">${page.title}</a></h2>`;
  });
  return HTML_TEMPLATE.replace(CONTENT_TAG_REGEX, `${renderedLinks}`)
    .replace(
      "</body>",
      `${command === "dev" ? CLIENT_WEBSOCKET_SCRIPT : ""}</body>`
    )
    .replace(SITE_NAME_TAG_REGEX, siteName)
    .replace(
      GOOGLE_ANALYTICS_SCRIPT_TAG_REGEX,
      `${
        command === "build" && typeof googleAnalyticsId === "string"
          ? GOOGLE_ANALYTICS_SCRIPT.replace(
              GOOGLE_ANALYTICS_ID_TAG_REGEX,
              googleAnalyticsId
            )
          : ""
      }`
    )
    .replace(
      "</head>",
      `${command === "dev" ? CLIENT_WEBSOCKET_SCRIPT : ""}</head>`
    );
}

function processWebpageFile(filePath: string) {
  const t = fs.readFileSync(filePath).toString();
  const m = matter(t);
  const documentHTML = marked(m.content, {
    highlight: function (code, language) {
      const validLanguage = hljs.getLanguage(language) ? language : "plaintext";
      return hljs.highlight(validLanguage, code).value;
    },
  });

  const outputHTML = HTML_TEMPLATE.replace(
    CONTENT_TAG,
    `<article><h1>${m.data.title}</h1>${documentHTML}</article>`
  )
    .replace(SITE_NAME_TAG_REGEX, siteName as string)
    .replace(
      GOOGLE_ANALYTICS_SCRIPT_TAG_REGEX,
      `${
        command === "build" && typeof googleAnalyticsId === "string"
          ? GOOGLE_ANALYTICS_SCRIPT.replace(
              GOOGLE_ANALYTICS_ID_TAG_REGEX,
              googleAnalyticsId
            )
          : ""
      }`
    )
    .replace(
      "</head>",
      `${command === "dev" ? CLIENT_WEBSOCKET_SCRIPT : ""}</head>`
    );

  if (typeof m.data.slug === "string" && typeof m.data.title === "string") {
    webpages[m.data.slug] = {
      slug: m.data.slug,
      html: outputHTML,
      title: m.data.title,
    };
  }
}

function writeSiteToDisk() {
  fs.ensureDirSync(outputDir);

  fs.writeFileSync(
    path.resolve(outputDir, "index.html"),
    minify(getHomepage(), {
      minifyCSS: true,
      collapseWhitespace: true,
    })
  );

  Object.values(webpages).forEach((webpage) => {
    fs.ensureDirSync(path.resolve(outputDir, webpage.slug));
    fs.outputFileSync(
      path.resolve(outputDir, webpage.slug, "index.html"),
      minify(webpage.html, {
        minifyCSS: true,
        collapseWhitespace: true,
      })
    );
  });
}

/**
 * YARGS CONFIG
 */

const argv = yargs(process.argv.slice(2))
  .command(
    "dev",
    "Develop your site locally. Watches your markdown files and reloads when necessary."
  )
  .help()
  .demandCommand()
  .command("build", "Generate your site's html")
  .help()
  .demandCommand()
  .version(false)
  .help(false)
  .option("inputDir", {
    type: "string",
    default: "./docs",
  })
  .option("outputDir", {
    type: "string",
    default: "./public",
  })
  .option("siteName", {
    type: "string",
  })
  .option("googleAnalyticsId", {
    type: "string",
  })
  .demandOption(["siteName", "googleAnalyticsId"]).argv;

/**
 * ENTRYPOINT
 */

const { siteName, googleAnalyticsId } = argv;
const outputDir = path.resolve(process.cwd(), argv.outputDir);
const inputDir = path.resolve(process.cwd(), argv.inputDir);
const command = argv._[0] as typeof MODE_DEV | typeof MODE_BUILD;
if (command === "dev") {
  develop();
} else if (command === "build") {
  getMarkdownFileWatcher().on("ready", () => {
    writeSiteToDisk();
    process.exit(0);
  });
}

const prism = require("prismjs");

console.log(prism.highlight("body { color: red; }"));
// const low = require("lowlight");
// const unified = require("unified");
// const rehypeStringify = require("rehype-stringify");
// const tree = low.highlight(
//   "css",
//   `em {
//   color: red;
// }`,
//   {
//     prefix: "code-",
//   }
// ).value;
// var processor = unified().use(rehypeStringify);
// var html = processor.stringify({ type: "root", children: tree }).toString();

// console.log(html);

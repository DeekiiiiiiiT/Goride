const fs = require("fs");
const remote = JSON.parse(
  fs.readFileSync(
    "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/a885e521-3dc4-4fbf-a282-996eea8d418a.txt",
    "utf8",
  ),
);
const local = JSON.parse(fs.readFileSync("tmp-mcp-invoke-args.json", "utf8"));
const norm = (s) => s.replace(/\r\n/g, "\n");
let ok = true;
for (const lf of local.files) {
  const base = lf.name.split("/").pop();
  const match = (remote.files || []).find(
    (f) =>
      f.name === lf.name ||
      f.name.endsWith("/" + lf.name) ||
      f.name.endsWith(lf.name) ||
      f.name.endsWith("/" + base),
  );
  if (!match) {
    console.log("NO_REMOTE", lf.name);
    ok = false;
    continue;
  }
  const same = norm(match.content) === norm(lf.content);
  console.log(same ? "MATCH" : "DIFF", lf.name, "->", match.name);
  if (!same) ok = false;
}
console.log(
  JSON.stringify({
    verify_jwt: remote.verify_jwt,
    version: remote.version,
    status: remote.status,
    contentOk: ok,
  }),
);

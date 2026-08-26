const fs = require("fs");
const remote = JSON.parse(
  fs.readFileSync(
    "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/2f45dc50-7e16-425d-976f-db7f0e17bb52.txt",
    "utf8",
  ),
);
const local = JSON.parse(fs.readFileSync("tmp-call-args.json", "utf8"));
const norm = (s) => s.replace(/\r\n/g, "\n");
let ok = true;
const results = [];
for (const lf of local.files) {
  const match = (remote.files || []).find(
    (f) => f.name === lf.name || f.name.endsWith("/" + lf.name) || f.name.endsWith(lf.name),
  );
  if (!match) {
    results.push({ name: lf.name, status: "NO_REMOTE" });
    ok = false;
    continue;
  }
  const same = norm(match.content) === norm(lf.content);
  results.push({ name: lf.name, status: same ? "MATCH" : "DIFF" });
  if (!same) ok = false;
}
console.log(
  JSON.stringify(
    {
      version: remote.version,
      status: remote.status,
      verify_jwt: remote.verify_jwt,
      fileCount: (remote.files || []).length,
      contentOk: ok,
      results,
    },
    null,
    2,
  ),
);

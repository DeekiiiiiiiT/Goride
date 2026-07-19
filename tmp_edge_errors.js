const fs = require("fs");
const path =
  "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/54eb2f6f-218b-4771-865d-9a0afd84928c.txt";
const d = JSON.parse(fs.readFileSync(path, "utf8"));
const events = d.result.result;
console.log("count", events.length, "versions", [...new Set(events.map((e) => e.version))]);
const nonOpts = events.filter((e) => e.method !== "OPTIONS" || e.status_code !== 503);
console.log("non-options-or-other", nonOpts.length);
for (const e of events.slice(0, 15)) {
  console.log(e.version, e.method, e.status_code, e.event_message?.slice(0, 200));
}
// look for boot messages
for (const e of events) {
  const em = e.event_message || "";
  if (/module|boot|fatal|error|EnvBoot|not found/i.test(em) && !/^OPTIONS \|/.test(em) && !/^POST \|/.test(em) && !/^GET \|/.test(em)) {
    console.log("INTERESTING", em.slice(0, 500));
  }
}

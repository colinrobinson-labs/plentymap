// Attaches the newest processed build to the App Store version and sends it to App Review.
// The version is set to manual release in App Store Connect, so approval does not publish it.
// ASC_REPLACE=1: if the version is still waiting for review with an older build, take it out of the
// queue, attach the newest build and send it again (never touches a version Apple has started reviewing).
// ASC_STATUS=1: only print where the version and its builds stand.
// The version number comes from package.json (the same number the iOS build is stamped with).
import { readFileSync } from "node:fs";
import { api, getApp } from "./asc-api.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const app = await getApp();

const versions = (await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`)).data;
let version = versions.find(v => v.attributes.versionString === VERSION);
if (!version) {
  // App Store Connect made "1.0" when the app was created; the build says 1.0.0. Rename the editable version to match.
  version = versions.find(v => /PREPARE_FOR_SUBMISSION/.test(v.attributes.appStoreState || v.attributes.appVersionState));
  if (!version) throw new Error(`No editable iOS App Store version to use for ${VERSION}`);
  console.log(`Renaming version ${version.attributes.versionString} to ${VERSION} to match the build`);
  version = (await api("PATCH", `/v1/appStoreVersions/${version.id}`, { type: "appStoreVersions", id: version.id, attributes: { versionString: VERSION } })).data;
}
let state = version.attributes.appStoreState || version.attributes.appVersionState;
const attached = async () => (await api("GET", `/v1/appStoreVersions/${version.id}/build`)).data;
const newest = async () => (await api("GET", `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${VERSION}&sort=-uploadedDate&limit=1`)).data[0];
console.log(`Version ${VERSION}: ${state}`);
if (process.env.ASC_STATUS) {
  const a = await attached(), n = await newest();
  console.log(`Attached build: ${a?.attributes.version ?? "none"}. Newest build: ${n?.attributes.version ?? "none"} (${n?.attributes.processingState ?? "-"})`);
  const subs = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&limit=5`)).data;
  for (const x of subs) console.log(`Review submission ${x.id}: ${x.attributes.state} (submitted ${x.attributes.submittedDate ?? "-"})`);
  process.exit(0);
}
const editable = st => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED/.test(st);
if (!editable(state) && !(process.env.ASC_REPLACE && /WAITING_FOR_REVIEW/.test(state))) {
  console.log(/IN_REVIEW/.test(state) ? "Apple is reviewing this version now; leaving it alone." : "Already submitted or released; nothing to do.");
  process.exit(0);
}

// Wait up to 40 minutes for Apple to finish processing the newest build.
let build;
for (let i = 0; i < 80; i++) {
  build = (await api("GET", `/v1/builds?filter[app]=${app.id}&filter[preReleaseVersion.version]=${VERSION}&sort=-uploadedDate&limit=1`)).data[0];
  const s = build?.attributes.processingState;
  console.log(`Newest build ${build?.attributes.version ?? "none"}: ${s ?? "-"}`);
  if (s === "VALID") break;
  if (s === "FAILED" || s === "INVALID") throw new Error(`Build ${build.attributes.version} ${s}`);
  await sleep(30000);
}
if (build?.attributes.processingState !== "VALID") throw new Error("Build still processing after 40 minutes; run again later.");

if (/WAITING_FOR_REVIEW/.test(state)) {
  const cur = await attached();
  if (cur?.id === build.id) { console.log(`Build ${build.attributes.version} is already the one waiting for review; nothing to do.`); process.exit(0); }
  // Take the version out of the review queue (App Store Connect calls this "Remove from review")
  const open = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=WAITING_FOR_REVIEW`)).data;
  for (const x of open) { await api("PATCH", `/v1/reviewSubmissions/${x.id}`, { type: "reviewSubmissions", id: x.id, attributes: { canceled: true } }); console.log(`Removed submission ${x.id} (build ${cur?.attributes.version}) from review`); }
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    version = (await api("GET", `/v1/appStoreVersions/${version.id}`)).data;
    state = version.attributes.appStoreState || version.attributes.appVersionState;
    const busy = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=CANCELING,WAITING_FOR_REVIEW`)).data.length;
    console.log(`Version ${VERSION}: ${state}${busy ? " (Apple is still removing it)" : ""}`);
    if (editable(state) && !busy) break;
  }
  if (!editable(state)) throw new Error(`Version did not come back from review (state ${state}); run again in a few minutes.`);
}
if (build.attributes.usesNonExemptEncryption == null) {
  await api("PATCH", `/v1/builds/${build.id}`, { type: "builds", id: build.id, attributes: { usesNonExemptEncryption: false } });
}

await api("PATCH", `/v1/appStoreVersions/${version.id}/relationships/build`, { type: "builds", id: build.id });
console.log(`Attached build ${build.attributes.version} to version ${VERSION}`);

// Reuse an open submission if one exists, else make one.
let sub = (await api("GET", `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`)).data[0];
if (!sub) {
  sub = (await api("POST", "/v1/reviewSubmissions", {
    type: "reviewSubmissions",
    attributes: { platform: "IOS" },
    relationships: { app: { data: { type: "apps", id: app.id } } },
  })).data;
}
const items = (await api("GET", `/v1/reviewSubmissions/${sub.id}/items`)).data;
if (!items.length) {
  await api("POST", "/v1/reviewSubmissionItems", {
    type: "reviewSubmissionItems",
    relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: sub.id } },
      appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
    },
  });
}
await api("PATCH", `/v1/reviewSubmissions/${sub.id}`, { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } });
console.log(`Sent version ${VERSION} (build ${build.attributes.version}) to App Review.`);

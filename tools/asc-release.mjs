// Releases the App Store version to the public.
// Approved and waiting on us (PENDING_DEVELOPER_RELEASE): releases it now.
// Still waiting for or in review: switches it to release automatically as soon as Apple approves it.
import { readFileSync } from "node:fs";
import { api, getApp } from "./asc-api.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
const app = await getApp();
const versions = (await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data;
const v = versions[0];
if (!v) throw new Error(`No iOS App Store version ${VERSION}`);
const state = v.attributes.appStoreState || v.attributes.appVersionState;
console.log(`Version ${VERSION}: ${state} (release: ${v.attributes.releaseType})`);
if (/PENDING_DEVELOPER_RELEASE/.test(state)) {
  await api("POST", "/v1/appStoreVersionReleaseRequests", { type: "appStoreVersionReleaseRequests", relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } });
  console.log(`Released ${VERSION}. It reaches the App Store within a few hours.`);
} else if (/WAITING_FOR_REVIEW|IN_REVIEW|PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED/.test(state)) {
  if (v.attributes.releaseType !== "AFTER_APPROVAL") await api("PATCH", `/v1/appStoreVersions/${v.id}`, { type: "appStoreVersions", id: v.id, attributes: { releaseType: "AFTER_APPROVAL" } });
  console.log(`Not approved yet. ${VERSION} will now go live automatically as soon as Apple approves it.`);
} else console.log("Nothing to do in this state.");

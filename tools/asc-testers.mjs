// Makes sure the internal TestFlight group exists, sees every build, and holds
// everyone on the App Store Connect team. Runs in CI with the API key secrets.
// Usage: ASC_KEY_ID=.. ASC_ISSUER=.. ASC_KEY_RAW="$(cat AuthKey.p8)" node tools/asc-testers.mjs
import crypto from "node:crypto";

const BUNDLE = "com.plentymap.app";
const GROUP = "Plenty Map team";
const { ASC_KEY_ID, ASC_ISSUER, ASC_KEY_RAW } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER || !ASC_KEY_RAW) throw new Error("ASC_KEY_ID, ASC_ISSUER and ASC_KEY_RAW are required");

function token() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64({ iss: ASC_ISSUER, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" })}`;
  const sig = crypto.sign("sha256", Buffer.from(body), { key: ASC_KEY_RAW.trim() + "\n", dsaEncoding: "ieee-p1363" });
  return `${body}.${sig.toString("base64url")}`;
}

async function api(method, path, data) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");

const app = (await api("GET", `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
if (!app) throw new Error(`No App Store Connect app for ${BUNDLE}`);

let group = (await api("GET", `/v1/apps/${app.id}/betaGroups?limit=200`)).data
  .find(g => g.attributes.isInternalGroup && g.attributes.name === GROUP);
if (!group) {
  group = (await api("POST", "/v1/betaGroups", {
    type: "betaGroups",
    attributes: { name: GROUP, isInternalGroup: true, hasAccessToAllBuilds: true },
    relationships: { app: { data: { type: "apps", id: app.id } } },
  })).data;
  console.log(`Made internal group "${GROUP}"`);
} else if (!group.attributes.hasAccessToAllBuilds) {
  await api("PATCH", `/v1/betaGroups/${group.id}`, { type: "betaGroups", id: group.id, attributes: { hasAccessToAllBuilds: true } });
  console.log(`Group "${GROUP}" now gets every build`);
} else console.log(`Group "${GROUP}" already set up`);

const inGroup = new Set((await api("GET", `/v1/betaGroups/${group.id}/betaTesters?limit=200`)).data
  .map(t => (t.attributes.email || "").toLowerCase()));
const users = (await api("GET", "/v1/users?limit=200")).data;
for (const u of users) {
  const email = (u.attributes.username || "").toLowerCase();
  if (!email.includes("@")) continue;
  if (inGroup.has(email)) { console.log(`Already a tester: ${mask(email)}`); continue; }
  await api("POST", "/v1/betaTesters", {
    type: "betaTesters",
    attributes: { email, firstName: u.attributes.firstName, lastName: u.attributes.lastName },
    relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
  });
  console.log(`Added tester: ${mask(email)}`);
}

const builds = (await api("GET", `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=3`)).data;
for (const b of builds) console.log(`Build ${b.attributes.version}: ${b.attributes.processingState}`);

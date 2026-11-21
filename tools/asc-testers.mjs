// Makes sure the internal TestFlight group exists, sees every build, and holds
// everyone on the App Store Connect team. Runs in CI with the API key secrets.
import { api, getApp } from "./asc-api.mjs";

const GROUP = "Plenty Map team";
const mask = e => e.replace(/^(.).*(@.*)$/, "$1***$2");

const app = await getApp();

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

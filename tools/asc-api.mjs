// Small App Store Connect API client for CI. Needs ASC_KEY_ID, ASC_ISSUER, ASC_KEY_RAW (the .p8 text).
import crypto from "node:crypto";

export const BUNDLE = "com.plentymap.app";
const { ASC_KEY_ID, ASC_ISSUER, ASC_KEY_RAW } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER || !ASC_KEY_RAW) throw new Error("ASC_KEY_ID, ASC_ISSUER and ASC_KEY_RAW are required");

function token() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64({ iss: ASC_ISSUER, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" })}`;
  const sig = crypto.sign("sha256", Buffer.from(body), { key: ASC_KEY_RAW.trim() + "\n", dsaEncoding: "ieee-p1363" });
  return `${body}.${sig.toString("base64url")}`;
}

export async function api(method, path, data) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

export async function getApp() {
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  if (!app) throw new Error(`No App Store Connect app for ${BUNDLE}`);
  return app;
}

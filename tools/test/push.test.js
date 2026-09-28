"use strict";
// The reminder sender (tools/push): message encryption checked against the
// RFC's own worked example, VAPID signatures, and which reminders fall due.
process.env.TZ = "America/Winnipeg";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {encrypt, vapidAuth, sendPush, keyPair, b64u, unb64u} = require("../push/webpush");
const {dueReminders, parseCallTimes, windowFor, wallMs} = require("../push/schedule");
const {callStarts} = require("../push/call-times");

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

// RFC 8291 section 5 and appendix A.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

// What a phone does with a push body (RFC 8291 in reverse).
function decrypt(body, uaPrivate, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), sealed = body.subarray(21 + idlen);
  const ua = crypto.createECDH("prime256v1");
  ua.setPrivateKey(uaPrivate);
  const shared = ua.computeSecret(asPublic);
  const ikm = crypto.hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = crypto.createDecipheriv("aes-128-gcm", Buffer.from(cek), Buffer.from(nonce));
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const out = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  assert.equal(out[out.length - 1], 2, "last-record delimiter");
  return out.subarray(0, out.length - 1).toString();
}

test("encryption matches RFC 8291's worked example byte for byte", () => {
  const out = encrypt(Buffer.from(RFC.plaintext), unb64u(RFC.uaPublic), unb64u(RFC.auth), {asPrivate: unb64u(RFC.asPrivate), salt: unb64u(RFC.salt)});
  assert.equal(b64u(out), RFC.body);
});

test("a real message round-trips: fresh keys and salt each time, and the phone can read it", () => {
  const phone = keyPair(), auth = crypto.randomBytes(16);
  const a = encrypt(Buffer.from('{"kind":"week"}'), phone.pub, auth), b = encrypt(Buffer.from('{"kind":"week"}'), phone.pub, auth);
  assert.notEqual(b64u(a), b64u(b));
  assert.equal(decrypt(a, phone.priv, auth), '{"kind":"week"}');
  assert.equal(decrypt(unb64u(RFC.body), unb64u(RFC.uaPrivate), unb64u(RFC.auth)), RFC.plaintext);
});

test("VAPID: an ES256 token for the push service's origin, signed by our key, under a day long", () => {
  const k = keyPair();
  const v = vapidAuth("https://web.push.apple.com/QAbc/def", b64u(k.priv), "https://lethalnifty.github.io/epa-tracker/", 1790000000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(v.authorization);
  assert.ok(m);
  assert.deepEqual(JSON.parse(unb64u(m[1])), {typ: "JWT", alg: "ES256"});
  const claims = JSON.parse(unb64u(m[2]));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "https://lethalnifty.github.io/epa-tracker/");
  assert.ok(claims.exp - 1790000000 <= 24 * 3600);
  assert.equal(m[4], b64u(k.pub));
  const jwk = {kty: "EC", crv: "P-256", x: b64u(k.pub.subarray(1, 33)), y: b64u(k.pub.subarray(33))};
  assert.ok(crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), {key: crypto.createPublicKey({key: jwk, format: "jwk"}), dsaEncoding: "ieee-p1363"}, unb64u(m[3])));
});

test("sending: the right headers, and a body only the phone can read", async () => {
  const phone = keyPair(), auth = crypto.randomBytes(16), server = keyPair();
  const sub = {endpoint: "https://web.push.apple.com/QAbc", keys: {p256dh: b64u(phone.pub), auth: b64u(auth)}};
  let seen;
  const r = await sendPush(sub, {kind: "call", t: 1, s: 2}, {vapidPrivate: b64u(server.priv), subject: "https://x.test/",
    fetchImpl: async (url, init) => { seen = {url, init}; return {status: 201}; }});
  assert.equal(r.status, 201);
  assert.equal(seen.url, sub.endpoint);
  assert.equal(seen.init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(seen.init.headers.TTL, "21600");
  assert.match(seen.init.headers.Authorization, /^vapid t=.+, k=/);
  assert.deepEqual(JSON.parse(decrypt(seen.init.body, phone.priv, auth)), {kind: "call", t: 1, s: 2});
});

test("Thursday at 08:00 Winnipeg time, through the clock change", () => {
  // Oct 29 is before the change (CDT), Nov 5 after (CST): 08:00 local both times.
  const due = dueReminders(at(2026, 10, 28, 12), at(2026, 11, 6, 12), []).filter(x => x.kind !== "study");
  assert.deepEqual(due, [{kind: "week", t: at(2026, 10, 29, 8)}, {kind: "week", t: at(2026, 11, 5, 8)}]);
  assert.equal(new Date(due[1].t).toISOString(), "2026-11-05T14:00:00.000Z");
  assert.equal(new Date(due[0].t).toISOString(), "2026-10-29T13:00:00.000Z");
});

test("an hour before each call, and nothing twice across back-to-back windows", () => {
  const starts = [at(2026, 10, 28, 17), at(2026, 10, 30, 17)];
  assert.deepEqual(dueReminders(at(2026, 10, 28, 15, 30), at(2026, 10, 28, 16, 0), starts), [{kind: "call", t: at(2026, 10, 28, 16), s: starts[0]}]);
  assert.deepEqual(dueReminders(at(2026, 10, 28, 16, 0), at(2026, 10, 28, 16, 30), starts), []);
  // Every 15-minute window over two days, stitched end to end: each reminder once.
  const seen = [];
  for (let t = at(2026, 10, 28); t < at(2026, 10, 31); t += 15 * 60000) seen.push(...dueReminders(t, t + 15 * 60000, starts));
  // Wed 28 and Fri 30 are call nights, so no study reminder either night.
  assert.deepEqual(seen.map(x => x.kind), ["call", "week", "call"]);
});

test("tonight's pages at 20:00 on reading nights while the plan runs", () => {
  const study = (lo, hi, starts = []) => dueReminders(lo, hi, starts).filter(x => x.kind === "study").map(x => new Date(x.t).toString().slice(0, 21));
  // Tue 29 Sep is before the start; Wed 30 is the first night; Thu 1 Oct is soccer; Fri 2 Oct reads.
  assert.deepEqual(study(at(2026, 9, 29), at(2026, 10, 4)), ["Wed Sep 30 2026 20:00", "Fri Oct 02 2026 20:00"]);
  // Nothing after 2 Jun 2027, the plan's last day.
  assert.deepEqual(study(at(2027, 6, 1), at(2027, 6, 8)), ["Tue Jun 01 2027 20:00", "Wed Jun 02 2027 20:00"]);
});

test("no study reminder on a night whose call stretch starts by 20:00", () => {
  const starts = [at(2026, 10, 5, 17)];
  const kinds = dueReminders(at(2026, 10, 5, 12), at(2026, 10, 6, 21), starts).map(x => x.kind + " " + new Date(x.t).getDate());
  assert.deepEqual(kinds, ["call 5", "study 6"]);
});

test("each run covers the time since the last run; a long pause doesn't fire a backlog", () => {
  const now = at(2026, 10, 28, 16, 4);
  assert.deepEqual(windowFor(at(2026, 10, 28, 15, 49), now), {lo: at(2026, 10, 28, 15, 49), hi: now});
  assert.deepEqual(windowFor(at(2026, 10, 20), now), {lo: now - 3 * 3600000, hi: now});
  assert.deepEqual(windowFor(null, now), {lo: now - 20 * 60000, hi: now});
});

test("CALL_TIMES: stretch starts only, read as Winnipeg time; junk reads as none", () => {
  assert.deepEqual(parseCallTimes('{"v":1,"starts":["2026-10-30T17:00","2026-10-28T17:00","bad"]}'), [at(2026, 10, 28, 17), at(2026, 10, 30, 17)]);
  assert.deepEqual(parseCallTimes(""), []);
  assert.deepEqual(parseCallTimes("{nope"), []);
  assert.equal(wallMs("2026-11-01T08:00"), at(2026, 11, 1, 8));
});

test("call-times reads the block file with the app's parser: one start per stretch, never a name", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "call-sample.ics"), "utf8");
  const starts = callStarts([text], at(2026, 10, 27, 12));
  assert.deepEqual(starts, ["2026-10-28T17:00", "2026-10-30T17:00", "2026-11-03T17:00"]);
  assert.deepEqual(callStarts([text], at(2026, 10, 31, 12)), ["2026-10-30T17:00", "2026-11-03T17:00"]);
  assert.doesNotMatch(JSON.stringify(starts), /Attending|Resident|Fellow/);
});

test("the workflow runs every 15 minutes, can send a test, and only reads its secrets", () => {
  const wf = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "reminders.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(wf, /cron: "4,19,34,49 \* \* \* \*"/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /run: node tools\/push\/send\.js/);
  assert.match(wf, /permissions:\n  actions: read\n  contents: read/);
  for (const s of ["VAPID_PRIVATE_KEY", "PUSH_SUBSCRIPTION", "CALL_TIMES"]) assert.match(wf, new RegExp(`\\$\\{\\{ secrets\\.${s} \\}\\}`));
  // The sender's logs stay generic: this repository is public.
  const send = fs.readFileSync(path.join(__dirname, "..", "push", "send.js"), "utf8");
  assert.doesNotMatch(send, /console\.log\([^)]*(msg|due|starts|sub|endpoint)/);
});

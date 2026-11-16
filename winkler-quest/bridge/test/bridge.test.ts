import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "../src/reconcile.ts";
import { LegacyUnifiClient, type UnifiController } from "../src/unifi.ts";
import { tick } from "../src/main.ts";

const groups = {
  tv: ["AA:AA:AA:AA:AA:01"],
  consoles: ["aa:aa:aa:aa:aa:02", "aa:aa:aa:aa:aa:03"],
};
const open = (group: string) => ({ group, open: true, until: "2099-01-01T00:00:00Z", kidIds: ["older"] });
const closed = (group: string) => ({ group, open: false, kidIds: [] });

test("unblocks a group with time running, blocks everything else", () => {
  const actions = reconcile(groups, [open("consoles"), closed("tv")], new Set(["aa:aa:aa:aa:aa:02", "aa:aa:aa:aa:aa:03"]));
  assert.deepEqual(actions.map((a) => `${a.action} ${a.mac}`).sort(), [
    "block aa:aa:aa:aa:aa:01",
    "unblock aa:aa:aa:aa:aa:02",
    "unblock aa:aa:aa:aa:aa:03",
  ]);
});

test("no actions when the router already matches", () => {
  assert.deepEqual(reconcile(groups, [open("tv"), closed("consoles")], new Set(["aa:aa:aa:aa:aa:02", "aa:aa:aa:aa:aa:03"])), []);
});

test("backend unreachable = fail closed", () => {
  const actions = reconcile(groups, null, new Set());
  assert.equal(actions.length, 3);
  assert.ok(actions.every((a) => a.action === "block"));
});

test("a device in two groups stays open if either is open", () => {
  const g = { tv: ["aa:01"], gaming: ["aa:01"] };
  assert.deepEqual(reconcile(g, [closed("tv"), open("gaming")], new Set()), []);
});

test("tick applies actions through the controller", async () => {
  const blocked = new Set(["aa:aa:aa:aa:aa:01"]);
  const fake: UnifiController = {
    blockedMacs: async () => new Set(blocked),
    block: async (m) => void blocked.add(m),
    unblock: async (m) => void blocked.delete(m),
    ruleStates: async () => new Map(),
    setRule: async () => {},
  };
  await tick(fake, groups, async () => [open("tv"), closed("consoles")], () => {});
  assert.deepEqual([...blocked].sort(), ["aa:aa:aa:aa:aa:02", "aa:aa:aa:aa:aa:03"]);
});

test("legacy client: logs in, sends CSRF + cookie, re-logs in on 401", async () => {
  const calls: { url: string; init: any }[] = [];
  let sessions = 0;
  let first = true;
  const fakeFetch = (async (url: string, init: any) => {
    calls.push({ url, init });
    if (url.endsWith("/api/auth/login")) {
      sessions++;
      return new Response("{}", { status: 200, headers: { "set-cookie": `TOKEN=t${sessions}; Path=/; HttpOnly`, "x-csrf-token": `c${sessions}` } });
    }
    if (first) { first = false; return new Response("", { status: 401 }); }
    if (url.endsWith("/rest/user")) {
      return Response.json({ data: [{ mac: "AA:AA:AA:AA:AA:01", blocked: true }, { mac: "aa:aa:aa:aa:aa:02", blocked: false }] });
    }
    return Response.json({ data: [] });
  }) as typeof fetch;

  const c = new LegacyUnifiClient({ baseUrl: "https://console", username: "wq-bridge", password: "x", fetchImpl: fakeFetch });
  assert.deepEqual([...(await c.blockedMacs())], ["aa:aa:aa:aa:aa:01"]);
  assert.equal(sessions, 2, "re-logged in after 401");

  await c.unblock("AA:AA:AA:AA:AA:01");
  const last = calls.at(-1)!;
  assert.equal(last.url, "https://console/proxy/network/api/s/default/cmd/stamgr");
  assert.deepEqual(JSON.parse(last.init.body), { cmd: "unblock-sta", mac: "aa:aa:aa:aa:aa:01" });
  assert.equal(last.init.headers.cookie, "TOKEN=t2");
  assert.equal(last.init.headers["x-csrf-token"], "c2");
});

test("YouTube rule: enabled (blocking) unless YouTube time is running", () => {
  const g = { "tv-youtube": { blockRule: "r1" } };
  assert.deepEqual(reconcile(g, [closed("tv-youtube")], new Set(), new Map([["r1", false]])).map((a) => a.kind === "rule" && a.enable), [true]);
  assert.deepEqual(reconcile(g, [open("tv-youtube")], new Set(), new Map([["r1", true]])).map((a) => a.kind === "rule" && a.enable), [false]);
  assert.deepEqual(reconcile(g, [open("tv-youtube")], new Set(), new Map([["r1", false]])), []);
  assert.deepEqual(reconcile(g, null, new Set(), new Map([["r1", false]])).map((a) => a.kind === "rule" && a.enable), [true]);
});

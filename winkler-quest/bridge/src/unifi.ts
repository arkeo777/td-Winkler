// UniFi controller adapters. The bridge only needs three things:
// which managed devices are blocked, block one, unblock one.

export interface UnifiController {
  /** MACs (lowercase) currently blocked on the network. */
  blockedMacs(): Promise<Set<string>>;
  block(mac: string): Promise<void>;
  unblock(mac: string): Promise<void>;
}

export interface LegacyOptions {
  /** Console address on your LAN, e.g. "https://192.168.1.1". */
  baseUrl: string;
  /** A dedicated LOCAL-ONLY admin account just for the bridge. */
  username: string;
  password: string;
  site?: string; // usually "default"
  fetchImpl?: typeof fetch;
}

/**
 * UniFi OS console (UDM / UDR / UCG / Cloud Key Gen2+) via the local
 * Network controller API (cmd/stamgr block-sta / unblock-sta).
 * This blocks the device entirely on your network until unblocked.
 *
 * TLS: consoles use a self-signed cert. Export it and point Node at it with
 * NODE_EXTRA_CA_CERTS=/path/console.pem rather than disabling verification.
 */
export class LegacyUnifiClient implements UnifiController {
  private cookie = "";
  private csrf = "";
  private readonly site: string;
  private readonly f: typeof fetch;
  private readonly opts: LegacyOptions;

  constructor(opts: LegacyOptions) {
    this.opts = opts;
    this.site = opts.site ?? "default";
    this.f = opts.fetchImpl ?? fetch;
  }

  private async login(): Promise<void> {
    const res = await this.f(`${this.opts.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.opts.username, password: this.opts.password, remember: true }),
    });
    if (!res.ok) throw new Error(`UniFi login failed: HTTP ${res.status}`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = /TOKEN=[^;]+/.exec(setCookie)?.[0];
    if (!token) throw new Error("UniFi login: no session cookie returned");
    this.cookie = token;
    this.csrf = res.headers.get("x-csrf-token") ?? "";
  }

  private async call(path: string, init: { method: string; body?: unknown }, retried = false): Promise<any> {
    if (!this.cookie) await this.login();
    const res = await this.f(`${this.opts.baseUrl}/proxy/network/api/s/${this.site}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        cookie: this.cookie,
        ...(this.csrf ? { "x-csrf-token": this.csrf } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 401 && !retried) {
      this.cookie = "";
      return this.call(path, init, true);
    }
    const updated = res.headers.get("x-updated-csrf-token");
    if (updated) this.csrf = updated;
    if (!res.ok) throw new Error(`UniFi ${init.method} ${path}: HTTP ${res.status}`);
    return res.json();
  }

  async blockedMacs(): Promise<Set<string>> {
    const body = await this.call("/rest/user", { method: "GET" });
    const rows: { mac: string; blocked?: boolean }[] = body?.data ?? [];
    return new Set(rows.filter((r) => r.blocked).map((r) => r.mac.toLowerCase()));
  }

  async block(mac: string): Promise<void> {
    await this.call("/cmd/stamgr", { method: "POST", body: { cmd: "block-sta", mac: mac.toLowerCase() } });
  }

  async unblock(mac: string): Promise<void> {
    await this.call("/cmd/stamgr", { method: "POST", body: { cmd: "unblock-sta", mac: mac.toLowerCase() } });
  }
}

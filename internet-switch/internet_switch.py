#!/usr/bin/env python3
"""
Internet Switch - one-tap internet on/off for devices on a UniFi network.

Runs a tiny web server on a computer at home. Open the page on your phone or
desktop and tap a device to block / unblock its internet (the same thing as
"Block" in the UniFi app). No extra packages needed - just Python 3.8+.

    python internet_switch.py            # start the switch page
    python internet_switch.py --find     # list devices UniFi knows about
"""

import json
import os
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")


# --------------------------------------------------------------------------
# UniFi controller client
# --------------------------------------------------------------------------
class UniFiError(Exception):
    pass


class UniFi:
    """Talks to a UniFi gateway (UDM / Cloud Gateway / UniFi OS) or a classic
    self-hosted UniFi Network controller using a local admin account."""

    def __init__(self, url, username, password, site="default", verify_ssl=False):
        self.url = url.rstrip("/")
        self.username = username
        self.password = password
        self.site = site
        self.prefix = None  # "/proxy/network" on UniFi OS, "" on classic
        self.csrf = None
        self.lock = threading.Lock()
        ctx = ssl.create_default_context()
        if not verify_ssl:  # UniFi gateways use a self-signed certificate
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx),
            urllib.request.HTTPCookieProcessor(self.jar),
        )

    def _raw(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        try:
            resp = self.opener.open(req, timeout=10)
            status, headers, raw = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, headers, raw = e.code, e.headers, e.read()
        except (urllib.error.URLError, OSError) as e:
            raise UniFiError(f"Can't reach UniFi at {self.url} ({e})")
        token = headers.get("X-CSRF-Token") or headers.get("x-updated-csrf-token")
        if token:
            self.csrf = token
        try:
            payload = json.loads(raw.decode() or "{}")
        except ValueError:
            payload = {}
        return status, payload

    def login(self):
        creds = {"username": self.username, "password": self.password}
        # UniFi OS (Dream Machine, Cloud Gateway, Cloud Key Gen2+, UniFi Express)
        status, _ = self._raw("POST", "/api/auth/login", dict(creds, rememberMe=True))
        if status == 200:
            self.prefix = "/proxy/network"
            return
        # Classic self-hosted controller
        status2, _ = self._raw("POST", "/api/login", creds)
        if status2 == 200:
            self.prefix = ""
            return
        if 401 in (status, status2) or 403 in (status, status2):
            raise UniFiError(
                "UniFi rejected the username/password. Use a LOCAL admin "
                "account (not your ui.com cloud login with 2-factor)."
            )
        raise UniFiError(f"UniFi login failed (HTTP {status} / {status2})")

    def api(self, method, path, body=None):
        with self.lock:
            if self.prefix is None:
                self.login()
            full = f"{self.prefix}/api/s/{self.site}/{path}"
            status, payload = self._raw(method, full, body)
            if status in (401, 403):  # session expired - log in again once
                self.csrf = None
                self.login()
                full = f"{self.prefix}/api/s/{self.site}/{path}"
                status, payload = self._raw(method, full, body)
            meta = payload.get("meta", {})
            if status != 200 or meta.get("rc") not in (None, "ok"):
                raise UniFiError(
                    f"UniFi request failed: {meta.get('msg') or 'HTTP ' + str(status)}"
                )
            return payload.get("data", [])

    def known_clients(self):
        return self.api("GET", "rest/user")

    def online_macs(self):
        return {c.get("mac", "").lower() for c in self.api("GET", "stat/sta")}

    def set_blocked(self, mac, blocked):
        cmd = "block-sta" if blocked else "unblock-sta"
        self.api("POST", "cmd/stamgr", {"cmd": cmd, "mac": mac.lower()})


# --------------------------------------------------------------------------
# Config + device lookup
# --------------------------------------------------------------------------
def load_config():
    if not os.path.exists(CONFIG_PATH):
        sys.exit(
            "No config.json found. Copy config.example.json to config.json "
            "and fill in your UniFi details."
        )
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    if not str(cfg.get("pin", "")).strip():
        sys.exit('Set a "pin" in config.json so the kids can\'t unblock themselves.')
    return cfg


def norm_mac(mac):
    return mac.strip().lower().replace("-", ":")


def client_label(c):
    return c.get("name") or c.get("hostname") or c.get("mac")


def resolve_devices(cfg, clients):
    """Match each configured device to UniFi clients by MAC or by name."""
    by_mac = {c.get("mac", "").lower(): c for c in clients}
    out = []
    for i, dev in enumerate(cfg["devices"]):
        macs = [norm_mac(m) for m in dev.get("macs", [])]
        if dev.get("mac"):
            macs.append(norm_mac(dev["mac"]))
        match = dev.get("match")
        if match:
            m = match.lower()
            for c in clients:
                names = [(c.get("name") or "").lower(), (c.get("hostname") or "").lower()]
                if m in names and c["mac"].lower() not in macs:
                    macs.append(c["mac"].lower())
        found = [by_mac[m] for m in macs if m in by_mac]
        out.append({
            "id": i,
            "label": dev["label"],
            "icon": dev.get("icon", ""),
            "macs": macs,
            "found": bool(found),
            "blocked": bool(found) and all(c.get("blocked") for c in found),
        })
    return out


# --------------------------------------------------------------------------
# Web server
# --------------------------------------------------------------------------
class State:
    cfg = None
    unifi = None


def device_status():
    clients = State.unifi.known_clients()
    try:
        online = State.unifi.online_macs()
    except UniFiError:
        online = set()
    devs = resolve_devices(State.cfg, clients)
    for d in devs:
        d["online"] = any(m in online for m in d["macs"])
    return devs


def set_device(dev_id, blocked):
    devs = resolve_devices(State.cfg, State.unifi.known_clients())
    targets = devs if dev_id == "all" else [d for d in devs if d["id"] == dev_id]
    for d in targets:
        for mac in d["macs"]:
            State.unifi.set_blocked(mac, blocked)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def send(self, code, body, ctype="application/json"):
        if not isinstance(body, bytes):
            body = (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authed(self):
        if self.headers.get("X-Pin", "") == str(State.cfg["pin"]):
            return True
        self.send(401, {"error": "Wrong PIN"})
        return False

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self.send(200, PAGE.replace("{{TITLE}}", State.cfg.get("title", "Internet Switch")), "text/html")
        if path == "/manifest.webmanifest":
            return self.send(200, MANIFEST, "application/manifest+json")
        if path == "/icon.svg":
            return self.send(200, ICON, "image/svg+xml")
        if path == "/api/status":
            if not self.authed():
                return
            try:
                return self.send(200, {"devices": device_status()})
            except UniFiError as e:
                return self.send(502, {"error": str(e)})
        self.send(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/api/set":
            return self.send(404, {"error": "Not found"})
        if not self.authed():
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            dev_id = body.get("id")
            if dev_id != "all":
                dev_id = int(dev_id)
            set_device(dev_id, bool(body.get("blocked")))
            self.send(200, {"devices": device_status()})
        except UniFiError as e:
            self.send(502, {"error": str(e)})
        except (ValueError, TypeError):
            self.send(400, {"error": "Bad request"})


def make_unifi(cfg):
    u = cfg["unifi"]
    return UniFi(u["url"], u["username"], u["password"], u.get("site", "default"),
                 u.get("verify_ssl", False))


def find_clients(cfg):
    unifi = make_unifi(cfg)
    clients = unifi.known_clients()
    online = unifi.online_macs()
    clients.sort(key=lambda c: client_label(c).lower())
    print(f"\n{'NAME':34} {'MAC':19} {'ONLINE':7} BLOCKED")
    print("-" * 70)
    for c in clients:
        print(f"{client_label(c)[:33]:34} {c.get('mac',''):19} "
              f"{'yes' if c.get('mac','').lower() in online else '':7} "
              f"{'BLOCKED' if c.get('blocked') else ''}")
    print("\nPut the NAME (as \"match\") or the MAC (as \"mac\") into config.json.")


def local_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    cfg = load_config()
    if "--find" in sys.argv:
        try:
            find_clients(cfg)
        except UniFiError as e:
            sys.exit(f"Error: {e}")
        return
    State.cfg = cfg
    State.unifi = make_unifi(cfg)
    try:
        State.unifi.login()
        print("Connected to UniFi OK.")
    except UniFiError as e:
        print(f"Warning: {e}\n(The page will show this error until it's fixed.)")
    port = int(cfg.get("port", 8787))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"\nInternet Switch is running.")
    print(f"  On this computer:  http://localhost:{port}")
    print(f"  On your phone:     http://{local_ip()}:{port}   (same Wi-Fi)")
    print("Leave this window open. Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


# --------------------------------------------------------------------------
# The page (phone + desktop)
# --------------------------------------------------------------------------
ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#0f172a"/>
<path d="M256 120v136" stroke="#22c55e" stroke-width="44" stroke-linecap="round"/>
<path d="M170 168a128 128 0 1 0 172 0" fill="none" stroke="#22c55e" stroke-width="44" stroke-linecap="round"/>
</svg>"""

MANIFEST = json.dumps({
    "name": "Internet Switch",
    "short_name": "Internet",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0f172a",
    "theme_color": "#0f172a",
    "icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml"}],
})

PAGE = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f172a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Internet">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<title>{{TITLE}}</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--text:#f1f5f9;--muted:#94a3b8;--on:#16a34a;--off:#dc2626;--line:#334155}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}
main{max-width:560px;margin:0 auto}
h1{font-size:22px;margin:4px 0 2px}
.sub{color:var(--muted);font-size:14px;margin-bottom:16px;min-height:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dev{border:0;border-radius:18px;padding:18px 14px;text-align:left;color:#fff;cursor:pointer;min-height:118px;
  display:flex;flex-direction:column;justify-content:space-between;transition:transform .08s,opacity .2s;font:inherit}
.dev:active{transform:scale(.97)}
.dev.on{background:var(--on)} .dev.off{background:var(--off)} .dev.missing{background:var(--card);color:var(--muted)}
.dev.busy{opacity:.55;pointer-events:none}
.name{font-size:18px;font-weight:700;display:flex;gap:8px;align-items:center}
.state{font-size:14px;font-weight:600;opacity:.95;display:flex;align-items:center;gap:6px}
.dot{width:8px;height:8px;border-radius:50%;background:#fff;opacity:.35}
.dot.live{opacity:1}
.all{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
.all button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:14px;padding:14px;font:600 15px system-ui;cursor:pointer}
.err{background:#7f1d1d;color:#fff;border-radius:12px;padding:12px;margin-bottom:12px;display:none}
.pin{display:none;flex-direction:column;gap:12px;margin-top:40px}
.pin input{font-size:28px;text-align:center;letter-spacing:8px;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.pin button{padding:14px;border-radius:14px;border:0;background:var(--on);color:#fff;font:700 17px system-ui}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:18px}
</style></head>
<body><main>
<h1>{{TITLE}}</h1>
<div class="sub" id="sub">Loading…</div>
<div class="err" id="err"></div>
<form class="pin" id="pin"><div>Enter the PIN to continue</div>
  <input id="pinIn" type="password" inputmode="numeric" autocomplete="off"><button>Unlock</button></form>
<div class="grid" id="grid"></div>
<div class="all" id="allBtns" style="display:none">
  <button data-all="1">⛔ All off</button><button data-all="0">✅ All on</button></div>
<div class="foot">Green = internet ON · Red = internet OFF · Tap to switch</div>
</main>
<script>
const $=s=>document.querySelector(s);
let pin=''; try{pin=localStorage.getItem('pin')||''}catch(e){}
let devices=[];
function showErr(m){const e=$('#err');e.textContent=m||'';e.style.display=m?'block':'none'}
async function call(url,body){
  const r=await fetch(url,{method:body?'POST':'GET',headers:{'X-Pin':pin,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const j=await r.json().catch(()=>({error:'Bad response'}));
  if(r.status===401){askPin();throw new Error('')}
  if(!r.ok)throw new Error(j.error||'Error');
  return j;
}
function askPin(){$('#pin').style.display='flex';$('#grid').innerHTML='';$('#allBtns').style.display='none';$('#sub').textContent='';$('#pinIn').focus()}
$('#pin').onsubmit=e=>{e.preventDefault();pin=$('#pinIn').value.trim();try{localStorage.setItem('pin',pin)}catch(e){};$('#pin').style.display='none';load()};
function render(){
  const g=$('#grid');g.innerHTML='';
  devices.forEach(d=>{
    const b=document.createElement('button');
    b.className='dev '+(!d.found?'missing':d.blocked?'off':'on');
    b.innerHTML=`<div class="name">${d.icon?`<span>${d.icon}</span>`:''}<span></span></div>
      <div class="state"><span class="dot ${d.online?'live':''}"></span><span></span></div>`;
    b.querySelector('.name span:last-child').textContent=d.label;
    b.querySelector('.state span:last-child').textContent=!d.found?'Not found in UniFi':d.blocked?'Internet OFF':'Internet ON';
    if(d.found)b.onclick=()=>toggle(d,b);
    g.appendChild(b);
  });
  $('#allBtns').style.display=devices.length?'grid':'none';
  const off=devices.filter(d=>d.blocked).length;
  $('#sub').textContent=off?`${off} of ${devices.length} turned off`:'Everything is on';
}
async function load(){
  try{const j=await call('/api/status');devices=j.devices;showErr('');render()}
  catch(e){if(e.message){showErr(e.message);$('#sub').textContent=''}}
}
async function toggle(d,b){
  b.classList.add('busy');
  try{const j=await call('/api/set',{id:d.id,blocked:!d.blocked});devices=j.devices;showErr('');render()}
  catch(e){b.classList.remove('busy');if(e.message)showErr(e.message)}
}
document.querySelectorAll('[data-all]').forEach(b=>b.onclick=async()=>{
  const block=b.dataset.all==='1';
  if(block&&!confirm('Turn internet OFF for all devices?'))return;
  document.querySelectorAll('.dev').forEach(x=>x.classList.add('busy'));
  try{const j=await call('/api/set',{id:'all',blocked:block});devices=j.devices;showErr('');render()}
  catch(e){render();if(e.message)showErr(e.message)}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pin)load()});
setInterval(()=>{if(!document.hidden&&pin)load()},30000);
if(pin)load();else askPin();
</script></body></html>"""


if __name__ == "__main__":
    main()

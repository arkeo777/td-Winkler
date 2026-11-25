"""Small HTTP helper with retries and a polite per-host rate limit. Read-only public APIs."""
from __future__ import annotations

import time
from urllib.parse import urlparse

import requests

USER_AGENT = "paper-trader/1.0 (simulation only)"


class Http:
    def __init__(self, min_interval: dict | None = None, timeout: float = 15.0):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = USER_AGENT
        self.timeout = timeout
        self.min_interval = min_interval or {}
        self._last = {}

    def _wait(self, host: str) -> None:
        gap = self.min_interval.get(host, 0.2)
        elapsed = time.monotonic() - self._last.get(host, 0.0)
        if elapsed < gap:
            time.sleep(gap - elapsed)
        self._last[host] = time.monotonic()

    def request(self, method: str, url: str, retries: int = 3, ok_404: bool = False, **kw):
        host = urlparse(url).netloc
        err = None
        for attempt in range(retries):
            self._wait(host)
            try:
                r = self.s.request(method, url, timeout=self.timeout, **kw)
                if r.status_code == 429 or r.status_code >= 500:
                    err = RuntimeError(f"{host} returned {r.status_code}")
                    time.sleep(2 ** attempt)
                    continue
                if ok_404 and r.status_code in (400, 404):
                    return None
                r.raise_for_status()
                return r.json()
            except (requests.ConnectionError, requests.Timeout) as e:
                err = e
                time.sleep(2 ** attempt)
        raise RuntimeError(f"request to {host} failed: {err}")

    def get(self, url: str, **kw):
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw):
        return self.request("POST", url, **kw)

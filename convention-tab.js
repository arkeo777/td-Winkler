/* Convention tab for the marketing website.
   Drop this one line into the site (before </body>):

     <script src="https://YOUR-HOST/convention-tab.js"
             data-nav="#site-nav"          (optional: CSS selector of the menu to add the tab to)
             data-label="Conventions"      (optional: tab text)
             defer></script>

   It reads conventions.json (published next to this script, or set data-feed="…")
   and shows a "Conventions" tab ONLY while a show marked "Show on website" is in
   its window (start date − lead days → end date + tail days). Outside that window
   nothing is added, so the tab is effectively hidden. Shows marked "Hidden" never
   appear here — their landing page is reachable only through the printed QR code.

   If data-nav isn't given or isn't found, a small floating pill is shown instead.
   Style hooks: .pb-conv-tab (the menu link) and .pb-conv-pill (the floating pill). */
(function () {
  "use strict";
  var script = document.currentScript || (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var base = new URL(".", script.src);
  var feedUrl = script.getAttribute("data-feed") || new URL("conventions.json", base).href;
  var navSel = script.getAttribute("data-nav");
  var label = script.getAttribute("data-label") || "Conventions";

  function parseYMD(s) { if (!s) return null; var p = String(s).slice(0, 10).split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); return isNaN(d) ? null : d; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function inWindow(c, today) {
    if (c.siteTab !== "show") return false;
    var s = parseYMD(c.startDate), e = parseYMD(c.endDate) || s;
    if (!s) return false;
    return today >= addDays(s, -(c.leadDays == null ? 7 : +c.leadDays)) && today <= addDays(e, c.tailDays == null ? 3 : +c.tailDays);
  }

  function run(feed) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var active = (feed.conventions || []).filter(function (c) { return inWindow(c, today); })
      .sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
    if (!active.length) return; // nothing running — keep the tab hidden

    var landing = feed.landingUrl || new URL("convention.html", base).href;
    var href = active.length === 1
      ? landing + (landing.indexOf("?") > -1 ? "&" : "?") + "c=" + encodeURIComponent(active[0].slug) + "&src=site"
      : landing;
    var title = active.length === 1 ? "Meet us at " + active[0].name + (active[0].booth ? " \u00b7 Booth " + active[0].booth : "") : "See where we'll be";

    var nav = navSel ? document.querySelector(navSel) : null;
    var a = document.createElement("a");
    a.href = href; a.textContent = label; a.title = title;
    if (nav) {
      a.className = "pb-conv-tab";
      // match the site's own menu markup when it's a list
      if (nav.tagName === "UL" || nav.tagName === "OL") { var li = document.createElement("li"); li.appendChild(a); nav.appendChild(li); }
      else nav.appendChild(a);
    } else {
      a.className = "pb-conv-pill";
      a.textContent = title;
      a.setAttribute("style", "position:fixed;right:16px;bottom:16px;z-index:9999;background:#0E1B22;color:#EAFBFA;" +
        "padding:10px 16px;border-radius:999px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none;" +
        "box-shadow:0 6px 20px rgba(0,0,0,.25);border:1px solid rgba(79,224,214,.45);max-width:calc(100% - 32px)");
      document.body.appendChild(a);
    }
  }

  fetch(feedUrl, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (feed) { if (feed) run(feed); })
    .catch(function () { /* feed unavailable: leave the site untouched */ });
})();

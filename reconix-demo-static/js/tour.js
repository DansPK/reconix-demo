/* Guided tour — walks the 8 demo-script beats, driving each surface. */
window.Tour = (function () {
  const D = window.RECONIX;
  let i = 0, active = false;

  const bar = () => document.getElementById("tourBar");
  const spot = () => document.getElementById("tourSpotlight");

  // optional spotlight target per beat (selector resolved after the surface renders)
  const SPOT = {
    2: "#surface-terminal .term-menu",
    4: "#surface-terminal .term-panel.accent",
    5: "#surface-terminal .exec-log",
    6: "#surface-terminal .term-panel.accent",
    7: "#surface-dashboard .fnd-split, #surface-dashboard .dash-content",
    8: "#surface-vscode .vsc-panel",
  };

  function surface(name) { return window[name[0].toUpperCase() + name.slice(1)]; }

  function go(n) {
    i = Math.max(0, Math.min(D.tour.length - 1, n));
    const beat = D.tour[i];
    window.App.show(beat.surface, true);
    const s = surface(beat.surface);
    if (s && s.goto) s.goto(beat.state);
    paint(beat);
    // spotlight after the surface has rendered
    setTimeout(() => spotlight(SPOT[beat.n]), 120);
  }

  function paint(beat) {
    document.getElementById("tourStep").textContent = `Step ${beat.n}/${D.tour.length}`;
    document.getElementById("tourTitle").textContent = beat.title;
    document.getElementById("tourSay").textContent = beat.say;
    document.getElementById("tourLines").textContent = "script " + beat.lines;
    document.getElementById("tourPrev").disabled = i === 0;
    document.getElementById("tourNext").disabled = i === D.tour.length - 1;
  }

  function spotlight(sel) {
    const sp = spot();
    if (!sel) { sp.hidden = true; return; }
    const el = document.querySelector(sel);
    if (!el) { sp.hidden = true; return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0) { sp.hidden = true; return; }
    const pad = 6;
    sp.style.left = (r.left - pad) + "px";
    sp.style.top = (r.top - pad) + "px";
    sp.style.width = (r.width + pad * 2) + "px";
    sp.style.height = (r.height + pad * 2) + "px";
    sp.hidden = false;
  }

  function open() {
    active = true; i = 0;
    bar().hidden = false;
    document.getElementById("tourToggle").classList.add("on");
    document.getElementById("tourToggle").textContent = "■ Stop tour";
    go(0);
  }
  function close() {
    active = false;
    bar().hidden = true; spot().hidden = true;
    document.getElementById("tourToggle").classList.remove("on");
    document.getElementById("tourToggle").textContent = "▶ Guided tour";
  }
  function toggle() { active ? close() : open(); }

  function wire() {
    document.getElementById("tourNext").onclick = () => go(i + 1);
    document.getElementById("tourPrev").onclick = () => go(i - 1);
    document.getElementById("tourClose").onclick = close;
    document.addEventListener("keydown", e => {
      if (!active) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
      else if (e.key === "Escape") close();
    });
    window.addEventListener("resize", () => { if (active) spotlight(SPOT[D.tour[i].n]); });
  }

  return { wire, toggle, get active() { return active; } };
})();

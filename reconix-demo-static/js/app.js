/* App shell — boots the three surfaces, handles top-nav switching, toasts, and the tour. */
window.App = (function () {
  const surfaces = {
    terminal: { el: null, mod: window.Terminal, mounted: false },
    dashboard: { el: null, mod: window.Dashboard, mounted: false },
    vscode: { el: null, mod: window.VSCode, mounted: false },
  };
  let current = "terminal";

  function show(name, fromTour) {
    if (!surfaces[name]) return;
    current = name;
    const s = surfaces[name];
    if (!s.mounted) { s.mod.mount(s.el); s.mounted = true; }
    Object.entries(surfaces).forEach(([k, v]) => v.el.classList.toggle("active", k === name));
    document.querySelectorAll("#surfaceTabs button").forEach(b => b.classList.toggle("active", b.dataset.surface === name));
    // if the user navigates by hand while a tour is active, leave the tour running but drop the spotlight
    if (!fromTour) document.getElementById("tourSpotlight").hidden = true;
  }

  function toast(msg) {
    const wrap = document.getElementById("toastWrap");
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="t-ico">◆</span><span>${String(msg).replace(/[<>]/g, "")}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; t.style.transition = "all .3s"; }, 2600);
    setTimeout(() => t.remove(), 2950);
  }

  function init() {
    surfaces.terminal.el = document.getElementById("surface-terminal");
    surfaces.dashboard.el = document.getElementById("surface-dashboard");
    surfaces.vscode.el = document.getElementById("surface-vscode");

    document.querySelectorAll("#surfaceTabs button").forEach(b => b.onclick = () => show(b.dataset.surface));
    document.getElementById("tourToggle").onclick = () => window.Tour.toggle();
    window.Tour.wire();

    // mount the first surface eagerly; others on demand
    show("terminal");
  }

  return { show, toast, init, get current() { return current; } };
})();

document.addEventListener("DOMContentLoaded", window.App.init);

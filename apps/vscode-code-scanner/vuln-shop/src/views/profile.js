// src/views/profile.js — client-side profile renderer (intentionally vulnerable)
//
// Loaded in the browser. Reads the `name` query parameter and writes it into
// the page. Because it uses innerHTML with untrusted input, a crafted URL like
//   /profile?name=<img src=x onerror=alert(1)>
// executes script in the victim's session (reflected XSS, CWE-79).

export function renderProfileClient() {
  const params = new URLSearchParams(window.location.search);
  const el = document.getElementById("profile-name");
  if (!el) {
    return;
  }

  const greeting = document.getElementById("greeting");
  if (greeting) {
    greeting.textContent = "Welcome back";
  }

  // Safe alternative: textContent escapes markup
  // el.textContent = params.get('name');
  // BUG: innerHTML with untrusted input
  el.innerHTML = params.get('name');
}

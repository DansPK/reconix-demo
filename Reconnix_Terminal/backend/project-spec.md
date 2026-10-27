I'll create a comprehensive project spec for a security testing harness with local LLM integration. This will be a TUI-based tool similar to Claude Code but focused on automated security testing. 

Here's a comprehensive project specification for a security testing harness - a security testing harness with TUI and local LLM integration:

```markdown
# Security Testing Harness with Local LLM

A TUI-based security testing automation tool that integrates Nuclei, OWASP ZAP, and local LLMs for intelligent vulnerability assessment.

## Project Overview

This is a terminal-based security testing harness that:
- Provides an interactive TUI for managing security scans
- Integrates with local LLMs (via Ollama) for intelligent analysis
- Orchestrates Nuclei and OWASP ZAP scans
- Manages multiple target types (Web, API, Network, Source Code)
- Generates AI-assisted vulnerability reports

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         HARNESS TUI                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │   Chat     │  │  Targets   │  │   Scans    │  │ Report │ │
│  │   Panel    │  │   Manager  │  │   Runner   │  │ Viewer │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌────────┐   ┌────────┐   ┌──────────┐
   │ Ollama │   │ Nuclei │   │ OWASP ZAP│
   │  LLM   │   │Scanner │   │  Scanner │
   └────────┘   └────────┘   └──────────┘
        │            │            │
        └────────────┼────────────┘
                     ▼
            ┌────────────────┐
            │ Target Types   │
            │ - Web App      │
            │ - API          │
            │ - Network      │
            │ - Source Code  │
            └────────────────┘
```

## Tech Stack

- **Language**: Python 3.11+
- **TUI Framework**: Textual (https://textual.textualize.io/)
- **LLM Integration**: Ollama (local) with OpenAI-compatible API
- **Security Tools**: Nuclei, OWASP ZAP (via API)
- **Data**: SQLite for scan history, JSON for config
- **Async**: asyncio for concurrent operations

## Directory Structure

```
harness/
├── harness/
│   ├── __init__.py
│   ├── app.py                 # Main TUI Application
│   ├── config.py              # Configuration management
│   ├── db.py                  # SQLite database layer
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── client.py          # Ollama API client
│   │   ├── prompts.py         # System prompts for security analysis
│   │   └── analyzer.py        # Vulnerability analysis logic
│   ├── scanners/
│   │   ├── __init__.py
│   │   ├── base.py            # Base scanner interface
│   │   ├── nuclei.py          # Nuclei integration
│   │   ├── zap.py             # OWASP ZAP integration
│   │   └── manager.py         # Scanner orchestration
│   ├── targets/
│   │   ├── __init__.py
│   │   ├── base.py            # Base target class
│   │   ├── web.py             # Web application target
│   │   ├── api.py             # API target
│   │   ├── network.py         # Network target
│   │   └── source.py          # Source code target
│   ├── ui/
│   │   ├── __init__.py
│   │   ├── screens/
│   │   │   ├── __init__.py
│   │   │   ├── main.py        # Main dashboard
│   │   │   ├── chat.py        # LLM chat interface
│   │   │   ├── targets.py     # Target management
│   │   │   ├── scans.py       # Scan control
│   │   │   └── reports.py     # Report viewer
│   │   ├── widgets/
│   │   │   ├── __init__.py
│   │   │   ├── chat_message.py
│   │   │   ├── scan_progress.py
│   │   │   ├── target_card.py
│   │   │   └── vuln_table.py
│   │   └── styles.css         # TUI styling
│   └── utils/
│       ├── __init__.py
│       ├── validators.py      # URL/IP validators
│       └── parsers.py         # Output parsers
├── tests/
│   ├── targets/
│   │   ├── vuln_web/          # Vulnerable web app for testing
│   │   ├── vuln_api/          # Vulnerable API for testing
│   │   └── vuln_src/          # Vulnerable code for testing
│   └── test_scanners.py
├── config/
│   └── harness.yaml          # Default configuration
├── requirements.txt
├── pyproject.toml
└── README.md
```

## Core Features

### 1. TUI Interface (Textual)

**Main Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Pentest Harness v0.1.0                              [🟢 Connected]  │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│  🎯      │  ┌─────────────────────────────────────────────┐   │
│  Targets │  │  Chat with AI Assistant                      │   │
│          │  │  ─────────────────────────────────────────── │   │
│  🔍      │  │  > Analyze the Nuclei scan results for       │   │
│  Scans   │  │    SQL injection vulnerabilities            │   │
│          │  │                                              │   │
│  📊      │  │  🤖 Assistant:                               │   │
│  Reports │  │  Found 3 potential SQLi issues. The most     │   │
│          │  │  critical is in /api/search (time-based).   │   │
│  ⚙️      │  │  Recommended payload: ' OR SLEEP(5)--        │   │
│  Config  │  │                                              │   │
│          │  └─────────────────────────────────────────────┘   │
│          │                                                      │
│          │  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│          │  │ Quick Scan   │ │ Full Scan    │ │ Custom     │ │
│          │  └──────────────┘ └──────────────┘ └────────────┘ │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

**Key Screens:**
- **Dashboard**: Overview of targets, recent scans, vulnerabilities
- **Chat**: Interactive LLM assistant for security guidance
- **Targets**: Add/manage web apps, APIs, networks, source code
- **Scans**: Configure and run scans, view real-time progress
- **Reports**: View findings with AI-generated explanations

### 2. LLM Integration (Ollama)

**Configuration:**
```yaml
llm:
  provider: ollama
  host: http://localhost:11434
  model: qwen2.5-coder:14b  # or llama3.1, mistral, etc.
  context_window: 32768
  temperature: 0.2
```

**Capabilities:**
- Analyze scan results and explain vulnerabilities
- Suggest remediation steps
- Generate custom Nuclei templates
- Answer security questions
- Summarize large reports

**Prompts:**
- `VULN_ANALYSIS`: Analyze vulnerability findings
- `REMEDIATION`: Suggest fixes for discovered issues
- `TEMPLATE_GEN`: Generate Nuclei templates
- `SUMMARIZE`: Summarize scan results

### 3. Scanner Integrations

#### Nuclei Scanner
```python
class NucleiScanner(BaseScanner):
    """Nuclei vulnerability scanner integration"""
    
    async def scan(self, target: Target, config: ScanConfig) -> ScanResult:
        # Run nuclei with specified templates
        # Parse JSON output
        # Return structured results
```

**Supported Scans:**
- CVE detection (`-tags cve`)
- Vulnerability categories (`-tags sqli,xss,rce,lfi,ssrf`)
- Misconfiguration detection
- Technology fingerprinting
- Custom template support

#### OWASP ZAP Scanner
```python
class ZAPScanner(BaseScanner):
    """OWASP ZAP scanner integration"""
    
    async def spider(self, target: Target) -> None:
        # Run ZAP spider for crawling
    
    async def active_scan(self, target: Target) -> ScanResult:
        # Run active scan policies
```

**Supported Scans:**
- Passive scanning (headers, cookies, info leakage)
- Active scanning (SQLi, XSS, CSRF, injection)
- Spider/crawling
- API scanning (via OpenAPI spec)
- Authentication handling

### 4. Target Types

#### Web Application Target
```python
class WebTarget(Target):
    url: str
    auth: Optional[AuthConfig]
    scope: List[str]  # in-scope URLs
```

#### API Target
```python
class APITarget(Target):
    base_url: str
    spec: Optional[str]  # OpenAPI/Swagger spec path
    auth: Optional[AuthConfig]
```

#### Network Target
```python
class NetworkTarget(Target):
    hosts: List[str]  # IP ranges, CIDR notation
    ports: List[int]
```

#### Source Code Target
```python
class SourceTarget(Target):
    path: str  # Local path to source
    language: str  # python, javascript, go, etc.
    # Uses semgrep or codeql for analysis
```

### 5. Database Schema (SQLite)

```sql
-- targets table
CREATE TABLE targets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- web, api, network, source
    config JSON,
    created_at TIMESTAMP
);

-- scans table
CREATE TABLE scans (
    id INTEGER PRIMARY KEY,
    target_id INTEGER,
    scanner_type TEXT,  -- nuclei, zap
    status TEXT,  -- pending, running, completed, failed
    config JSON,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES targets(id)
);

-- findings table
CREATE TABLE findings (
    id INTEGER PRIMARY KEY,
    scan_id INTEGER,
    severity TEXT,  -- critical, high, medium, low, info
    title TEXT,
    description TEXT,
    evidence TEXT,
    remediation TEXT,
    cve_id TEXT,
    cvss_score REAL,
    location TEXT,  -- URL, file:line, etc.
    verified BOOLEAN,
    FOREIGN KEY (scan_id) REFERENCES scans(id)
);
```

## Installation & Setup

### Prerequisites
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5-coder:14b

# Install Nuclei
brew install nuclei  # macOS
# or
apt install nuclei   # Linux

# Install OWASP ZAP
# Download from https://www.zaproxy.org/download/
```

### Install the harness
```bash
# Clone repository
git clone https://github.com/yourusername/harness.git
cd harness

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the harness
harness
```

## Configuration File

```yaml
# ~/.config/harness/config.yaml

app:
  theme: dark
  auto_save: true

llm:
  provider: ollama
  host: http://localhost:11434
  model: qwen2.5-coder:14b
  timeout: 120

scanners:
  nuclei:
    path: /usr/local/bin/nuclei
    templates_path: ~/.local/nuclei-templates
    threads: 25
    timeout: 300
    
  zap:
    path: /Applications/OWASP ZAP.app/Contents/Java/zap.sh
    api_host: localhost
    api_port: 8080
    api_key: null  # Set if ZAP API requires auth

targets:
  default_scan_profile: standard
  verify_ssl: false
  follow_redirects: true

reporting:
  formats: [json, html, markdown]
  output_dir: ~/harness-reports
```

## CLI Commands

```bash
# Start TUI
harness

# Quick scan from CLI
harness scan --target https://example.com --scanner nuclei

# Add target
harness target add --name "Production API" --type api --url https://api.example.com

# Run specific scan
harness scan --target-id 1 --profile full

# Generate report
harness report --scan-id 5 --format html --output report.html

# Chat with LLM
harness chat "How do I test for SQL injection?"
```

## Test Targets Setup

Create vulnerable targets to verify all PoC types work:

### 1. Vulnerable Web App (DVWA or similar)
```bash
docker run -d -p 8081:80 vulnerables/web-dvwa
# Target: http://localhost:8081
# Tests: SQLi, XSS, CSRF, command injection
```

### 2. Vulnerable API (crAPI or similar)
```bash
docker run -d -p 8082:80 crapi/crapi-all
# Target: http://localhost:8082
# Tests: Broken auth, excessive data exposure, mass assignment
```

### 3. Vulnerable Network Services
```bash
# Metasploitable2 or similar VM
# Tests: Open ports, service banners, known CVEs
```

### 4. Vulnerable Source Code
```bash
# Clone intentionally vulnerable repos
git clone https://github.com/OWASP/Vulnerable-Web-Applications.git
# Tests: Hardcoded secrets, injection flaws, misconfigurations
```

## Key Bindings (TUI)

| Key | Action |
|-----|--------|
| `Ctrl+Q` | Quit |
| `Ctrl+N` | New target |
| `Ctrl+S` | Start scan |
| `Ctrl+R` | View reports |
| `Tab` | Next panel |
| `Shift+Tab` | Previous panel |
| `Ctrl+L` | Focus chat |
| `Ctrl+T` | Toggle sidebar |
| `?` | Help |

## Development Tasks

### Phase 1: Core Framework
- [ ] Set up project structure with Textual
- [ ] Implement base TUI layout with sidebar navigation
- [ ] Create configuration management
- [ ] Implement SQLite database layer

### Phase 2: LLM Integration
- [ ] Ollama API client with async support
- [ ] Chat interface widget
- [ ] System prompts for security analysis
- [ ] Context management for long conversations

### Phase 3: Scanner Integration
- [ ] Nuclei scanner wrapper with JSON parsing
- [ ] ZAP scanner with API integration
- [ ] Scan progress monitoring
- [ ] Result storage and retrieval

### Phase 4: Target Management
- [ ] Target CRUD operations
- [ ] Target validation (URL, IP, file path)
- [ ] Authentication handling
- [ ] Scope management

### Phase 5: Reporting
- [ ] Vulnerability table view
- [ ] Report generation (JSON, HTML, Markdown)
- [ ] AI-powered analysis integration
- [ ] Export functionality

### Phase 6: Testing
- [ ] Set up vulnerable targets
- [ ] Test all vulnerability types
- [ ] Integration tests
- [ ] Documentation

## API Reference

### Ollama Integration
```python
class OllamaClient:
    async def chat(self, messages: List[Message]) -> str
    async def analyze_findings(self, findings: List[Finding]) -> Analysis
    async def generate_template(self, description: str) -> str
```

### Scanner Interface
```python
class BaseScanner(ABC):
    @abstractmethod
    async def scan(self, target: Target, config: ScanConfig) -> ScanResult
    
    @abstractmethod
    async def validate(self) -> bool  # Check if scanner is available
```

## Future Enhancements

- [ ] Burp Suite integration
- [ ] Semgrep/SAST integration
- [ ] Custom script support (Python/JS)
- [ ] CI/CD pipeline integration
- [ ] Web dashboard (optional)
- [ ] Team collaboration features
- [ ] Vulnerability trending
- [ ] Exploit suggestion with Metasploit

## License

MIT License
```

This spec provides a complete blueprint for building a security testing harness with:
- **Textual TUI** for the interface
- **Ollama** for local LLM integration
- **Nuclei + ZAP** for vulnerability scanning
- Support for **Web, API, Network, and Source Code** targets

You can feed this directly to Claude Code for implementation. The modular structure allows incremental development starting with the core TUI framework, then adding LLM integration, scanners, and target management.

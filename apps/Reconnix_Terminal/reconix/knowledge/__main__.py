"""`python -m reconix.knowledge` — the knowledge store's command line (see `cli.py`)."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())

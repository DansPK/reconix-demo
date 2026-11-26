"""The prepared history: each system once, no shared finding, and the scan you run is its last."""

import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from reconix.store import lists
from reconix.store.seed import TARGET
from reconix.store.snapshot import snapshot

from .cvss import band, base_score
from .support import run_to

ROOT = Path(__file__).resolve().parents[1]
HISTORY = [json.loads(path.read_text(encoding="utf-8"))
           for path in sorted((ROOT / "web" / "sample-data").glob("*.json"))]
SHOWCASE = [a for a in HISTORY if a["target"] == TARGET]


def test_every_assessment_has_its_own_target_label_and_findings():
    assert HISTORY
    for values in ([a["target"] for a in HISTORY], [a["label"] for a in HISTORY],
                   [f["title"] for a in HISTORY for f in a["findings"]],
                   [f["description"] for a in HISTORY for f in a["findings"]]):
        assert [value for value, count in Counter(values).items() if count > 1] == []


def test_only_the_showcase_tells_the_sql_injection_story():
    [showcase] = SHOWCASE
    for assessment in HISTORY:
        told = "48,215" in json.dumps(assessment)
        assert told == (assessment is showcase), assessment["target"]
    critical = [f["title"] for a in HISTORY for f in a["findings"] if f["severity"] == "CRITICAL"]
    assert critical == ["SQL injection in catalog search"]


def test_scores_match_their_vectors_and_severities():
    for finding in (f for a in HISTORY for f in a["findings"]):
        score = base_score(finding["cvss_vector"])
        assert score == finding["cvss_score"], finding["title"]
        assert band(score) == finding["severity"], finding["title"]


def test_the_scan_you_run_gives_the_showcase_findings():
    [showcase] = SHOWCASE
    run_to(None)
    live = snapshot(lists.current())
    assert live["target"] == showcase["target"]
    assert live["findings"] == showcase["findings"]


@pytest.mark.parametrize("env, saves", [({}, False), ({"RECONIX_SAVE": "1"}, True)])
def test_a_scan_is_saved_only_when_asked(env, saves):
    clean = {k: v for k, v in os.environ.items() if not k.startswith("RECONIX_")}
    code = ("from reconix.store import persist, lists; "
            "print(persist.ENABLED, persist.DATA_DIR == persist.PREPARED, lists.current().label)")
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env={**clean, **env},
                         capture_output=True, text=True, check=True).stdout.split()
    [showcase] = SHOWCASE
    assert out == [str(saves), str(not saves), showcase["label"]]

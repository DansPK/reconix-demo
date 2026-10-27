"""The test-only CVSS 3.1 calculator, checked against scores FIRST publishes."""

import pytest

from .cvss import band, base_score


@pytest.mark.parametrize("vector, score", [
    ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8),
    ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0),
    ("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 6.5),
    ("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1),     # reflected XSS
    ("CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.8),
    ("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N", 3.7),
    ("CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N", 0.0),
])
def test_base_score(vector, score):
    assert base_score(vector) == score


@pytest.mark.parametrize("score, name", [
    (9.0, "CRITICAL"), (8.9, "HIGH"), (7.0, "HIGH"), (6.9, "MEDIUM"), (4.0, "MEDIUM"),
    (3.9, "LOW"), (0.1, "LOW"), (0.0, "NONE"),
])
def test_band(score, name):
    assert band(score) == name

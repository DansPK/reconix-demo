"""CVSS 3.1 base score from a vector string (FIRST spec §7.1), for checking demo data."""

import math
from typing import Dict

WEIGHTS: Dict[str, Dict[str, float]] = {
    "AV": {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2},
    "AC": {"L": 0.77, "H": 0.44},
    "UI": {"N": 0.85, "R": 0.62},
    "C": {"H": 0.56, "L": 0.22, "N": 0.0},
    "I": {"H": 0.56, "L": 0.22, "N": 0.0},
    "A": {"H": 0.56, "L": 0.22, "N": 0.0},
}
PRIVILEGES = {"U": {"N": 0.85, "L": 0.62, "H": 0.27}, "C": {"N": 0.85, "L": 0.68, "H": 0.5}}


def roundup(value: float) -> float:
    """The spec's Roundup: the smallest one-decimal number >= value (float-safe)."""
    whole = round(value * 100000)
    if whole % 10000 == 0:
        return whole / 100000.0
    return (math.floor(whole / 10000) + 1) / 10.0


def base_score(vector: str) -> float:
    prefix, _, body = vector.partition("/")
    assert prefix == "CVSS:3.1", vector
    metrics = dict(part.split(":", 1) for part in body.split("/"))
    scope = metrics["S"]
    iss = 1 - ((1 - WEIGHTS["C"][metrics["C"]]) * (1 - WEIGHTS["I"][metrics["I"]])
               * (1 - WEIGHTS["A"][metrics["A"]]))
    if scope == "U":
        impact = 6.42 * iss
    else:
        impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    exploitability = (8.22 * WEIGHTS["AV"][metrics["AV"]] * WEIGHTS["AC"][metrics["AC"]]
                      * PRIVILEGES[scope][metrics["PR"]] * WEIGHTS["UI"][metrics["UI"]])
    if impact <= 0:
        return 0.0
    if scope == "U":
        return roundup(min(impact + exploitability, 10))
    return roundup(min(1.08 * (impact + exploitability), 10))


def band(score: float) -> str:
    """The qualitative severity for a base score."""
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "NONE"          # a 0.0 score has no severity

"""Translate harness/volume paths to the paths the Kali container sees.

The harness unpacks code under its data dir (e.g. ``/data/sessions/<id>/code``) and the Kali
container mounts the same shared volume (e.g. at ``/workspace``). `cfg.kali_workspace_map` is the
ordered list of (host_prefix, container_prefix) pairs; only code/target/config paths are remapped,
never the findings the harness reads back from its own local copy.
"""

import posixpath

from harness.scanners.kali import KaliError


def to_container(cfg, host_path):
    """Map a harness-side absolute path to the container path via the longest matching prefix."""
    host_path = str(host_path).replace("\\", "/").rstrip("/")
    best = None
    for host_prefix, container_prefix in cfg.kali_workspace_map:
        hp = str(host_prefix).replace("\\", "/").rstrip("/")
        if host_path == hp or host_path.startswith(hp + "/"):
            if best is None or len(hp) > len(best[0]):
                best = (hp, str(container_prefix).rstrip("/"))
    if best is None:
        raise KaliError(f"no Kali workspace mapping covers {host_path!r}; set KALI_WORKSPACE_MAP")
    hp, cp = best
    rest = host_path[len(hp):].lstrip("/")
    return posixpath.join(cp, rest) if rest else cp


def map_targets(cfg, code_dir, rel_files):
    """Return (container_code_dir, [container absolute file paths]) for the given repo-relative files."""
    container_dir = to_container(cfg, code_dir)
    return container_dir, [posixpath.join(container_dir, f) for f in rel_files]

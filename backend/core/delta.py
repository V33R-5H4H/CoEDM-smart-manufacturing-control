"""
backend/core/delta.py
---------------------
Shared utility for WebSocket delta / snapshot / heartbeat messaging.

Provides:
  - compute_delta()         — recursive dict diff with float tolerance
  - build_snapshot_message() — JSON-encode a full-state snapshot
  - build_delta_message()    — JSON-encode a changed-fields-only delta
  - build_heartbeat_message()— JSON-encode a keep-alive heartbeat
"""

import json
from typing import Any

# Sensor floats that differ by less than this are treated as "unchanged".
# 0.001 covers ADC quantisation noise on typical vibration sensors.
FLOAT_TOLERANCE = 0.001


def compute_delta(old: dict, new: dict, tolerance: float = FLOAT_TOLERANCE) -> dict:
    """
    Recursively compute which fields changed between *old* and *new*.

    Returns a (possibly nested) dict containing only the changed keys.
    An empty dict means nothing changed.

    Rules:
    - float vs float : changed if abs(new - old) > tolerance
    - None vs any   : always changed
    - dict vs dict  : recurse
    - everything else: changed if new != old
    """
    delta: dict = {}
    all_keys = set(old) | set(new)

    for key in all_keys:
        old_val: Any = old.get(key)
        new_val: Any = new.get(key)

        # Both are dicts → recurse
        if isinstance(new_val, dict) and isinstance(old_val, dict):
            sub = compute_delta(old_val, new_val, tolerance)
            if sub:
                delta[key] = sub

        # Both are plain floats → tolerance comparison
        elif isinstance(new_val, float) and isinstance(old_val, float):
            if abs(new_val - old_val) > tolerance:
                delta[key] = new_val

        # Any other type (int, bool, str, None, or mixed-type) → equality check
        else:
            if new_val != old_val:
                delta[key] = new_val

    return delta


def build_snapshot_message(data: dict) -> str:
    """Return a full-state snapshot frame as a JSON string."""
    return json.dumps({"type": "snapshot", "data": data})


def build_delta_message(delta: dict) -> str:
    """Return a changed-fields-only delta frame as a JSON string."""
    return json.dumps({"type": "delta", "data": delta})


def build_heartbeat_message(timestamp: float) -> str:
    """Return a lightweight keep-alive heartbeat frame as a JSON string."""
    return json.dumps({"type": "heartbeat", "timestamp": timestamp})

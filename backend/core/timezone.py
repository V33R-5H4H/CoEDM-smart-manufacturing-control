"""
backend/core/timezone.py
========================
Provides helpers to manage datetimes in Indian Standard Time (IST).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

# Global IST timezone object
IST = ZoneInfo("Asia/Kolkata")


def ist_now() -> datetime:
    """Return the current time in Indian Standard Time (IST) as a timezone-aware datetime."""
    return datetime.now(IST)

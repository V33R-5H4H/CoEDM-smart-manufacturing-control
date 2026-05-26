"""
backend/core/timezone.py
========================
Provides helpers to manage datetimes in Indian Standard Time (IST).
"""

from datetime import datetime, timezone, timedelta

# Global IST timezone object (UTC+5:30)
# Using standard timezone/timedelta avoids Windows zoneinfo tzdata dependency issues.
IST = timezone(timedelta(hours=5, minutes=30))


def ist_now() -> datetime:
    """Return a naive datetime representing the current time in Indian Standard Time (IST).
    
    Using a naive datetime shifted to the IST clock ensures that PostgreSQL TIMESTAMP
    (without timezone) columns store the exact local IST clock time as-is.
    """
    return datetime.now(IST).replace(tzinfo=None)

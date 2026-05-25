#!/usr/bin/env python3
import sys
import os
from pathlib import Path
import psycopg2

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    print("psycopg2 not found. Run: pip install psycopg2-binary")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SQL_FILE = ROOT / "backend" / "Integrated_Schema(timescalled).sql"

def deploy():
    # Credentials from .env
    # DATABASE_URL=postgresql://bvm:Coedm%402026@localhost:5432/smart_industry
    DB_NAME = "smart_industry"
    DB_USER = "bvm"
    DB_PASS = "Coedm@2026"
    DB_HOST = "localhost"
    DB_PORT = "5432"

    print(f"Connecting to {DB_NAME} as {DB_USER}...")
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.autocommit = True
    except psycopg2.Error as e:
        print(f"Failed to connect to database: {e}")
        print("Note: The database 'smart_industry' must exist before running this script.")
        sys.exit(1)

    print("Cleaning database (DROP SCHEMA public CASCADE)...")
    try:
        with conn.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE;")
            cur.execute("CREATE SCHEMA public;")
    except psycopg2.Error as e:
        print(f"Failed to clean database: {e}")
        sys.exit(1)

    print(f"Reading SQL file from {SQL_FILE}...")
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        sql = f.read()

    print("Deploying schema (this may take a moment)...")
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("SUCCESS! Schema applied successfully to 'smart_industry'.")
    except psycopg2.Error as e:
        print(f"SQL Execution Failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    deploy()

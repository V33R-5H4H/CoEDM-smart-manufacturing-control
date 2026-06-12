import os
import sys
from sqlalchemy import text
from dotenv import load_dotenv

# Load environment variables (to get DATABASE_URL if present)
load_dotenv()

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
from backend.database.db import SessionLocal

import subprocess

def run_sql_file(file_path):
    print(f"Executing {os.path.basename(file_path)}...")
    
    db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/asrs_db")
    
    try:
        # Use psql for robust execution of raw SQL files
        result = subprocess.run(
            ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", file_path],
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        
        if result.returncode == 0:
            print(f"  [OK] {os.path.basename(file_path)} applied successfully.")
        else:
            print(f"  [ERROR] Failed to apply {os.path.basename(file_path)}:")
            print(result.stderr)
            raise Exception("Migration failed")
            
    except Exception as e:
        print(f"  [ERROR] Exception while running psql: {e}")
        raise

def main():
    print("Starting Database Migration Tool...")
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    base_schema = os.path.join(base_dir, "Integrated_Schema_v2.sql")
    migrations_dir = os.path.join(base_dir, "migrations")
    
    try:
        # 1. Ensure the base schema is applied (Idempotent)
        if os.path.exists(base_schema):
            run_sql_file(base_schema)
        else:
            print(f"Warning: Base schema not found at {base_schema}")
            
        # 2. Run all incremental migrations in alphabetical order (Idempotent)
        if os.path.exists(migrations_dir):
            migration_files = sorted([
                f for f in os.listdir(migrations_dir) 
                if f.endswith('.sql')
            ])
            
            if not migration_files:
                print("No incremental migrations found.")
                
            for m_file in migration_files:
                run_sql_file(os.path.join(migrations_dir, m_file))
        else:
            print("No migrations folder found.")
            
        print("\nAll database migrations completed successfully!")
        print("Your teammate's local database is now completely up to date.")
        
    except Exception as e:
        print(f"\nMigration aborted due to error.")
        sys.exit(1)

if __name__ == "__main__":
    main()

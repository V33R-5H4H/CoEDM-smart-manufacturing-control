from backend.database.db import SessionLocal
from sqlalchemy import text
import sys

def run():
    session = SessionLocal()
    try:
        # Check if column exists first
        result = session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='assembly_station_data' AND column_name='displacement_mm';
        """)).fetchone()
        
        if result:
            print("Column 'displacement_mm' already exists.")
        else:
            session.execute(text("ALTER TABLE assembly_station_data ADD COLUMN displacement_mm DOUBLE PRECISION;"))
            session.commit()
            print("Successfully added 'displacement_mm' to assembly_station_data.")
    except Exception as e:
        print(f"Error altering table: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()

if __name__ == "__main__":
    run()

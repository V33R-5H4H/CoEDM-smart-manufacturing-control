
from backend.database.db import engine
from sqlalchemy import text

def check_db():
    print("Checking database state...")
    conn = engine.connect()
    try:
        result = conn.execute(text("SELECT * FROM shuttle_state WHERE id = 1")).fetchone()
        if result:
            print(f"Current State in DB: Row={result.row_num}, Col={result.column_letter}, State={result.state}, Command={result.command}")
        else:
            print("No state found for ID 1")
    except Exception as e:
        print(f"Error reading DB: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    check_db()

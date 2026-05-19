
from backend.database.db import engine
from sqlalchemy import text, inspect

def init_db():
    print("Initializing database...")
    
    conn = engine.connect()
    try:
        # Check if table exists
        inspector = inspect(engine)
        if 'shuttle_state' not in inspector.get_table_names():
            print("Creating shuttle_state table...")
            conn.execute(text("""
                CREATE TABLE shuttle_state (
                    id INT PRIMARY KEY,
                    row_num INT NOT NULL,
                    column_letter VARCHAR(1) NOT NULL,
                    state VARCHAR(20) NOT NULL,
                    command VARCHAR(20)
                )
            """))
            print("Table created.")
        else:
            print("shuttle_state table already exists.")

        # Check if initial row exists
        result = conn.execute(text("SELECT count(*) FROM shuttle_state WHERE id = 1")).scalar()
        
        if result == 0:
            print("Inserting initial shuttle state (A7)...")
            conn.execute(text("""
                INSERT INTO shuttle_state (id, row_num, column_letter, state, command)
                VALUES (1, 7, 'A', 'idle', NULL)
            """))
            conn.commit()
            print("Initial state inserted.")
        else:
            print("Initial state already exists.")
            
    except Exception as e:
        print(f"Error initializing DB: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()

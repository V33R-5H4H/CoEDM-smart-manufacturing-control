import os
from sqlalchemy import create_engine, text

engine = create_engine('postgresql://bvm:Coedm%402026@localhost:5432/inventory_management')
sql_file = os.path.join("backend", "database", "inventory_management_postgres.sql")

with open(sql_file, "r", encoding="utf-8") as f:
    sql_script = f.read()

with engine.connect() as conn:
    # Use execution options to allow multiple statements if supported, or split by ';' if not.
    # However, postgresql triggers and functions contain ';' inside them (e.g. BEGIN ... END;)
    # Fortunately, psycopg2 parses standard multiple statements well if passed to conn.execute(text()) ?
    # Let's try raw connection cursor to execute the entire script as one block.
    
    raw_conn = engine.raw_connection()
    try:
        with raw_conn.cursor() as cur:
            cur.execute(sql_script)
        raw_conn.commit()
        print("Successfully executed SQL script!")
    except Exception as e:
        raw_conn.rollback()
        print(f"Error executing SQL: {e}")
    finally:
        raw_conn.close()

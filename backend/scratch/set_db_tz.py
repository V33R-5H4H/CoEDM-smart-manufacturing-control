from backend.database.db import engine
from sqlalchemy import text
import sys

def main():
    try:
        with engine.connect() as conn:
            # Set database default timezone to Asia/Kolkata
            conn.execute(text("ALTER DATABASE \"CoEDM_db\" SET timezone TO 'Asia/Kolkata'"))
            # Also set it for postgres user if possible
            try:
                conn.execute(text("ALTER USER postgres SET timezone TO 'Asia/Kolkata'"))
            except Exception as e:
                print(f"Warning setting user timezone: {e}")
            
            conn.commit()
            print("Successfully altered CoEDM_db database and user timezone to 'Asia/Kolkata'!")
    except Exception as e:
        print(f"Error altering database timezone: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()

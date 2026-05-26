from backend.database.db import engine
from sqlalchemy import text

def main():
    try:
        with engine.connect() as conn:
            # Query connection timezone first
            tz_res = conn.execute(text("SHOW TIMEZONE")).scalar()
            print(f"Current Connection Timezone in Python: {tz_res}")
            
            # Query last 5 rows of assembly_station_data
            result = conn.execute(text("SELECT time, bearing_operation_status FROM assembly_station_data ORDER BY time DESC LIMIT 5"))
            print("\nLast 5 rows in assembly_station_data:")
            for row in result.fetchall():
                print(f"Time: {row[0]} (Type: {type(row[0])}) | Status: {row[1]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()

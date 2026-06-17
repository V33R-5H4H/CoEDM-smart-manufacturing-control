import logging
from backend.database.db import engine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

tables_with_pk = [
    "mirac_sensor_data",
    "triac_sensor_data",
    "amr_sensor_data",
    "cobot_sensor_data",
    "shuttle_movements"
]

hypertables = [
    "mirac_sensor_data",
    "vibit_readings",
    "energy_meter_data",
    "assembly_station_data",
    "triac_sensor_data",
    "amr_sensor_data",
    "cobot_sensor_data",
    "machine_events",
    "shuttle_movements"
]

def migrate():
    with engine.begin() as conn:
        logger.info("Updating Primary Keys...")
        for table in tables_with_pk:
            try:
                # Add time column to primary key. We drop existing constraint, then add composite PK.
                # If constraint doesn't exist by this name, this might fail, so we wrap in DO block
                sql = f"""
                DO $$ 
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{table}_pkey') THEN
                        -- Check if time is already part of PK. If not, drop and recreate
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_index i
                            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                            WHERE i.indrelid = '{table}'::regclass 
                            AND i.indisprimary 
                            AND a.attname = 'time'
                        ) THEN
                            ALTER TABLE {table} DROP CONSTRAINT {table}_pkey;
                            ALTER TABLE {table} ADD PRIMARY KEY (id, time);
                            RAISE NOTICE 'Updated PK for %', '{table}';
                        END IF;
                    END IF;
                END $$;
                """
                conn.execute(text(sql))
            except Exception as e:
                logger.error(f"Error updating PK for {table}: {e}")

        logger.info("Converting tables to TimescaleDB Hypertables...")
        for table in hypertables:
            try:
                sql = f"SELECT create_hypertable('{table}', 'time', if_not_exists => TRUE, migrate_data => TRUE);"
                conn.execute(text(sql))
                logger.info(f"Successfully ensured {table} is a hypertable.")
            except Exception as e:
                logger.error(f"Error converting {table}: {e}")

if __name__ == "__main__":
    migrate()
    logger.info("Migration script completed.")

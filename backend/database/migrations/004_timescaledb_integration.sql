-- ============================================================
-- ENABLE TIMESCALEDB EXTENSION
-- ============================================================
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ============================================================
-- CONVERT TIME-SERIES TABLES TO HYPERTABLES
-- Using migrate_data => TRUE to preserve existing records
-- ============================================================

SELECT create_hypertable('mirac_sensor_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('vibit_readings', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('energy_meter_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('assembly_station_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('triac_sensor_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('amr_sensor_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);
SELECT create_hypertable('cobot_sensor_data', 'time', if_not_exists => TRUE, migrate_data => TRUE);

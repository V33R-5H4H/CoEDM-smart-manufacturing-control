import psycopg2

conn = psycopg2.connect(dbname='coedm_platform', user='bvm', password='Coedm@2026', host='localhost')
conn.autocommit = True
cur = conn.cursor()

tables = ['vibit_readings', 'opcua_readings', 'machine_events']

for table in tables:
    try:
        cur.execute(f"SELECT create_hypertable('{table}', 'time', if_not_exists => TRUE);")
        print(f"Hypertable created for {table}")
    except Exception as e:
        print(f"Error for {table}: {e}")

try:
    # Add retention policies
    cur.execute("SELECT add_retention_policy('vibit_readings', INTERVAL '30 days', if_not_exists => TRUE);")
    cur.execute("SELECT add_retention_policy('opcua_readings', INTERVAL '30 days', if_not_exists => TRUE);")
    cur.execute("SELECT add_retention_policy('machine_events', INTERVAL '90 days', if_not_exists => TRUE);")
    print("Retention policies added.")
except Exception as e:
    print(f"Retention policy error: {e}")

conn.close()

import psycopg2

conn = psycopg2.connect(dbname='coedm_platform', user='bvm', password='Coedm@2026', host='localhost')
cur = conn.cursor()

cur.execute("""
    DO $$ DECLARE
        r RECORD;
    BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
        END LOOP;
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP VIEW IF EXISTS "' || r.viewname || '" CASCADE';
        END LOOP;
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
            EXECUTE 'DROP TYPE IF EXISTS "' || r.typname || '" CASCADE';
        END LOOP;
    END $$;
""")
conn.commit()
conn.close()
print("All tables, views, and types dropped successfully.")

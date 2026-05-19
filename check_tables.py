from sqlalchemy import create_engine, text

engine = create_engine('postgresql://bvm:Coedm%402026@localhost:5432/inventory_management')
with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    ))
    print("=== Tables in inventory_management ===")
    for row in result:
        print(" ", row[0])

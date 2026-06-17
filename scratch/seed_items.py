from sqlalchemy import create_engine, text

engine = create_engine('postgresql://bvm:Coedm%402026@localhost:5432/smart_industry')
with engine.connect() as conn:
    items = [
        ('Shaft - 10mm Steel', 'shaft_10mm', 'finished', 'High carbon steel shaft, 10mm dia.', 150.00),
        ('Shaft - 12mm Aluminum', 'shaft_12mm', 'finished', 'Lightweight aluminum shaft, 12mm dia.', 180.00),
        ('Shaft - 15mm Titanium', 'shaft_15mm', 'finished', 'Aerospace grade titanium shaft, 15mm.', 450.00),
        ('Bearing - 608ZZ', 'bearing_608', 'finished', 'Standard sealed ball bearing 608ZZ', 45.00),
        ('Bearing - 6204', 'bearing_6204', 'finished', 'High-load radial ball bearing', 120.00),
        ('Bearing - Thrust Roller', 'bearing_thrust', 'finished', 'Heavy duty thrust roller bearing', 350.00),
        ('Casing - Motor Housing', 'casing_motor', 'finished', 'Machined aluminum motor housing', 850.00),
        ('Casing - Gearbox', 'casing_gearbox', 'finished', 'Cast iron gearbox casing', 1200.00),
        ('Casing - Sensor Enclosure', 'casing_sensor', 'finished', 'Waterproof sensor casing IP67', 250.00),
    ]
    for name, sku, item_type, desc, price in items:
        res = conn.execute(text('''
            INSERT INTO storage_items (name, sku, item_type, description, price)
            VALUES (:n, :s, :it, :d, :p)
            ON CONFLICT (sku) DO UPDATE 
            SET name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price
            RETURNING item_id
        '''), {'n':name, 's':sku, 'it':item_type, 'd':desc, 'p':price}).fetchone()
        
        item_id = res[0]
        comps = conn.execute(text('''
            SELECT compartment_id FROM storage_compartments 
            WHERE status = 'empty' LIMIT 2
        ''')).fetchall()
        for comp in comps:
            conn.execute(text('''
                UPDATE storage_compartments
                SET status = 'occupied', item_id = :iid, quantity = 1, updated_at = NOW()
                WHERE compartment_id = :cid
            '''), {'iid': item_id, 'cid': comp[0]})
    conn.commit()
print('Seeding complete.')

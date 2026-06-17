import os
import sys

# Add project root to path so we can import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from backend.database.inventory_db import InventorySessionLocal
from sqlalchemy import text
import random

def seed_asrs():
    session = InventorySessionLocal()
    try:
        print("Cleaning up old stock...")
        # Empty all compartments
        session.execute(text("UPDATE storage_compartments SET status = 'empty', item_id = NULL"))
        
        # Make sure we have the items
        items = session.execute(text("SELECT item_id, name FROM storage_items")).fetchall()
        item_map = {row[1].lower(): row[0] for row in items}
        
        shaft_id = next((iid for name, iid in item_map.items() if 'shaft' in name), None)
        bearing_id = next((iid for name, iid in item_map.items() if 'bearing' in name), None)
        casing_id = next((iid for name, iid in item_map.items() if 'casing' in name), None)
        
        # If not exist, we should probably just use whatever IDs we can or insert them.
        # But earlier the user said "add three of each shaft bearing casing in the items"
        # So they should exist.
        
        print(f"Found IDs - Shaft: {shaft_id}, Bearing: {bearing_id}, Casing: {casing_id}")
        
        if not all([shaft_id, bearing_id, casing_id]):
            print("Missing some items. Aborting.")
            return

        # Fetch all empty compartments
        empty_comps = session.execute(
            text("SELECT compartment_id FROM storage_compartments WHERE status = 'empty'")
        ).fetchall()
        empty_comp_ids = [c[0] for c in empty_comps]
        
        if len(empty_comp_ids) < 60:
            print(f"Not enough empty compartments ({len(empty_comp_ids)} found). Need at least 60.")
            return
            
        print(f"Found {len(empty_comp_ids)} empty compartments. Seeding...")
        
        # We will pick compartments randomly across the entire grid
        random.shuffle(empty_comp_ids)
        
        # Let's seed 15 of each
        seed_plan = [
            (shaft_id, 15),
            (bearing_id, 15),
            (casing_id, 15)
        ]
        
        curr_idx = 0
        for item_id, count in seed_plan:
            for _ in range(count):
                if curr_idx < len(empty_comp_ids):
                    cid = empty_comp_ids[curr_idx]
                    session.execute(
                        text("UPDATE storage_compartments SET status = 'occupied', item_id = :iid WHERE compartment_id = :cid"),
                        {"iid": item_id, "cid": cid}
                    )
                    curr_idx += 1
                    
        session.commit()
        print(f"Successfully seeded {curr_idx} compartments.")
        
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    seed_asrs()

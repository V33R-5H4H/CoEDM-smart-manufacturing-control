import asyncio
from pymodbus.client import ModbusTcpClient

def scan_slaves():
    client = ModbusTcpClient('10.10.14.103', port=502, timeout=0.2)
    client.connect()
    print("Scanning Unit IDs 1 to 30 at address 0 (FC3) to find active sensors...")
    
    found = []
    for uid in range(1, 31):
        # We try to read 1 register just to see if it responds with anything other than timeout/0x0B
        res = client.read_holding_registers(4001, 2, slave=uid)
        if not res.isError():
            print(f"Unit ID {uid}: OK!")
            found.append(uid)
        else:
            err_str = str(res)
            # If it's 0x0B (Gateway failed to respond) or similar, it's offline.
            # But if it returns Illegal Data Address (0x02) or similar, it means the unit is ALIVE!
            if "0x0b" not in err_str.lower() and "no response" not in err_str.lower():
                print(f"Unit ID {uid}: ALIVE but error: {err_str}")
                found.append(uid)
    
    print(f"Scan complete. Found: {found}")

scan_slaves()

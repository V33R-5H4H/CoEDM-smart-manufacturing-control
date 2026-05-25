import asyncio
from pymodbus.client import ModbusTcpClient

def scan():
    client = ModbusTcpClient('10.10.14.103', port=502, timeout=2)
    client.connect()
    
    print("Testing read 2 registers at 4001:")
    res = client.read_holding_registers(4001, 2, slave=1)
    if res.isError():
        print(f"ERROR: {res}")
    else:
        print(f"OK: {res.registers}")

    print("Testing read 26 registers at 4001:")
    res = client.read_holding_registers(4001, 26, slave=1)
    if res.isError():
        print(f"ERROR: {res}")
    else:
        print(f"OK: {res.registers}")

scan()

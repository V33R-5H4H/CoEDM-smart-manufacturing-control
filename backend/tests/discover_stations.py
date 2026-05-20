import os
import sys
import socket
import json
import urllib.request
import urllib.error
import time

# Add workspace directory to python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

try:
    from backend.config import settings
except ImportError:
    class DummySettings:
        MIRAC_OPCUA_URL = "opc.tcp://10.10.14.102:4840"
        ASRS_OPCUA_URL = "opc.tcp://10.10.14.104:4840"
        HYDRAULIC_OPCUA_URL = "opc.tcp://10.10.14.113:4840"
        VIBIT_HOST = "10.10.14.103"
        VIBIT_PORT = 502
    settings = DummySettings()

def test_tcp_port(host, port, timeout=2.0):
    """Attempt to establish a raw TCP connection to check if host/port is open."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, "Port Open"
    except socket.timeout:
        return False, "Connection Timeout (Offline/Unreachable)"
    except ConnectionRefusedError:
        return False, "Connection Refused (Service Not Running)"
    except Exception as e:
        return False, f"Error: {e}"

def parse_opcua_url(url):
    """Extract host and port from opc.tcp://host:port URL."""
    try:
        # Strip protocol
        address = url.split("://")[1]
        # Split host and port
        if "/" in address:
            address = address.split("/")[0]
        if ":" in address:
            host, port = address.split(":")
            return host, int(port)
        else:
            return address, 4840
    except Exception:
        return None

def test_node_red_vibit():
    """Check Node-RED VIBIT endpoint status and return data if available."""
    url = "http://127.0.0.1:1880/vibit"
    print(f"\n[Node-RED] Checking local endpoint: {url}")
    
    # 1. First test raw TCP port 1880
    open_ok, msg = test_tcp_port("127.0.0.1", 1880, timeout=1.0)
    if not open_ok:
        print(f"  [-] Port 1880: {msg}")
        return False
    print("  [+] Port 1880 is open.")
    
    # 2. Make HTTP request to /vibit
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=2.0) as r:
            payload = json.loads(r.read().decode('utf-8'))
            print("  [+] GET /vibit returned 200 OK")
            print("  [DATA] Telemetry Payload Data:")
            print(json.dumps(payload, indent=4))
            return True
    except urllib.error.HTTPError as e:
        print(f"  [-] GET /vibit returned error status: {e.code}")
        try:
            print("  Error Body:", e.read().decode('utf-8'))
        except Exception:
            pass
    except urllib.error.URLError as e:
        print(f"  [-] GET /vibit URL error: {e.reason}")
    except Exception as e:
        print(f"  [-] Failed to parse response: {e}")
    return False

def test_opcua_server(name, url):
    """Test connection to an OPC UA server and print basic info."""
    print(f"\n[{name} OPC UA] Checking URL: {url}")
    parsed = parse_opcua_url(url)
    if not parsed:
        print("  [-] Could not parse OPC UA URL")
        return False
    
    host, port = parsed
    open_ok, msg = test_tcp_port(host, port, timeout=2.0)
    if not open_ok:
        print(f"  [-] Port {port} on {host}: {msg}")
        return False
    print(f"  [+] Port {port} on {host} is open.")
    
    # Try to initialize client connection
    try:
        from asyncua.sync import Client
        print(f"  [TRY] Attempting OPC UA client handshake with {url}...")
        client = Client(url, timeout=3.0)
        client.connect()
        try:
            # Read namespace array or root node to confirm functionality
            root = client.get_root_node()
            root.get_children()
            print("  [+] Handshake succeeded. OPC UA session fully established.")
            return True
        finally:
            client.disconnect()
    except ImportError:
        print("  [WARN] asyncua package not installed. Skipping client protocol handshake check.")
    except Exception as e:
        print(f"  [-] Handshake failed: {e}")
    return False

def test_modbus_server(name, host, port):
    """Test connection to a Modbus TCP server."""
    print(f"\n[{name} Modbus] Checking: {host}:{port}")
    open_ok, msg = test_tcp_port(host, port, timeout=2.0)
    if not open_ok:
        print(f"  [-] Port {port} on {host}: {msg}")
        return False
    print(f"  [+] Port {port} on {host} is open.")
    
    try:
        from backend.communication.vibit_modbus import VibitModbusReader
        print(f"  [TRY] Attempting Modbus read from {host}:{port}...")
        reader = VibitModbusReader(host=host, port=port, device_id=1)
        snapshot = reader.read_snapshot()
        if snapshot:
            print("  [+] Modbus read succeeded. Decoded snapshot data:")
            print(json.dumps(snapshot, indent=4))
            return True
        else:
            print("  [-] Modbus connection succeeded, but register read returned empty snapshot.")
    except ImportError:
        print("  [WARN] VibitModbusReader not importable. Skipping Modbus register read check.")
    except Exception as e:
        print(f"  [-] Modbus handshake failed: {e}")
    return False

def main():
    print("=" * 60)
    print("           CoEDM INDUSTRIAL STATIONS DISCOVERY TOOL          ")
    print("=" * 60)
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 1. Discover local Node-RED
    test_node_red_vibit()
    
    # 2. Discover MIRAC CNC OPC UA
    test_opcua_server("MIRAC CNC", settings.MIRAC_OPCUA_URL)
    
    # 3. Discover VIBIT Modbus TCP (Direct Sensor)
    test_modbus_server("VIBIT Sensor", settings.VIBIT_HOST, settings.VIBIT_PORT)
    
    # 4. Discover ASRS Storage OPC UA
    test_opcua_server("ASRS Storage", settings.ASRS_OPCUA_URL)
    
    # 5. Discover Hydraulic OPC UA
    test_opcua_server("Hydraulic Assembly", settings.HYDRAULIC_OPCUA_URL)
    
    print("\n" + "=" * 60)
    print("                       DISCOVERY COMPLETE                    ")
    print("=" * 60)

if __name__ == "__main__":
    main()

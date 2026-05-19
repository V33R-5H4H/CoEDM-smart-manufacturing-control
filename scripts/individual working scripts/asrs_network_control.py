import time
import socket
import threading
import json
from opcua import Client, ua

SERVER_URL = "opc.tcp://10.10.14.104:4840"
NETWORK_PORT = 8888  # Port for receiving commands from inventory system

# Map uppercase commands to node names
STORE_TAGS = {f"{l}{n}S": f"{l}{n}S" for l in "ABCDE" for n in range(1, 8)}
RETRIEVE_TAGS = {f"{l}{n}": f"{l}{n}" for l in "ABCDE" for n in range(1, 8)}

class ASRSController:
    def __init__(self):
        self.plc_client = None
        self.is_connected = False
        self.command_queue = []
        
    def connect_plc(self):
        """Connect to the PLC via OPC-UA"""
        try:
            self.plc_client = Client(SERVER_URL)
            self.plc_client.connect()
            self.is_connected = True
            print(f"✓ Connected to PLC at {SERVER_URL}")
            return True
        except Exception as e:
            print(f"✗ Failed to connect to PLC: {e}")
            self.is_connected = False
            return False
    
    def disconnect_plc(self):
        """Disconnect from the PLC"""
        if self.plc_client and self.is_connected:
            try:
                self.plc_client.disconnect()
                self.is_connected = False
                print("✓ Disconnected from PLC")
            except Exception as e:
                print(f"Error disconnecting: {e}")
    
    def pulse_node(self, tag_name, duration=0.1):
        """Send a pulse signal to the PLC node"""
        if not self.is_connected or not self.plc_client:
            raise Exception("PLC not connected")
            
        node = self.plc_client.get_node(f"ns=4;s={tag_name}")
        variant_true = ua.DataValue(ua.Variant(True, ua.VariantType.Boolean))
        variant_false = ua.DataValue(ua.Variant(False, ua.VariantType.Boolean))
        
        node.set_attribute(ua.AttributeIds.Value, variant_true)
        time.sleep(duration)
        node.set_attribute(ua.AttributeIds.Value, variant_false)
    
    def process_command(self, command):
        """Process a single AS/RS command"""
        cmd = command.upper().strip()
        
        try:
            # Process store commands (with S suffix)
            if cmd in STORE_TAGS:
                tag = STORE_TAGS[cmd]
                action = "Store"
                location = tag[:-1]  # Remove 'S' suffix
                
            # Process retrieve commands (without S suffix)
            elif cmd in RETRIEVE_TAGS:
                tag = RETRIEVE_TAGS[cmd]
                action = "Retrieve"
                location = tag
                
            else:
                raise ValueError(f"Invalid command '{cmd}'. Use A1–E7 or A1S–E7S.")
            
            # Execute the command
            if self.is_connected:
                self.pulse_node(tag)
                print(f"✓ {action} operation executed at location {location} (command: {cmd})")
                return {
                    "success": True,
                    "action": action,
                    "location": location,
                    "command": cmd,
                    "message": f"{action} operation completed at location {location}"
                }
            else:
                raise Exception("PLC not connected")
                
        except Exception as e:
            error_msg = f"✗ Operation failed for command '{cmd}': {e}"
            print(error_msg)
            return {
                "success": False,
                "command": cmd,
                "error": str(e),
                "message": error_msg
            }
    
    def handle_network_command(self, client_socket, address):
        """Handle incoming network commands"""
        try:
            # Receive data from client
            data = client_socket.recv(1024).decode('utf-8')
            if not data:
                return
                
            print(f"📨 Received command from {address}: {data}")
            
            try:
                # Try to parse as JSON first
                request = json.loads(data)
                command = request.get('command', data.strip())
            except json.JSONDecodeError:
                # If not JSON, treat as plain text command
                command = data.strip()
            
            # Process the command
            result = self.process_command(command)
            
            # Send response back to client
            response = json.dumps(result)
            client_socket.send(response.encode('utf-8'))
            
        except Exception as e:
            error_response = {
                "success": False,
                "error": str(e),
                "message": f"Error processing network command: {e}"
            }
            try:
                client_socket.send(json.dumps(error_response).encode('utf-8'))
            except:
                pass
            print(f"✗ Error handling network command from {address}: {e}")
        finally:
            client_socket.close()
    
    def start_network_server(self):
        """Start the network server to listen for commands"""
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            server_socket.bind(('localhost', NETWORK_PORT))
            server_socket.listen(5)
            print(f"🌐 AS/RS Network Server listening on port {NETWORK_PORT}")
            print("Waiting for commands from inventory system...")
            print("-" * 50)
            
            while True:
                try:
                    client_socket, address = server_socket.accept()
                    # Handle each client in a separate thread
                    client_thread = threading.Thread(
                        target=self.handle_network_command,
                        args=(client_socket, address)
                    )
                    client_thread.daemon = True
                    client_thread.start()
                    
                except socket.error as e:
                    print(f"Socket error: {e}")
                    break
                    
        except Exception as e:
            print(f"✗ Network server error: {e}")
        finally:
            server_socket.close()
    
    def start_interactive_mode(self):
        """Start interactive command mode for manual testing"""
        print("\n" + "="*50)
        print("INTERACTIVE MODE")
        print("Commands: A1-E7 (Retrieve) or A1S-E7S (Store)")
        print("Type 'exit' or 'quit' to stop")
        print("="*50)
        
        while True:
            try:
                cmd = input("\nEnter command: ").strip()
                
                # Exit conditions
                if cmd.lower() in ['exit', 'quit', 'q']:
                    print("Exiting interactive mode...")
                    break
                
                if not cmd:
                    continue
                    
                # Process command
                result = self.process_command(cmd)
                
            except KeyboardInterrupt:
                print("\n\nStopping interactive mode...")
                break
            except EOFError:
                print("\n\nInput ended, stopping...")
                break

def main():
    controller = ASRSController()
    
    # Connect to PLC
    if not controller.connect_plc():
        print("Failed to connect to PLC. Exiting...")
        return
    
    try:
        # Start network server in a separate thread
        server_thread = threading.Thread(target=controller.start_network_server)
        server_thread.daemon = True
        server_thread.start()
        
        # Start interactive mode in main thread
        controller.start_interactive_mode()
        
    except KeyboardInterrupt:
        print("\n\nShutting down AS/RS Controller...")
    finally:
        controller.disconnect_plc()

if __name__ == "__main__":
    main()

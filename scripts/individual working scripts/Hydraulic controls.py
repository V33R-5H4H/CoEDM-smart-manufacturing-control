import time
from opcua import Client, ua

SERVER_URL = "opc.tcp://10.10.14.113:4840"

HYDRAULIC_TAGS = {
    "BEARING_ON": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
    "SHAFT_ON":   "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",
}

def set_node_state(client, tag_name):
    node = client.get_node(f"ns=4;s={tag_name}")
    value = ua.DataValue(ua.Variant(True, ua.VariantType.Boolean))
    node.set_attribute(ua.AttributeIds.Value, value)

def main():
    client = Client(SERVER_URL)
    try:
        client.connect()
        cmd = input("Write your command (BEARING_ON / SHAFT_ON): ").strip().upper()

        if cmd in HYDRAULIC_TAGS:
            tag = HYDRAULIC_TAGS[cmd]
            set_node_state(client, tag)
            print(f"{cmd} triggered -> TRUE")
        else:
            print("Invalid command. Use only: BEARING_ON or SHAFT_ON")

    finally:
        client.disconnect()
        print("Exiting...")

if __name__ == "__main__":
    main()

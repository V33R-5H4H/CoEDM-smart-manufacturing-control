import socket 
HOST = "10.10.14.122"
PORT = 5000
client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect((HOST, PORT))
while True:
    msg = input("send")
    client.send(msg.encode())

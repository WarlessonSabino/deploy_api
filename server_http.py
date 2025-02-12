import os

PORT = 3030
print(f"Servidor rodando na porta {PORT}...")

os.system(f"python3 -m http.server {PORT}")

"""
Nastavení aplikace
"""
import os

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Grid settings
GRID_COLS = int(os.getenv("GRID_COLS", "18"))
GRID_ROWS = int(os.getenv("GRID_ROWS", "12"))

# Game settings
MAX_PLAYERS = int(os.getenv("MAX_PLAYERS", "2"))
AP_PER_TURN = int(os.getenv("AP_PER_TURN", "3"))


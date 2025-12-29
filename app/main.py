"""
FastAPI aplikace pro Robot Arena - síťová tahová hra 1v1
"""
import json
import os
import random
import uuid
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn

app = FastAPI(title="Robot Arena")

# Mount static files
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="/app/templates")

# Load seed data
def load_seed_data():
    seed_path = "/app/data/seed.json"
    with open(seed_path, "r", encoding="utf-8") as f:
        return json.load(f)

SEED_DATA = load_seed_data()

# Game state
class GameState:
    def __init__(self):
        self.status = "waiting"  # waiting, playing, finished
        self.players: List[Dict] = []
        self.turn_player_id: Optional[str] = None
        self.ap_remaining = 0
        self.turn_number = 0
        self.traps_runtime: Dict[str, Dict] = {}
        self.rng_seed = random.randint(1, 1000000)
        self.winner_id: Optional[str] = None
    
    def to_dict(self):
        return {
            "status": self.status,
            "players": self.players,
            "turn_player_id": self.turn_player_id,
            "ap_remaining": self.ap_remaining,
            "turn_number": self.turn_number,
            "traps_runtime": self.traps_runtime,
            "rng_seed": self.rng_seed,
            "winner_id": self.winner_id
        }

game_state = GameState()
active_connections: Dict[str, WebSocket] = {}
player_tokens: Dict[str, str] = {}  # player_id -> token
token_players: Dict[str, str] = {}  # token -> player_id

# Grid settings
GRID_COLS = 18
GRID_ROWS = 12

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    player_id = None
    token = None
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "join":
                name = data.get("name", "").strip()
                if not name or len(name) > 20:
                    await websocket.send_json({"type": "error", "message": "Neplatné jméno"})
                    continue
                
                # Check if lobby is full
                if len(game_state.players) >= 2:
                    await websocket.send_json({"type": "error", "message": "Lobby je plné (max 2 hráči)"})
                    continue
                
                # Check if name is already taken
                if any(p["name"] == name for p in game_state.players):
                    await websocket.send_json({"type": "error", "message": "Jméno je již obsazené"})
                    continue
                
                # Create player
                player_id = str(uuid.uuid4())
                token = str(uuid.uuid4())
                
                player = {
                    "player_id": player_id,
                    "name": name,
                    "connected": True,
                    "robot_id": None,
                    "weapon_id": None,
                    "hp": 0,
                    "pos": {"x": 0, "y": 0},
                    "ready": False
                }
                
                game_state.players.append(player)
                active_connections[player_id] = websocket
                player_tokens[player_id] = token
                token_players[token] = player_id
                
                await websocket.send_json({
                    "type": "join_ok",
                    "player_id": player_id,
                    "token": token
                })
                
                # Send seed data
                await websocket.send_json({
                    "type": "seed",
                    "robots": SEED_DATA["robots"],
                    "weapons": SEED_DATA["weapons"]
                })
                
                # Send lobby state
                await broadcast_lobby_state()
            
            elif msg_type == "reconnect":
                token = data.get("token")
                if not token or token not in token_players:
                    await websocket.send_json({"type": "error", "message": "Neplatný token"})
                    continue
                
                player_id = token_players[token]
                player = next((p for p in game_state.players if p["player_id"] == player_id), None)
                
                if not player:
                    await websocket.send_json({"type": "error", "message": "Hráč nenalezen"})
                    continue
                
                player["connected"] = True
                active_connections[player_id] = websocket
                
                await websocket.send_json({
                    "type": "reconnect_ok",
                    "player_id": player_id
                })
                
                # Send seed data
                await websocket.send_json({
                    "type": "seed",
                    "robots": SEED_DATA["robots"],
                    "weapons": SEED_DATA["weapons"]
                })
                
                # Send current state
                if game_state.status == "playing":
                    await websocket.send_json({
                        "type": "game_state",
                        **game_state.to_dict()
                    })
                else:
                    await broadcast_lobby_state()
            
            elif msg_type == "select_loadout":
                if not player_id:
                    await websocket.send_json({"type": "error", "message": "Nejste připojeni"})
                    continue
                
                robot_id = data.get("robot_id")
                weapon_id = data.get("weapon_id")
                
                player = next((p for p in game_state.players if p["player_id"] == player_id), None)
                if not player:
                    continue
                
                # Validate robot and weapon
                robot = next((r for r in SEED_DATA["robots"] if r["id"] == robot_id), None)
                weapon = next((w for w in SEED_DATA["weapons"] if w["id"] == weapon_id), None)
                
                if not robot or not weapon:
                    await websocket.send_json({"type": "error", "message": "Neplatný robot nebo zbraň"})
                    continue
                
                player["robot_id"] = robot_id
                player["weapon_id"] = weapon_id
                player["hp"] = robot["hpMax"]
                
                await broadcast_lobby_state()
            
            elif msg_type == "set_ready":
                if not player_id:
                    await websocket.send_json({"type": "error", "message": "Nejste připojeni"})
                    continue
                
                player = next((p for p in game_state.players if p["player_id"] == player_id), None)
                if not player:
                    continue
                
                if not player["robot_id"] or not player["weapon_id"]:
                    await websocket.send_json({"type": "error", "message": "Nejprve vyberte robota a zbraň"})
                    continue
                
                player["ready"] = data.get("ready", False)
                await broadcast_lobby_state()
                
                # Check if both players are ready
                if len(game_state.players) == 2 and all(p["ready"] for p in game_state.players):
                    start_game()
                    await broadcast_game_state()
            
            elif msg_type == "action_move":
                if not player_id:
                    continue
                
                if game_state.status != "playing":
                    await websocket.send_json({"type": "error", "message": "Hra neprobíhá"})
                    continue
                
                if game_state.turn_player_id != player_id:
                    await websocket.send_json({"type": "error", "message": "Není váš tah"})
                    continue
                
                if game_state.ap_remaining <= 0:
                    await websocket.send_json({"type": "error", "message": "Nemáte žádné akce"})
                    continue
                
                to_x = data.get("to_x")
                to_y = data.get("to_y")
                client_action_id = data.get("client_action_id")
                
                player = next((p for p in game_state.players if p["player_id"] == player_id), None)
                if not player:
                    continue
                
                # Validate move
                if not is_valid_move(player["pos"], {"x": to_x, "y": to_y}):
                    await websocket.send_json({
                        "type": "action_rejected",
                        "client_action_id": client_action_id,
                        "reason": "Neplatný pohyb",
                        "authoritative_pos": player["pos"]
                    })
                    continue
                
                # Execute move
                player["pos"] = {"x": to_x, "y": to_y}
                
                # Check if player moved to spawn zone and heal if no enemy nearby
                heal_on_spawn(player, game_state.players)
                
                game_state.ap_remaining -= 1
                
                await broadcast_game_state()
            
            elif msg_type == "action_attack":
                if not player_id:
                    continue
                
                if game_state.status != "playing":
                    await websocket.send_json({"type": "error", "message": "Hra neprobíhá"})
                    continue
                
                if game_state.turn_player_id != player_id:
                    await websocket.send_json({"type": "error", "message": "Není váš tah"})
                    continue
                
                if game_state.ap_remaining <= 0:
                    await websocket.send_json({"type": "error", "message": "Nemáte žádné akce"})
                    continue
                
                target_player_id = data.get("target_player_id")
                client_action_id = data.get("client_action_id")
                
                attacker = next((p for p in game_state.players if p["player_id"] == player_id), None)
                target = next((p for p in game_state.players if p["player_id"] == target_player_id), None)
                
                if not attacker or not target:
                    await websocket.send_json({"type": "error", "message": "Neplatný cíl"})
                    continue
                
                # Validate attack
                if not is_valid_attack(attacker, target):
                    await websocket.send_json({
                        "type": "action_rejected",
                        "client_action_id": client_action_id,
                        "reason": "Útok mimo dosah nebo neplatný směr",
                        "authoritative_pos": attacker["pos"]
                    })
                    continue
                
                # Execute attack
                weapon = next((w for w in SEED_DATA["weapons"] if w["id"] == attacker["weapon_id"]), None)
                if weapon:
                    target["hp"] = max(0, target["hp"] - weapon["damage"])
                
                game_state.ap_remaining -= 1
                
                # Check for game over
                if target["hp"] <= 0:
                    game_state.status = "finished"
                    game_state.winner_id = attacker["player_id"]
                    await broadcast_game_over()
                
                await broadcast_game_state()
            
            elif msg_type == "end_turn":
                if not player_id:
                    continue
                
                if game_state.status != "playing":
                    continue
                
                if game_state.turn_player_id != player_id:
                    continue
                
                # Process traps
                process_traps()
                
                # Check for game over after traps
                if game_state.status == "finished":
                    await broadcast_game_over()
                    await broadcast_game_state()
                    continue
                
                # Next turn
                next_turn()
                await broadcast_game_state()
    
    except WebSocketDisconnect:
        if player_id:
            player = next((p for p in game_state.players if p["player_id"] == player_id), None)
            if player:
                # If game is not playing, remove player completely
                if game_state.status != "playing":
                    game_state.players = [p for p in game_state.players if p["player_id"] != player_id]
                    # Clean up tokens
                    if player_id in player_tokens:
                        token = player_tokens[player_id]
                        del player_tokens[player_id]
                        if token in token_players:
                            del token_players[token]
                else:
                    # During game, just mark as disconnected (for potential reconnect)
                    player["connected"] = False
            if player_id in active_connections:
                del active_connections[player_id]
            await broadcast_lobby_state()

def is_valid_move(from_pos: Dict, to_pos: Dict) -> bool:
    """Validuje pohyb - 8-směr, sousední buňka, neblokovaná"""
    dx = abs(to_pos["x"] - from_pos["x"])
    dy = abs(to_pos["y"] - from_pos["y"])
    
    # Must be adjacent (8-directional)
    if dx > 1 or dy > 1 or (dx == 0 and dy == 0):
        return False
    
    # Check bounds
    if to_pos["x"] < 0 or to_pos["x"] >= GRID_COLS or to_pos["y"] < 0 or to_pos["y"] >= GRID_ROWS:
        return False
    
    # Check if cell is occupied
    for player in game_state.players:
        if player["pos"]["x"] == to_pos["x"] and player["pos"]["y"] == to_pos["y"]:
            return False
    
    return True

def is_in_spawn_zone(pos: Dict, player_index: int) -> bool:
    """Zkontroluje, zda je pozice ve startovací zóně hráče"""
    # spawnA: x=1-2, y=9-10 (bottom left, player 0)
    # spawnB: x=15-16, y=1-2 (top right, player 1)
    if player_index == 0:
        return (pos["x"] >= 1 and pos["x"] <= 2 and pos["y"] >= 9 and pos["y"] <= 10)
    elif player_index == 1:
        return (pos["x"] >= 15 and pos["x"] <= 16 and pos["y"] >= 1 and pos["y"] <= 2)
    return False

def has_enemy_nearby(player: Dict, all_players: list) -> bool:
    """Zkontroluje, zda je v okolí protihráč v dosahu své zbraně (nebo blíž)"""
    for other_player in all_players:
        if other_player["player_id"] == player["player_id"]:
            continue
        
        # Get enemy's weapon range
        weapon = next((w for w in SEED_DATA["weapons"] if w["id"] == other_player.get("weapon_id")), None)
        if not weapon:
            # If no weapon, use default range of 1
            weapon_range = 1
        else:
            weapon_range = weapon.get("range", 1)
        
        dx = abs(other_player["pos"]["x"] - player["pos"]["x"])
        dy = abs(other_player["pos"]["y"] - player["pos"]["y"])
        
        # Manhattan distance - check if enemy is within or at weapon range
        distance = dx + dy
        if distance <= weapon_range:
            return True
    
    return False

def heal_on_spawn(player: Dict, all_players: list):
    """Uzdraví hráče o 25% max HP, pokud je na startovací pozici a není tam protihráč"""
    # Find player index
    player_index = None
    for i, p in enumerate(all_players):
        if p["player_id"] == player["player_id"]:
            player_index = i
            break
    
    if player_index is None:
        return
    
    # Check if in spawn zone
    if not is_in_spawn_zone(player["pos"], player_index):
        return
    
    # Check if enemy nearby (within their weapon range)
    if has_enemy_nearby(player, all_players):
        return
    
    # Heal 25% of max HP
    robot = next((r for r in SEED_DATA["robots"] if r["id"] == player["robot_id"]), None)
    if robot:
        max_hp = robot["hpMax"]
        heal_amount = max_hp * 0.25
        player["hp"] = min(max_hp, player["hp"] + heal_amount)

def is_valid_attack(attacker: Dict, target: Dict) -> bool:
    """Validuje útok - pouze 4-směr (N/E/S/W), kontrola range"""
    # Get weapon
    weapon = next((w for w in SEED_DATA["weapons"] if w["id"] == attacker["weapon_id"]), None)
    if not weapon:
        return False
    
    range_val = weapon.get("range", 1)
    
    # Check if target is in same row or column (4-directional)
    dx = target["pos"]["x"] - attacker["pos"]["x"]
    dy = target["pos"]["y"] - attacker["pos"]["y"]
    
    # Must be cardinal direction (not diagonal)
    if dx != 0 and dy != 0:
        return False
    
    # Check range
    distance = abs(dx) + abs(dy)
    if distance == 0 or distance > range_val:
        return False
    
    return True

def start_game():
    """Spustí hru - inicializuje pozice, pasti, první tah"""
    game_state.status = "playing"
    game_state.turn_number = 1
    
    # Initialize player positions based on spawn zones in SVG
    # spawnA: x=60, y=540 (grid: x=1, y=9) - bottom left
    # spawnB: x=900, y=60 (grid: x=15, y=1) - top right
    if len(game_state.players) >= 1:
        game_state.players[0]["pos"] = {"x": 1, "y": 9}  # spawnA area
    if len(game_state.players) >= 2:
        game_state.players[1]["pos"] = {"x": 15, "y": 1}  # spawnB area
    
    # Initialize traps from SVG definitions
    # SVG: 1080x720, grid: 18x12, cell: 60x60
    # Trap zones converted from pixel coordinates to grid coordinates
    trap_definitions = [
        # Fire trap: rect x=600, y=60, width=300, height=60 -> grid: x=10-14, y=1
        {"id": "trap_fire_1", "type": "fire", "damage": 12, "weight": 1.0, "min_active": 1, "max_active": 3, 
         "zone": [(10, 1), (11, 1), (12, 1), (13, 1), (14, 1)]},
        # Saw trap 1: rect x=60, y=240, width=60, height=300 -> grid: x=1, y=4-8
        {"id": "trap_saw_1", "type": "saw", "damage": 15, "weight": 0.8, "min_active": 2, "max_active": 4,
         "zone": [(1, 4), (1, 5), (1, 6), (1, 7), (1, 8)]},
        # Saw trap 2: rect x=300, y=600, width=360, height=60 -> grid: x=5-10, y=10
        {"id": "trap_saw_2", "type": "saw", "damage": 15, "weight": 0.8, "min_active": 2, "max_active": 4,
         "zone": [(5, 10), (6, 10), (7, 10), (8, 10), (9, 10), (10, 10)]},
        # Hammer trap: circle cx=810, cy=360, r=81 -> grid: x=13-14, y=5-6 (approx)
        {"id": "trap_hammer_1", "type": "hammer", "damage": 20, "weight": 0.6, "min_active": 1, "max_active": 2,
         "zone": [(13, 5), (13, 6), (14, 5), (14, 6)]},
        # Crush trap 1: rect x=360, y=180, width=180, height=120 -> grid: x=6-8, y=3-4
        {"id": "trap_crusher_1", "type": "crusher", "damage": 25, "weight": 0.5, "min_active": 1, "max_active": 2,
         "zone": [(6, 3), (6, 4), (7, 3), (7, 4), (8, 3), (8, 4)]},
        # Crush trap 2: polygon points="660,420 780,480 720,600 600,540" -> grid: x=10-12, y=7-9 (approx)
        {"id": "trap_crusher_2", "type": "crusher", "damage": 25, "weight": 0.5, "min_active": 1, "max_active": 2,
         "zone": [(10, 7), (10, 8), (10, 9), (11, 7), (11, 8), (11, 9), (12, 7), (12, 8), (12, 9)]},
    ]
    
    # Initialize traps runtime state
    game_state.traps_runtime = {}
    for trap_def in trap_definitions:
        game_state.traps_runtime[trap_def["id"]] = {
            "state": "idle",
            "armingTurnsRemaining": 0,
            "remainingActiveTurns": 0,
            "damage": trap_def["damage"],
            "zone": trap_def["zone"],
            "weight": trap_def["weight"],
            "min_active": trap_def["min_active"],
            "max_active": trap_def["max_active"]
        }
    
    # First player's turn
    game_state.turn_player_id = game_state.players[0]["player_id"]
    game_state.ap_remaining = 3

def next_turn():
    """Přepne na další tah"""
    game_state.turn_number += 1
    
    # Switch to next player
    current_idx = next((i for i, p in enumerate(game_state.players) if p["player_id"] == game_state.turn_player_id), 0)
    next_idx = (current_idx + 1) % len(game_state.players)
    game_state.turn_player_id = game_state.players[next_idx]["player_id"]
    game_state.ap_remaining = 3

def process_traps():
    """Zpracuje pasti - arming, active, damage"""
    rng = random.Random(game_state.rng_seed + game_state.turn_number)
    
    # Phase 1: Process current states
    for trap_id, trap in game_state.traps_runtime.items():
        if trap["state"] == "arming":
            # Arming -> Active transition
            trap["state"] = "active"
            trap["remainingActiveTurns"] = rng.randint(trap["min_active"], trap["max_active"])
            trap["armingTurnsRemaining"] = 0
        elif trap["state"] == "active":
            # Apply damage to players in zone
            for player in game_state.players:
                if player["hp"] > 0:
                    player_pos = (player["pos"]["x"], player["pos"]["y"])
                    if player_pos in trap["zone"]:
                        player["hp"] = max(0, player["hp"] - trap["damage"])
                        # Check for game over
                        if player["hp"] <= 0 and game_state.status == "playing":
                            # Find the winner (other player)
                            winner = next((p for p in game_state.players if p["player_id"] != player["player_id"] and p["hp"] > 0), None)
                            if winner:
                                game_state.status = "finished"
                                game_state.winner_id = winner["player_id"]
            
            # Decrement active turns
            trap["remainingActiveTurns"] -= 1
            if trap["remainingActiveTurns"] <= 0:
                trap["state"] = "idle"
    
    # Phase 2: Randomly arm new traps (weighted)
    for trap_id, trap in game_state.traps_runtime.items():
        if trap["state"] == "idle":
            # Weighted random chance to start arming
            if rng.random() < trap["weight"] * 0.3:  # 30% of weight as base chance
                trap["state"] = "arming"
                trap["armingTurnsRemaining"] = 1  # Arms for 1 turn, then becomes active

async def broadcast_lobby_state():
    """Odešle stav lobby všem připojeným hráčům"""
    message = {
        "type": "lobby_state",
        "status": game_state.status,
        "players": [
            {
                "player_id": p["player_id"],
                "name": p["name"],
                "connected": p["connected"],
                "ready": p["ready"],
                "robot_id": p["robot_id"],
                "weapon_id": p["weapon_id"]
            }
            for p in game_state.players
        ],
        "can_start": len(game_state.players) == 2 and all(p["ready"] for p in game_state.players)
    }
    
    for player_id, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except:
            pass

async def broadcast_game_state():
    """Odešle stav hry všem připojeným hráčům"""
    message = {
        "type": "game_state",
        **game_state.to_dict()
    }
    
    # Add traps state
    message["traps_state"] = game_state.traps_runtime
    
    for player_id, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except:
            pass

async def broadcast_game_over():
    """Odešle zprávu o konci hry"""
    # Reset ready status for all players
    for player in game_state.players:
        player["ready"] = False
    
    winner = next((p for p in game_state.players if p["player_id"] == game_state.winner_id), None)
    message = {
        "type": "game_over",
        "winner_id": game_state.winner_id,
        "winner_name": winner["name"] if winner else "Neznámý"
    }
    
    for player_id, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except:
            pass
    
    # Also send updated lobby state with reset ready status
    await broadcast_lobby_state()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


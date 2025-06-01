from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Dict, List
import uuid
import asyncio
import json

app = FastAPI()

# Подключаем статические файлы и шаблоны
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Состояние игры
class GameServer:
    def __init__(self):
        self.players: Dict[str, Dict] = {}  # {player_id: {x, y, health, ...}}
        self.resources = []  # Ресурсы на карте
        self.size = 1000  # Размер карты
        
    def add_player(self, player_id: str):
        self.players[player_id] = {
            "x": 0,
            "y": 0,
            "health": 100,
            "hunger": 100,
            "inventory": [],
            "color": f"hsl({hash(player_id) % 360}, 100%, 50%)"
        }
        
    def remove_player(self, player_id: str):
        if player_id in self.players:
            del self.players[player_id]
    
    def move_player(self, player_id: str, dx: int, dy: int):
        if player_id in self.players:
            player = self.players[player_id]
            player["x"] = max(0, min(self.size, player["x"] + dx))
            player["y"] = max(0, min(self.size, player["y"] + dy))
    
    def generate_resources(self):
        # Генерируем случайные ресурсы на карте
        import random
        for _ in range(20):
            self.resources.append({
                "x": random.randint(0, self.size),
                "y": random.randint(0, self.size),
                "type": random.choice(["wood", "stone", "food"]),
                "id": str(uuid.uuid4())
            })

# Все игровые серверы
game_servers: Dict[str, GameServer] = {}
connections: Dict[str, Dict[str, WebSocket]] = {}  # {server_id: {player_id: websocket}}

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/game/{server_id}")
async def game(request: Request, server_id: str):
    return templates.TemplateResponse("game.html", {
        "request": request,
        "server_id": server_id
    })

@app.websocket("/ws/{server_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, server_id: str, player_id: str):
    # Создаем сервер если его нет
    if server_id not in game_servers:
        game_servers[server_id] = GameServer()
        game_servers[server_id].generate_resources()
        connections[server_id] = {}
    
    await websocket.accept()
    game_server = game_servers[server_id]
    connections[server_id][player_id] = websocket
    
    # Добавляем игрока
    game_server.add_player(player_id)
    
    try:
        # Отправляем начальное состояние
        await send_game_state(server_id)
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                # Обработка движения
                if message["type"] == "move":
                    dx = message["dx"]
                    dy = message["dy"]
                    game_server.move_player(player_id, dx, dy)
                    await send_game_state(server_id)
                
                # Обработка сбора ресурсов
                elif message["type"] == "collect":
                    resource_id = message["id"]
                    # Здесь должна быть логика сбора ресурсов
                    await send_game_state(server_id)
                    
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        # Удаляем игрока при отключении
        game_server.remove_player(player_id)
        del connections[server_id][player_id]
        await send_game_state(server_id)

async def send_game_state(server_id: str):
    if server_id in game_servers:
        game_server = game_servers[server_id]
        state = {
            "players": game_server.players,
            "resources": game_server.resources,
            "map_size": game_server.size
        }
        # Отправляем состояние всем подключенным игрокам
        for player_id, websocket in connections[server_id].items():
            try:
                await websocket.send_text(json.dumps(state))
            except:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

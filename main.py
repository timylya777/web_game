from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import uuid
import asyncio
import json
from pathlib import Path

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Получаем абсолютный путь к директории проекта
BASE_DIR = Path(__file__).resolve().parent

# Настраиваем пути к статике и шаблонам
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# Состояние игры
class GameServer:
    def __init__(self):
        self.players: Dict[str, Dict] = {}
        self.resources = []
        self.size = 1000
        self.generate_resources()
        
    def add_player(self, player_id: str):
        self.players[player_id] = {
            "x": self.size // 2,
            "y": self.size // 2,
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
        import random
        resource_types = ["wood", "stone", "food"]
        self.resources = [
            {
                "x": random.randint(0, self.size),
                "y": random.randint(0, self.size),
                "type": random.choice(resource_types),
                "id": str(uuid.uuid4())
            }
            for _ in range(50)
        ]

# Все игровые серверы
game_servers: Dict[str, GameServer] = {}
connections: Dict[str, Dict[str, WebSocket]] = {}

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
    await websocket.accept()
    
    # Инициализация сервера если нужно
    if server_id not in game_servers:
        game_servers[server_id] = GameServer()
        connections[server_id] = {}
    
    # Добавляем игрока
    game_servers[server_id].add_player(player_id)
    connections[server_id][player_id] = websocket
    
    try:
        # Отправляем начальное состояние
        await send_game_state(server_id)
        
        # Основной цикл обработки сообщений
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    message = json.loads(data)
                    
                    if message["type"] == "move":
                        dx = message.get("dx", 0)
                        dy = message.get("dy", 0)
                        game_servers[server_id].move_player(player_id, dx, dy)
                        await send_game_state(server_id)
                        
                except json.JSONDecodeError:
                    print(f"Invalid JSON from {player_id}")
                except KeyError as e:
                    print(f"Missing key in message from {player_id}: {e}")
                    
            except asyncio.TimeoutError:
                # Периодическая проверка соединения
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    break  # Соединение разорвано
            except WebSocketDisconnect:
                break  # Нормальное отключение
            except RuntimeError as e:
                if "disconnect" in str(e):
                    break
                raise
                
    except Exception as e:
        print(f"Error with {player_id}: {e}")
    finally:
        # Очистка при отключении
        if server_id in game_servers:
            game_servers[server_id].remove_player(player_id)
            if server_id in connections and player_id in connections[server_id]:
                del connections[server_id][player_id]
            await send_game_state(server_id)

async def send_game_state(server_id: str):
    if server_id not in game_servers or server_id not in connections:
        return
        
    game_server = game_servers[server_id]
    state = {
        "players": game_server.players,
        "resources": game_server.resources,
        "map_size": game_server.size
    }
    
    for player_id, websocket in list(connections[server_id].items()):
        try:
            await websocket.send_text(json.dumps(state))
        except:
            print(f"Failed to send to {player_id}")
            del connections[server_id][player_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

// Основные переменные игры
let ws;
let gameState = {};
let playerId;
let canvas, ctx;
let keys = {};
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
// Добавляем новые переменные
let isSwinging = false;
let swingProgress = 0;
const swingSpeed = 0.1;
let collectedResources = [];

// Инициализация игры при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    playerId = urlParams.get('player_id') || 'player_' + Math.random().toString(36).substr(2, 9);
    const serverId = window.location.pathname.split('/')[2];
    
    startGame(serverId, playerId);
});

function startGame(serverId, pId) {
    playerId = pId;
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;
    
    // Подключение к WebSocket
    connectWebSocket(serverId);
    
    // Обработчики клавиатуры
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
    
    // Игровой цикл
    setInterval(() => gameLoop(serverId), 1000/60);
}

function connectWebSocket(serverId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${serverId}/${playerId}`);
    
    let pingInterval;
    let reconnectTimeout;
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        updateConnectionStatus('Online', 'green');
        
        // Периодическая проверка соединения
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({type: "ping"}));
                } catch (e) {
                    console.error('Ping error:', e);
                    handleDisconnection();
                }
            }
        }, 25000); // Каждые 25 секунд
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "pong") return; // Игнорируем pong-ответы
            
            gameState = data;
            updatePlayerCount();
            updatePlayerInfo();
            renderGame();
        } catch (e) {
            console.error('Error parsing game state:', e);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        handleDisconnection();
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        handleDisconnection();
    };
    
    function handleDisconnection() {
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        updateConnectionStatus('Offline', 'orange');
        
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * (reconnectAttempts + 1), 5000);
            console.log(`Reconnecting attempt ${reconnectAttempts + 1} in ${delay}ms...`);
            reconnectTimeout = setTimeout(() => connectWebSocket(serverId), delay);
            reconnectAttempts++;
        } else {
            console.error('Max reconnection attempts reached');
            updateConnectionStatus('Connection lost', 'red');
        }
    }
}

function updateConnectionStatus(text, color) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.style.color = color;
        statusElement.dataset.status = 
            text === 'Online' ? 'online' : 
            text === 'Reconnecting...' ? 'reconnecting' : 'offline';
    }
}

function gameLoop(serverId) {
    let dx = 0, dy = 0;
    const speed = 5;
    
    if (keys['ArrowUp'] || keys['w']) dy -= speed;
    if (keys['ArrowDown'] || keys['s']) dy += speed;
    if (keys['ArrowLeft'] || keys['a']) dx -= speed;
    if (keys['ArrowRight'] || keys['d']) dx += speed;
    
    if ((dx !== 0 || dy !== 0) && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "move",
            dx: dx,
            dy: dy
        }));
    }
     if ((keys[' '] || keys['e']) && !isSwinging) {
        startSwing();
    }
    
    // Анимация взмаха
    if (isSwinging) {
        updateSwing();
    }
    
    renderGame();
}
function startSwing() {
    isSwinging = true;
    swingProgress = 0;
    
    // Проверяем сбор ресурсов
    if (gameState.players && gameState.players[playerId] && gameState.resources) {
        const player = gameState.players[playerId];
        const reachDistance = 50; // Дистанция сбора
        
        gameState.resources.forEach(resource => {
            const dist = Math.sqrt(
                Math.pow(player.x - resource.x, 2) + 
                Math.pow(player.y - resource.y, 2)
            );
            
            if (dist < reachDistance) {
                // Отправляем серверу запрос на сбор
                ws.send(JSON.stringify({
                    type: "collect",
                    resource_id: resource.id
                }));
                
                // Визуальный эффект
                collectedResources.push({
                    x: resource.x,
                    y: resource.y,
                    type: resource.type,
                    progress: 0
                });
            }
        });
    }
}
function updateSwing() {
    swingProgress += swingSpeed;
    if (swingProgress >= Math.PI) {
        isSwinging = false;
    }
    
    // Обновляем анимацию собранных ресурсов
    collectedResources = collectedResources.filter(res => {
        res.progress += 0.05;
        return res.progress < 1;
    });
}


function updatePlayerCount() {
    if (gameState.players) {
        const countElement = document.getElementById('player-count');
        if (countElement) {
            countElement.textContent = Object.keys(gameState.players).length;
        }
    }
}

function updatePlayerInfo() {
    const player = gameState.players?.[playerId];
    if (player) {
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        
        updateElement('health', player.health);
        updateElement('hunger', player.hunger);
        updateElement('inventory', player.inventory.join(', ') || 'empty');
    }
}

function renderGame() {
    if (!canvas || !ctx) return;
    
    // Очистка canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const currentPlayer = gameState.players?.[playerId];
    if (!currentPlayer) return;
    
    // Рендер ресурсов
    if (gameState.resources) {
        gameState.resources.forEach(resource => {
            const viewX = canvas.width / 2 - currentPlayer.x + resource.x;
            const viewY = canvas.height / 2 - currentPlayer.y + resource.y;
            
            let color;
            switch(resource.type) {
                case 'wood': color = '#8B4513'; break;
                case 'stone': color = '#808080'; break;
                case 'food': color = '#00FF00'; break;
                default: color = '#FFFF00';
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(viewX - 5, viewY - 5, 10, 10);
        });
    }
    
    // Рендер игроков
    if (gameState.players) {
        Object.entries(gameState.players).forEach(([id, player]) => {
            const viewX = canvas.width / 2 - currentPlayer.x + player.x;
            const viewY = canvas.height / 2 - currentPlayer.y + player.y;
            
            // Игрок
            ctx.fillStyle = player.color || '#3498db';
            ctx.fillRect(viewX - 10, viewY - 10, 20, 20);
            
            // Имя игрока
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.fillText(id === playerId ? 'You' : id.substring(0, 6), viewX - 10, viewY - 15);
            
            // Здоровье
            if (player.health < 100) {
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(viewX - 10, viewY - 20, 20 * (player.health / 100), 3);
            }
        });
    }
    if (isSwinging) {
        const player = gameState.players[playerId];
        const handX = canvas.width / 2 + Math.cos(swingProgress) * 30;
        const handY = canvas.height / 2 + Math.sin(swingProgress) * 30;
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, canvas.height / 2);
        ctx.lineTo(handX, handY);
        ctx.stroke();
    };
    // Рендерим анимацию сбора ресурсов
    collectedResources.forEach(res => {
        const viewX = canvas.width / 2 - gameState.players[playerId].x + res.x;
        const viewY = canvas.height / 2 - gameState.players[playerId].y + res.y;
        
        // Анимация движения к игроку
        const targetX = 20;
        const targetY = canvas.height - 20;
        const animX = viewX + (targetX - viewX) * res.progress;
        const animY = viewY + (targetY - viewY) * res.progress;
        
        // Выбираем emoji для ресурса
        let emoji;
        switch(res.type) {
            case 'wood': emoji = '🌳'; break;
            case 'stone': emoji = '🪨'; break;
            case 'food': emoji = '🍎'; break;
            default: emoji = '✨';
        }
        
        // Рисуем emoji
        ctx.font = '20px Arial';
        ctx.fillText(emoji, animX, animY);
    });
        
    // Рендерим инвентарь
    renderInventory();
    // Миникарта
    drawMiniMap();
}


function renderInventory() {
    const player = gameState.players?.[playerId];
    if (!player) return;
    
    const invX = 20;
    const invY = canvas.height - 40;
    const spacing = 30;
    
    // Считаем количество каждого типа ресурсов
    const counts = {};
    player.inventory.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
    });
    
    // Рисуем инвентарь
    let offset = 0;
    Object.entries(counts).forEach(([type, count]) => {
        let emoji;
        switch(type) {
            case 'wood': emoji = '🌳'; break;
            case 'stone': emoji = '🪨'; break;
            case 'food': emoji = '🍎'; break;
            default: emoji = '❓';
        }
        
        ctx.font = '20px Arial';
        ctx.fillText(`${emoji}×${count}`, invX + offset, invY);
        offset += spacing;
    });
}

function drawMiniMap() {
    const mapSize = 100;
    const posX = canvas.width - mapSize - 10;
    const posY = 10;
    
    // Фон
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(posX, posY, mapSize, mapSize);
    
    // Масштаб
    const scale = mapSize / (gameState.map_size || 1000);
    
    // Ресурсы на миникарте
    if (gameState.resources) {
        gameState.resources.forEach(resource => {
            const x = posX + resource.x * scale;
            const y = posY + resource.y * scale;
            
            ctx.fillStyle = resource.type === 'wood' ? '#8B4513' : 
                          resource.type === 'stone' ? '#808080' : '#00FF00';
            ctx.fillRect(x, y, 2, 2);
        });
    }
    
    // Игроки на миникарте
    if (gameState.players) {
        Object.entries(gameState.players).forEach(([id, player]) => {
            const x = posX + player.x * scale;
            const y = posY + player.y * scale;
            
            ctx.fillStyle = id === playerId ? '#e74c3c' : player.color || '#3498db';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

// Основные переменные игры
let ws; // WebSocket соединение
let gameState = {}; // Текущее состояние игры
let playerId; // ID текущего игрока
let canvas, ctx; // Canvas и его контекст
let keys = {}; // Состояние клавиш клавиатуры
let reconnectAttempts = 0; // Счетчик попыток переподключения
const maxReconnectAttempts = 5; // Максимальное число попыток переподключения

// Инициализация игры
function startGame(serverId, pId) {
    playerId = pId;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Устанавливаем размеры canvas
    canvas.width = 800;
    canvas.height = 600;
    
    // Начинаем подключение к WebSocket
    connectWebSocket(serverId);
    
    // Обработчики нажатий клавиш
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
    
    // Запускаем игровой цикл (60 FPS)
    setInterval(gameLoop, 1000/60);
}

// Функция подключения к WebSocket
function connectWebSocket(serverId) {
    // Определяем протокол (ws или wss для HTTPS)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${serverId}/${playerId}`);
    
    ws.onopen = () => {
        console.log('WebSocket подключен');
        reconnectAttempts = 0; // Сбрасываем счетчик переподключений
        document.getElementById('connection-status').textContent = 'Подключено';
        document.getElementById('connection-status').style.color = 'green';
    };
    
    ws.onmessage = (event) => {
        try {
            gameState = JSON.parse(event.data);
            updatePlayerCount();
            updatePlayerInfo();
            renderGame();
        } catch (e) {
            console.error('Ошибка разбора данных игры:', e);
        }
    };
    
    ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        document.getElementById('connection-status').textContent = 'Ошибка подключения';
        document.getElementById('connection-status').style.color = 'red';
    };
    
    ws.onclose = () => {
        console.log('WebSocket отключен');
        document.getElementById('connection-status').textContent = 'Отключено';
        document.getElementById('connection-status').style.color = 'orange';
        
        // Пробуем переподключиться
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * (reconnectAttempts + 1), 5000);
            console.log(`Попытка переподключения ${reconnectAttempts + 1} через ${delay}мс...`);
            setTimeout(() => connectWebSocket(serverId), delay);
            reconnectAttempts++;
        } else {
            console.error('Достигнуто максимальное количество попыток переподключения');
            alert('Не удалось подключиться к серверу. Пожалуйста, обновите страницу.');
        }
    };
}

// Игровой цикл
function gameLoop() {
    // Рассчитываем движение
    let dx = 0, dy = 0;
    const speed = 5;
    
    if (keys['ArrowUp'] || keys['w']) dy -= speed;
    if (keys['ArrowDown'] || keys['s']) dy += speed;
    if (keys['ArrowLeft'] || keys['a']) dx -= speed;
    if (keys['ArrowRight'] || keys['d']) dx += speed;
    
    // Отправляем движение на сервер
    if (dx !== 0 || dy !== 0) {
        sendMessage({
            type: "move",
            dx: dx,
            dy: dy
        });
    }
}

// Отправка сообщения на сервер
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(message));
        } catch (e) {
            console.error('Ошибка отправки сообщения:', e);
        }
    }
}

// Обновление счетчика игроков
function updatePlayerCount() {
    if (gameState.players) {
        document.getElementById('player-count').textContent = 
            Object.keys(gameState.players).length;
    }
}

// Обновление информации об игроке
function updatePlayerInfo() {
    const player = gameState.players?.[playerId];
    if (player) {
        document.getElementById('health').textContent = player.health;
        document.getElementById('hunger').textContent = player.hunger;
        document.getElementById('inventory').textContent = 
            player.inventory.join(', ') || 'пусто';
    }
}

// Отрисовка игры
function renderGame() {
    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Получаем текущего игрока
    const currentPlayer = gameState.players?.[playerId];
    if (!currentPlayer) return;
    
    // Рисуем игроков
    if (gameState.players) {
        for (const [id, player] of Object.entries(gameState.players)) {
            // Пересчитываем координаты для отображения (центрируем на текущем игроке)
            const viewX = canvas.width / 2 - currentPlayer.x + player.x;
            const viewY = canvas.height / 2 - currentPlayer.y + player.y;
            
            // Рисуем игрока
            ctx.fillStyle = player.color || 'blue';
            ctx.fillRect(viewX - 10, viewY - 10, 20, 20);
            
            // Рисуем имя игрока
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(id.substring(0, 6), viewX - 10, viewY - 15);
            
            // Рисуем здоровье
            if (player.health < 100) {
                ctx.fillStyle = 'red';
                ctx.fillRect(viewX - 10, viewY - 20, 20 * (player.health / 100), 2);
            }
        }
    }
    
    // Рисуем ресурсы
    if (gameState.resources) {
        gameState.resources.forEach(resource => {
            const viewX = canvas.width / 2 - currentPlayer.x + resource.x;
            const viewY = canvas.height / 2 - currentPlayer.y + resource.y;
            
            // Выбираем цвет в зависимости от типа ресурса
            let color;
            switch(resource.type) {
                case 'wood': color = '#8B4513'; break; // Коричневый
                case 'stone': color = '#808080'; break; // Серый
                case 'food': color = '#00FF00'; break; // Зеленый
                default: color = '#FFFF00'; // Желтый
            }
            
            // Рисуем ресурс
            ctx.fillStyle = color;
            ctx.fillRect(viewX - 5, viewY - 5, 10, 10);
            
            // Рисуем контур для лучшей видимости
            ctx.strokeStyle = '#000000';
            ctx.strokeRect(viewX - 5, viewY - 5, 10, 10);
        });
    }
    
    // Рисуем мини-карту
    drawMiniMap();
}

// Рисуем мини-карту в углу экрана
function drawMiniMap() {
    const mapSize = 100;
    const border = 2;
    const posX = canvas.width - mapSize - 10;
    const posY = 10;
    
    // Фон мини-карты
    ctx.fillStyle = '#333';
    ctx.fillRect(posX - border, posY - border, mapSize + 2*border, mapSize + 2*border);
    
    // Основная карта
    ctx.fillStyle = '#111';
    ctx.fillRect(posX, posY, mapSize, mapSize);
    
    // Масштаб для отображения на мини-карте
    const scale = mapSize / gameState.map_size;
    
    // Текущий игрок
    const currentPlayer = gameState.players?.[playerId];
    if (currentPlayer) {
        // Позиция игрока на мини-карте
        const playerX = posX + currentPlayer.x * scale;
        const playerY = posY + currentPlayer.y * scale;
        
        // Рисуем игрока на мини-карте
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Другие игроки
    if (gameState.players) {
        for (const [id, player] of Object.entries(gameState.players)) {
            if (id !== playerId) {
                const otherX = posX + player.x * scale;
                const otherY = posY + player.y * scale;
                
                ctx.fillStyle = player.color || 'blue';
                ctx.beginPath();
                ctx.arc(otherX, otherY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    // Ресурсы на мини-карте
    if (gameState.resources) {
        gameState.resources.forEach(resource => {
            const resX = posX + resource.x * scale;
            const resY = posY + resource.y * scale;
            
            let color;
            switch(resource.type) {
                case 'wood': color = '#8B4513'; break;
                case 'stone': color = '#808080'; break;
                case 'food': color = '#00FF00'; break;
                default: color = '#FFFF00';
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(resX - 1, resY - 1, 2, 2);
        });
    }
}

// Функция для сбора ресурсов (может вызываться при клике)
function collectResource(resourceId) {
    sendMessage({
        type: "collect",
        id: resourceId
    });
}

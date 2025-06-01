let ws;
let gameState = {};
let playerId;
let canvas, ctx;
let keys = {};

function startGame(serverId, pId) {
    playerId = pId;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    canvas.width = 800;
    canvas.height = 600;
    
    // Функция для подключения WebSocket с обработкой ошибок
    function connectWebSocket() {
        // Определяем протокол (ws или wss для HTTPS)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/${serverId}/${playerId}`);
        
        ws.onopen = () => {
            console.log('WebSocket подключен');
        };
        
        ws.onmessage = (event) => {
            try {
                gameState = JSON.parse(event.data);
                updatePlayerCount();
                renderGame();
            } catch (e) {
                console.error('Ошибка разбора данных игры:', e);
            }
        };
        
        ws.onerror = (error) => {
            console.error('Ошибка WebSocket:', error);
        };
        
        ws.onclose = () => {
            console.log('WebSocket отключен, пробуем переподключиться...');
            setTimeout(connectWebSocket, 2000); // Переподключение через 2 секунды
        };
    }
    
    // Первоначальное подключение
    connectWebSocket();
    
    // Остальной код игры...

    
    // Обработка клавиш
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
    
    // Игровой цикл
    setInterval(gameLoop, 1000/60);
}

function gameLoop() {
    let dx = 0, dy = 0;
    const speed = 5;
    
    if (keys['ArrowUp'] || keys['w']) dy -= speed;
    if (keys['ArrowDown'] || keys['s']) dy += speed;
    if (keys['ArrowLeft'] || keys['a']) dx -= speed;
    if (keys['ArrowRight'] || keys['d']) dx += speed;
    
    if (dx !== 0 || dy !== 0) {
        ws.send(JSON.stringify({
            type: "move",
            dx: dx,
            dy: dy
        }));
    }
}

function updatePlayerCount() {
    if (gameState.players) {
        document.getElementById('player-count').textContent = Object.keys(gameState.players).length;
    }
}

function renderGame() {
    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем игроков
    if (gameState.players) {
        for (const [id, player] of Object.entries(gameState.players)) {
            // Пересчитываем координаты для отображения (центрируем на текущем игроке)
            const currentPlayer = gameState.players[playerId];
            if (!currentPlayer) continue;
            
            const viewX = canvas.width / 2 - currentPlayer.x + player.x;
            const viewY = canvas.height / 2 - currentPlayer.y + player.y;
            
            ctx.fillStyle = player.color;
            ctx.fillRect(viewX - 10, viewY - 10, 20, 20);
            
            // Рисуем имя игрока
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(id.substring(0, 6), viewX - 10, viewY - 15);
        }
    }
    
    // Рисуем ресурсы
    if (gameState.resources) {
        gameState.resources.forEach(resource => {
            const currentPlayer = gameState.players[playerId];
            if (!currentPlayer) return;
            
            const viewX = canvas.width / 2 - currentPlayer.x + resource.x;
            const viewY = canvas.height / 2 - currentPlayer.y + resource.y;
            
            let color;
            switch(resource.type) {
                case 'wood': color = 'brown'; break;
                case 'stone': color = 'gray'; break;
                case 'food': color = 'green'; break;
                default: color = 'yellow';
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(viewX - 5, viewY - 5, 10, 10);
        });
    }
    
    // Обновляем информацию о игроке
    const player = gameState.players?.[playerId];
    if (player) {
        document.getElementById('health').textContent = player.health;
        document.getElementById('hunger').textContent = player.hunger;
        document.getElementById('inventory').textContent = player.inventory.join(', ') || 'пусто';
    }
}

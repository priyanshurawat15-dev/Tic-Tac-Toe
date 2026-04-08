const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const rooms = new Map();
const playerSockets = new Map();

function createInitialGameState() {
    return {
        board: Array(3).fill(null).map(() => Array(3).fill(null)),
        currentPlayer: 'X',
        phase: 'placement',
        player1Pieces: 0,
        player2Pieces: 0,
        gameOver: false,
        winningLine: [],
        revision: 0,
        updatedAt: Date.now()
    };
}

function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let index = 0; index < 6; index += 1) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
}

function sanitizePlayerName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function sendMessage(socket, message) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function buildPlayersPayload(room) {
    const payload = {};
    room.players.forEach((player) => {
        payload[player.symbol] = player.name;
    });
    return payload;
}

function broadcastToRoom(roomId, message, excludeSocket = null) {
    const room = rooms.get(roomId);
    if (!room) {
        return;
    }

    room.players.forEach((player) => {
        if (player.socket !== excludeSocket && player.socket.readyState === WebSocket.OPEN) {
            player.socket.send(JSON.stringify(message));
        }
    });
}

function handleApiRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const stateMatch = url.pathname.match(/^\/api\/room\/([A-Z0-9]{6})\/state$/);

    if (!stateMatch) {
        return false;
    }

    const roomId = stateMatch[1];
    const room = rooms.get(roomId);

    if (req.method === 'GET') {
        if (!room) {
            sendJson(res, 404, { error: 'Room not found' });
            return true;
        }

        sendJson(res, 200, {
            roomId,
            players: buildPlayersPayload(room),
            state: room.gameState
        });
        return true;
    }

    if (req.method === 'POST') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            if (!room) {
                sendJson(res, 404, { error: 'Room not found' });
                return;
            }

            try {
                const payload = JSON.parse(body || '{}');
                const nextState = payload.state;

                if (!nextState || !Array.isArray(nextState.board)) {
                    sendJson(res, 400, { error: 'Invalid state payload' });
                    return;
                }

                room.gameState = {
                    ...room.gameState,
                    ...nextState,
                    revision: (room.gameState.revision || 0) + 1,
                    updatedAt: Date.now()
                };

                broadcastToRoom(roomId, {
                    type: 'state_sync',
                    state: room.gameState,
                    players: buildPlayersPayload(room)
                });

                sendJson(res, 200, { ok: true, revision: room.gameState.revision });
            } catch (error) {
                sendJson(res, 400, { error: 'Invalid JSON payload' });
            }
        });

        return true;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
}

const server = http.createServer((req, res) => {
    if (handleApiRequest(req, res)) {
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestPath = url.pathname === '/' ? 'index.html' : url.pathname;
    const filePath = path.join(__dirname, requestPath);
    const extname = path.extname(filePath);

    let contentType = 'text/html';
    if (extname === '.js') {
        contentType = 'text/javascript';
    } else if (extname === '.css') {
        contentType = 'text/css';
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
                return;
            }

            res.writeHead(500);
            res.end('Server error');
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message.type, message.roomId || '');

            switch (message.type) {
                case 'create_room': {
                    const playerName = sanitizePlayerName(message.playerName);
                    if (!playerName) {
                        sendMessage(ws, { type: 'error', message: 'Please enter your name before creating a room.' });
                        return;
                    }

                    let roomId = generateRoomId();
                    while (rooms.has(roomId)) {
                        roomId = generateRoomId();
                    }

                    const room = {
                        players: [{ socket: ws, symbol: 'X', name: playerName }],
                        gameState: createInitialGameState()
                    };

                    rooms.set(roomId, room);
                    playerSockets.set(ws, { roomId, symbol: 'X', name: playerName });

                    sendMessage(ws, {
                        type: 'room_created',
                        roomId,
                        players: buildPlayersPayload(room)
                    });
                    break;
                }

                case 'join_room': {
                    const roomId = String(message.roomId || '').toUpperCase();
                    const playerName = sanitizePlayerName(message.playerName);
                    const room = rooms.get(roomId);

                    if (!playerName) {
                        sendMessage(ws, { type: 'error', message: 'Please enter your name before joining a room.' });
                        return;
                    }

                    if (!room) {
                        sendMessage(ws, { type: 'error', message: 'Room not found. Check the code and try again.' });
                        return;
                    }

                    if (room.players.length >= 2) {
                        sendMessage(ws, { type: 'error', message: 'That room is already full.' });
                        return;
                    }

                    room.players.push({ socket: ws, symbol: 'O', name: playerName });
                    playerSockets.set(ws, { roomId, symbol: 'O', name: playerName });

                    const players = buildPlayersPayload(room);

                    room.players.forEach((player) => {
                        sendMessage(player.socket, {
                            type: 'room_joined',
                            roomId,
                            playerSymbol: player.symbol,
                            players
                        });
                    });

                    room.players.forEach((player) => {
                        sendMessage(player.socket, {
                            type: 'game_start',
                            playerSymbol: player.symbol,
                            players,
                            state: room.gameState
                        });
                    });
                    break;
                }

                case 'move': {
                    const socketInfo = playerSockets.get(ws);
                    const roomId = socketInfo?.roomId || String(message.roomId || '').toUpperCase();
                    const room = rooms.get(roomId);
                    if (!room) {
                        sendMessage(ws, { type: 'error', message: 'Live sync failed because the room could not be found.' });
                        return;
                    }

                    broadcastToRoom(roomId, {
                        type: 'move_made',
                        move: message.move
                    }, ws);
                    break;
                }

                case 'restart': {
                    const socketInfo = playerSockets.get(ws);
                    const roomId = socketInfo?.roomId || String(message.roomId || '').toUpperCase();
                    const room = rooms.get(roomId);
                    if (!room) {
                        sendMessage(ws, { type: 'error', message: 'Restart failed because the room could not be found.' });
                        return;
                    }

                    room.gameState = createInitialGameState();
                    broadcastToRoom(roomId, {
                        type: 'game_restart',
                        state: room.gameState
                    });
                    break;
                }

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            sendMessage(ws, {
                type: 'error',
                message: 'The server could not process that request.'
            });
        }
    });

    ws.on('close', () => {
        const socketInfo = playerSockets.get(ws);
        if (!socketInfo) {
            return;
        }

        const room = rooms.get(socketInfo.roomId);
        if (room) {
            room.players = room.players.filter((player) => player.socket !== ws);

            if (room.players.length > 0) {
                broadcastToRoom(socketInfo.roomId, { type: 'opponent_disconnected' });
            } else {
                rooms.delete(socketInfo.roomId);
            }
        }

        playerSockets.delete(ws);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`HTTP and WebSocket server running on port ${PORT}`);
});

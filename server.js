const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const requestPath = req.url === '/' ? 'index.html' : req.url;
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

const rooms = new Map();
const playerSockets = new Map();

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

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);

            switch (message.type) {
                case 'create_room': {
                    const playerName = sanitizePlayerName(message.playerName);

                    if (!playerName) {
                        sendMessage(ws, {
                            type: 'error',
                            message: 'Please enter your name before creating a room.'
                        });
                        return;
                    }

                    let roomId = generateRoomId();
                    while (rooms.has(roomId)) {
                        roomId = generateRoomId();
                    }

                    const room = {
                        players: [
                            {
                                socket: ws,
                                symbol: 'X',
                                name: playerName
                            }
                        ]
                    };

                    rooms.set(roomId, room);
                    playerSockets.set(ws, { roomId, symbol: 'X', name: playerName });

                    sendMessage(ws, {
                        type: 'room_created',
                        roomId,
                        players: buildPlayersPayload(room)
                    });

                    console.log(`Room ${roomId} created by ${playerName}`);
                    break;
                }

                case 'join_room': {
                    const roomId = String(message.roomId || '').toUpperCase();
                    const playerName = sanitizePlayerName(message.playerName);
                    const room = rooms.get(roomId);

                    if (!playerName) {
                        sendMessage(ws, {
                            type: 'error',
                            message: 'Please enter your name before joining a room.'
                        });
                        return;
                    }

                    if (!room) {
                        sendMessage(ws, {
                            type: 'error',
                            message: 'Room not found. Check the code and try again.'
                        });
                        return;
                    }

                    if (room.players.length >= 2) {
                        sendMessage(ws, {
                            type: 'error',
                            message: 'That room is already full.'
                        });
                        return;
                    }

                    room.players.push({
                        socket: ws,
                        symbol: 'O',
                        name: playerName
                    });

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
                            players
                        });
                    });

                    console.log(`${playerName} joined room ${roomId}`);
                    break;
                }

                case 'move': {
                    const room = rooms.get(message.roomId);
                    if (!room) {
                        return;
                    }

                    broadcastToRoom(message.roomId, {
                        type: 'move_made',
                        move: message.move
                    }, ws);
                    break;
                }

                case 'restart': {
                    const room = rooms.get(message.roomId);
                    if (!room) {
                        return;
                    }

                    broadcastToRoom(message.roomId, {
                        type: 'game_restart'
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
        console.log('Client disconnected');

        const socketInfo = playerSockets.get(ws);
        if (!socketInfo) {
            return;
        }

        const room = rooms.get(socketInfo.roomId);
        if (room) {
            room.players = room.players.filter((player) => player.socket !== ws);

            if (room.players.length > 0) {
                broadcastToRoom(socketInfo.roomId, {
                    type: 'opponent_disconnected'
                });
            } else {
                rooms.delete(socketInfo.roomId);
                console.log(`Room ${socketInfo.roomId} deleted`);
            }
        }

        playerSockets.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`HTTP and WebSocket server running on port ${PORT}`);
});

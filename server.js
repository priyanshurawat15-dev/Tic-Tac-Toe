// Simple WebSocket Server for Tic-Tac-Toe Multiplayer
// Run with: node server.js

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server for serving static files
const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';

    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Game room management
const rooms = new Map();
const playerSockets = new Map();

// Generate random room ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Broadcast to all players in a room
function broadcastToRoom(roomId, message, excludeSocket = null) {
    const room = rooms.get(roomId);
    if (room) {
        room.players.forEach(playerSocket => {
            if (playerSocket !== excludeSocket && playerSocket.readyState === WebSocket.OPEN) {
                playerSocket.send(JSON.stringify(message));
            }
        });
    }
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    let currentRoom = null;
    let playerSymbol = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);

            switch (message.type) {
                case 'create_room':
                    const roomId = generateRoomId();
                    
                    // Create new room
                    rooms.set(roomId, {
                        players: [ws],
                        gameState: null,
                        playerSymbols: { [ws]: 'X' }
                    });
                    
                    currentRoom = roomId;
                    playerSymbol = 'X';
                    playerSockets.set(ws, { roomId, symbol: 'X' });
                    
                    ws.send(JSON.stringify({
                        type: 'room_created',
                        roomId
                    }));
                    
                    console.log(`Room ${roomId} created`);
                    break;

                case 'join_room':
                    const room = rooms.get(message.roomId);
                    
                    if (room && room.players.length === 1) {
                        // Join existing room
                        room.players.push(ws);
                        currentRoom = message.roomId;
                        playerSymbol = 'O';
                        playerSockets.set(ws, { roomId: message.roomId, symbol: 'O' });
                        room.playerSymbols[ws] = 'O';
                        
                        // Notify both players that game can start
                        ws.send(JSON.stringify({
                            type: 'room_joined',
                            roomId: message.roomId,
                            playerSymbol: 'O'
                        }));
                        
                        // Notify room creator
                        room.players[0].send(JSON.stringify({
                            type: 'room_joined',
                            roomId: message.roomId,
                            playerSymbol: 'X'
                        }));
                        
                        // Start game for both players
                        setTimeout(() => {
                            room.players.forEach((playerSocket, index) => {
                                playerSocket.send(JSON.stringify({
                                    type: 'game_start',
                                    playerSymbol: index === 0 ? 'X' : 'O'
                                }));
                            });
                        }, 500);
                        
                        console.log(`Player joined room ${message.roomId}`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found or full'
                        }));
                    }
                    break;

                case 'move':
                    const moveRoom = rooms.get(message.roomId);
                    if (moveRoom) {
                        // Broadcast move to opponent
                        broadcastToRoom(message.roomId, {
                            type: 'move_made',
                            move: message.move
                        }, ws);
                    }
                    break;

                case 'restart':
                    const restartRoom = rooms.get(message.roomId);
                    if (restartRoom) {
                        broadcastToRoom(message.roomId, {
                            type: 'game_restart'
                        });
                    }
                    break;

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        
        // Clean up room and notify opponent
        const socketInfo = playerSockets.get(ws);
        if (socketInfo) {
            const room = rooms.get(socketInfo.roomId);
            if (room) {
                // Notify remaining player
                broadcastToRoom(socketInfo.roomId, {
                    type: 'opponent_disconnected'
                });
                
                // Remove room or player
                const playerIndex = room.players.indexOf(ws);
                if (playerIndex > -1) {
                    room.players.splice(playerIndex, 1);
                }
                
                // Delete room if empty
                if (room.players.length === 0) {
                    rooms.delete(socketInfo.roomId);
                    console.log(`Room ${socketInfo.roomId} deleted`);
                }
            }
            
            playerSockets.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

console.log('WebSocket server started on port 8080');
console.log('HTTP server started on port 3000');
console.log('Open http://localhost:3000 to play the game!');

// Start HTTP server
server.listen(3000, () => {
    console.log('Game server running!');
});

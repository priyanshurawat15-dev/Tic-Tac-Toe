// Game States and Constants
const GamePhase = {
    PLACEMENT: 'placement',
    MOVEMENT: 'movement'
};

const GameMode = {
    OFFLINE: 'offline',
    ONLINE: 'online'
};

const Player = {
    X: 'X',
    O: 'O'
};

// Sound Effects Manager
class SoundManager {
    constructor() {
        this.enabled = true;
        this.audioContext = null;
        this.initAudio();
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio not supported');
            this.enabled = false;
        }
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    playMove() {
        this.playSound(440, 0.1);
    }

    playPlace() {
        this.playSound(523, 0.15);
    }

    playWin() {
        this.playSound(659, 0.2);
        setTimeout(() => this.playSound(784, 0.2), 100);
        setTimeout(() => this.playSound(880, 0.3), 200);
    }

    playError() {
        this.playSound(200, 0.2, 'sawtooth');
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// WebSocket Manager for Online Multiplayer
class NetworkManager {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerSymbol = null;
        this.isConnected = false;
        this.onMessageCallback = null;
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
    }

    connect(serverUrl = 'ws://localhost:8080') {
        try {
            this.socket = new WebSocket(serverUrl);
            
            this.socket.onopen = () => {
                this.isConnected = true;
                console.log('Connected to server');
                if (this.onConnectCallback) this.onConnectCallback();
            };

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (this.onMessageCallback) this.onMessageCallback(data);
            };

            this.socket.onclose = () => {
                this.isConnected = false;
                console.log('Disconnected from server');
                if (this.onDisconnectCallback) this.onDisconnectCallback();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
            };

        } catch (error) {
            console.error('Failed to connect:', error);
            this.isConnected = false;
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.roomId = null;
        this.playerSymbol = null;
    }

    send(message) {
        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(message));
        }
    }

    createRoom() {
        this.send({ type: 'create_room' });
    }

    joinRoom(roomId) {
        this.roomId = roomId;
        this.send({ type: 'join_room', roomId });
    }

    makeMove(moveData) {
        this.send({
            type: 'move',
            roomId: this.roomId,
            move: moveData
        });
    }

    restartGame() {
        this.send({
            type: 'restart',
            roomId: this.roomId
        });
    }
}

// Main Game Class
class TicTacToeGame {
    constructor() {
        this.gameMode = GameMode.OFFLINE;
        this.board = Array(3).fill(null).map(() => Array(3).fill(null));
        this.currentPlayer = Player.X;
        this.phase = GamePhase.PLACEMENT;
        this.player1Pieces = 0;
        this.player2Pieces = 0;
        this.selectedPiece = null;
        this.gameOver = false;
        this.winningLine = [];
        this.currentScreen = 'menu';
        
        // Network and Sound
        this.network = new NetworkManager();
        this.soundManager = new SoundManager();
        
        // Initialize
        this.initializeEventListeners();
        this.setupNetworkCallbacks();
    }

    // Screen Management
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    }

    // Network Setup
    setupNetworkCallbacks() {
        this.network.onConnectCallback = () => {
            this.updateConnectionStatus(true);
        };

        this.network.onDisconnectCallback = () => {
            this.updateConnectionStatus(false);
        };

        this.network.onMessageCallback = (data) => {
            this.handleNetworkMessage(data);
        };
    }

    handleNetworkMessage(data) {
        switch (data.type) {
            case 'room_created':
                this.handleRoomCreated(data.roomId);
                break;
            case 'room_joined':
                this.handleRoomJoined(data.roomId, data.playerSymbol);
                break;
            case 'game_start':
                this.handleGameStart(data.playerSymbol);
                break;
            case 'move_made':
                this.handleOpponentMove(data.move);
                break;
            case 'game_restart':
                this.handleGameRestart();
                break;
            case 'opponent_disconnected':
                this.handleOpponentDisconnected();
                break;
        }
    }

    // Event Listeners
    initializeEventListeners() {
        // Menu buttons
        document.getElementById('offline-btn').addEventListener('click', () => {
            this.startOfflineGame();
        });

        document.getElementById('online-btn').addEventListener('click', () => {
            this.showOnlineRoomScreen();
        });

        document.getElementById('help-menu-btn').addEventListener('click', () => {
            this.showHelpModal();
        });

        // Room screen buttons
        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.showScreen('menu-screen');
        });

        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.createRoom();
        });

        document.getElementById('join-room-btn').addEventListener('click', () => {
            this.joinRoom();
        });

        document.getElementById('copy-room-btn').addEventListener('click', () => {
            this.copyRoomId();
        });

        document.getElementById('leave-room-btn').addEventListener('click', () => {
            this.leaveRoom();
        });

        // Game screen buttons
        document.getElementById('back-to-menu-game').addEventListener('click', () => {
            this.backToMenu();
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            this.restartGame();
        });

        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelpModal();
        });

        document.getElementById('sound-toggle').addEventListener('click', () => {
            this.toggleSound();
        });

        // Modal buttons
        document.getElementById('modal-restart-btn').addEventListener('click', () => {
            this.hideWinnerModal();
            this.restartGame();
        });

        document.getElementById('modal-menu-btn').addEventListener('click', () => {
            this.hideWinnerModal();
            this.backToMenu();
        });

        document.getElementById('close-help-btn').addEventListener('click', () => {
            this.hideHelpModal();
        });

        // Game board cells
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => this.handleCellClick(e));
        });

        // Room ID input
        document.getElementById('room-id-input').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Game Start Functions
    startOfflineGame() {
        this.gameMode = GameMode.OFFLINE;
        this.resetGame();
        this.showScreen('game-screen');
        this.updateGameModeDisplay();
    }

    showOnlineRoomScreen() {
        this.showScreen('room-screen');
    }

    // Online Room Functions
    createRoom() {
        if (!this.network.isConnected) {
            this.network.connect();
        }
        
        setTimeout(() => {
            if (this.network.isConnected) {
                this.network.createRoom();
            } else {
                alert('Failed to connect to server. Please try again.');
            }
        }, 1000);
    }

    handleRoomCreated(roomId) {
        this.roomId = roomId;
        document.getElementById('generated-room-id').textContent = roomId;
        document.getElementById('room-id-display').classList.remove('hidden');
        document.getElementById('waiting-room-id').textContent = roomId;
        document.getElementById('waiting-room').classList.remove('hidden');
    }

    joinRoom() {
        const roomId = document.getElementById('room-id-input').value.trim().toUpperCase();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        if (!this.network.isConnected) {
            this.network.connect();
        }

        setTimeout(() => {
            if (this.network.isConnected) {
                this.network.joinRoom(roomId);
            } else {
                alert('Failed to connect to server. Please try again.');
            }
        }, 1000);
    }

    handleRoomJoined(roomId, playerSymbol) {
        this.roomId = roomId;
        this.playerSymbol = playerSymbol;
        document.getElementById('waiting-room-id').textContent = roomId;
        document.getElementById('waiting-room').classList.remove('hidden');
    }

    handleGameStart(playerSymbol) {
        this.playerSymbol = playerSymbol;
        this.gameMode = GameMode.ONLINE;
        this.resetGame();
        this.showScreen('game-screen');
        this.updateGameModeDisplay();
        document.getElementById('waiting-room').classList.add('hidden');
    }

    copyRoomId() {
        const roomId = document.getElementById('generated-room-id').textContent;
        navigator.clipboard.writeText(roomId).then(() => {
            const btn = document.getElementById('copy-room-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }

    leaveRoom() {
        this.network.disconnect();
        document.getElementById('waiting-room').classList.add('hidden');
        document.getElementById('room-id-display').classList.add('hidden');
        document.getElementById('room-id-input').value = '';
        this.showScreen('menu-screen');
    }

    // Game Logic
    handleCellClick(event) {
        if (this.gameOver) return;

        // In online mode, only allow moves for current player
        if (this.gameMode === GameMode.ONLINE && this.currentPlayer !== this.playerSymbol) {
            this.soundManager.playError();
            return;
        }

        const cell = event.target;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        if (this.phase === GamePhase.PLACEMENT) {
            this.handlePlacement(row, col, cell);
        } else if (this.phase === GamePhase.MOVEMENT) {
            this.handleMovement(row, col, cell);
        }
    }

    handlePlacement(row, col, cell) {
        if (this.board[row][col] !== null) {
            this.soundManager.playError();
            return;
        }

        const maxPieces = 3;
        const currentPieces = this.currentPlayer === Player.X ? this.player1Pieces : this.player2Pieces;
        
        if (currentPieces >= maxPieces) {
            this.soundManager.playError();
            return;
        }

        // Place piece
        this.board[row][col] = this.currentPlayer;
        cell.textContent = this.currentPlayer;
        cell.classList.add('occupied', `${this.currentPlayer.toLowerCase()}-piece`);

        this.soundManager.playPlace();

        // Update piece count
        if (this.currentPlayer === Player.X) {
            this.player1Pieces++;
        } else {
            this.player2Pieces++;
        }

        // Check for winner
        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        // Check if movement phase should start
        if (this.player1Pieces === 3 && this.player2Pieces === 3) {
            this.phase = GamePhase.MOVEMENT;
        } else {
            this.currentPlayer = this.currentPlayer === Player.X ? Player.O : Player.X;
        }

        // Send move to network if online
        if (this.gameMode === GameMode.ONLINE) {
            this.network.makeMove({
                type: 'place',
                row,
                col,
                player: this.currentPlayer === Player.X ? Player.O : Player.X,
                phase: this.phase,
                player1Pieces: this.player1Pieces,
                player2Pieces: this.player2Pieces
            });
        }

        this.updateUI();
    }

    handleMovement(row, col, cell) {
        if (this.selectedPiece === null) {
            // Select a piece
            if (this.board[row][col] === this.currentPlayer) {
                this.selectPiece(row, col, cell);
                this.soundManager.playMove();
            }
        } else {
            // Move or deselect
            if (this.board[row][col] === this.currentPlayer) {
                this.deselectPiece();
                this.selectPiece(row, col, cell);
                this.soundManager.playMove();
            } else if (this.board[row][col] === null && this.isValidMove(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
                this.movePiece(row, col, cell);
            } else {
                this.deselectPiece();
                this.soundManager.playError();
            }
        }
    }

    selectPiece(row, col, cell) {
        this.selectedPiece = { row, col, cell };
        cell.classList.add('selected');
        this.highlightValidMoves(row, col);
    }

    deselectPiece() {
        if (this.selectedPiece) {
            this.selectedPiece.cell.classList.remove('selected');
            this.clearValidMoveHighlights();
            this.selectedPiece = null;
        }
    }

    highlightValidMoves(row, col) {
        const validMoves = this.getValidMoves(row, col);
        validMoves.forEach(move => {
            const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            cell.classList.add('valid-move');
        });
    }

    clearValidMoveHighlights() {
        document.querySelectorAll('.valid-move').forEach(cell => {
            cell.classList.remove('valid-move');
        });
    }

    getValidMoves(row, col) {
        const moves = [];
        // All 8 directions including diagonals
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],  // top-left, top, top-right
            [0, -1],           [0, 1],    // left, right
            [1, -1],  [1, 0],  [1, 1]    // bottom-left, bottom, bottom-right
        ];

        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3 && this.board[newRow][newCol] === null) {
                moves.push({ row: newRow, col: newCol });
            }
        });

        return moves;
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        const validMoves = this.getValidMoves(fromRow, fromCol);
        return validMoves.some(move => move.row === toRow && move.col === toCol);
    }

    movePiece(newRow, newCol, newCell) {
        const { row: oldRow, col: oldCol, cell: oldCell } = this.selectedPiece;

        // Move piece
        this.board[newRow][newCol] = this.currentPlayer;
        this.board[oldRow][oldCol] = null;

        newCell.textContent = this.currentPlayer;
        newCell.classList.add('occupied', `${this.currentPlayer.toLowerCase()}-piece`);

        oldCell.textContent = '';
        oldCell.classList.remove('occupied', 'x-piece', 'o-piece');

        this.soundManager.playMove();
        this.deselectPiece();

        // Check for winner
        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        // Switch player
        this.currentPlayer = this.currentPlayer === Player.X ? Player.O : Player.X;

        // Send move to network if online
        if (this.gameMode === GameMode.ONLINE) {
            this.network.makeMove({
                type: 'move',
                from: { row: oldRow, col: oldCol },
                to: { row: newRow, col: newCol },
                player: this.currentPlayer,
                phase: this.phase
            });
        }

        this.updateUI();
    }

    handleOpponentMove(move) {
        if (move.type === 'place') {
            this.board[move.row][move.col] = move.player;
            const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            cell.textContent = move.player;
            cell.classList.add('occupied', `${move.player.toLowerCase()}-piece`);
            
            this.player1Pieces = move.player1Pieces;
            this.player2Pieces = move.player2Pieces;
            this.phase = move.phase;
            this.currentPlayer = move.player;
            
        } else if (move.type === 'move') {
            const fromCell = document.querySelector(`[data-row="${move.from.row}"][data-col="${move.from.col}"]`);
            const toCell = document.querySelector(`[data-row="${move.to.row}"][data-col="${move.to.col}"]`);
            
            this.board[move.from.row][move.from.col] = null;
            this.board[move.to.row][move.to.col] = move.player;
            
            fromCell.textContent = '';
            fromCell.classList.remove('occupied', 'x-piece', 'o-piece');
            
            toCell.textContent = move.player;
            toCell.classList.add('occupied', `${move.player.toLowerCase()}-piece`);
            
            this.currentPlayer = move.player;
        }

        this.soundManager.playMove();
        this.updateUI();

        // Check for winner after opponent move
        if (this.checkWinner()) {
            this.endGame();
        }
    }

    checkWinner() {
        const lines = [
            // Horizontal
            [[0, 0], [0, 1], [0, 2]],
            [[1, 0], [1, 1], [1, 2]],
            [[2, 0], [2, 1], [2, 2]],
            // Vertical
            [[0, 0], [1, 0], [2, 0]],
            [[0, 1], [1, 1], [2, 1]],
            [[0, 2], [1, 2], [2, 2]],
            // Diagonal
            [[0, 0], [1, 1], [2, 2]],
            [[0, 2], [1, 1], [2, 0]]
        ];

        for (const line of lines) {
            const [a, b, c] = line;
            if (this.board[a[0]][a[1]] && 
                this.board[a[0]][a[1]] === this.board[b[0]][b[1]] && 
                this.board[a[0]][a[1]] === this.board[c[0]][c[1]]) {
                this.winningLine = line;
                return true;
            }
        }

        return false;
    }

    endGame() {
        this.gameOver = true;
        this.highlightWinningLine();
        this.soundManager.playWin();
        
        setTimeout(() => {
            this.showWinnerModal();
        }, 600);
    }

    highlightWinningLine() {
        this.winningLine.forEach(([row, col]) => {
            const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            cell.classList.add('winning');
        });
    }

    restartGame() {
        if (this.gameMode === GameMode.ONLINE) {
            this.network.restartGame();
        }
        this.resetGame();
    }

    handleGameRestart() {
        this.resetGame();
    }

    resetGame() {
        this.board = Array(3).fill(null).map(() => Array(3).fill(null));
        this.currentPlayer = Player.X;
        this.phase = GamePhase.PLACEMENT;
        this.player1Pieces = 0;
        this.player2Pieces = 0;
        this.selectedPiece = null;
        this.gameOver = false;
        this.winningLine = [];

        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('occupied', 'x-piece', 'o-piece', 'selected', 'valid-move', 'winning');
        });

        this.updateUI();
    }

    // UI Functions
    updateUI() {
        const currentPlayerElement = document.getElementById('current-player');
        const phaseIndicatorElement = document.getElementById('phase-indicator');
        const xPiecesElement = document.getElementById('x-pieces');
        const oPiecesElement = document.getElementById('o-pieces');

        currentPlayerElement.textContent = `Player ${this.currentPlayer}'s Turn`;
        phaseIndicatorElement.textContent = this.phase === GamePhase.PLACEMENT ? 'Placement Phase' : 'Movement Phase';
        xPiecesElement.textContent = `${this.player1Pieces}/3`;
        oPiecesElement.textContent = `${this.player2Pieces}/3`;

        if (this.phase === GamePhase.MOVEMENT) {
            currentPlayerElement.textContent += ' (Select a piece to move)';
        }
    }

    updateGameModeDisplay() {
        const gameModeElement = document.getElementById('game-mode');
        if (this.gameMode === GameMode.ONLINE) {
            gameModeElement.textContent = `Online (${this.playerSymbol})`;
            document.getElementById('connection-status').classList.remove('hidden');
        } else {
            gameModeElement.textContent = 'Local Game';
            document.getElementById('connection-status').classList.add('hidden');
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        const statusDot = statusElement.querySelector('.status-dot');
        const statusText = statusElement.querySelector('.status-text');

        if (connected) {
            statusDot.style.background = 'var(--success-color)';
            statusText.textContent = 'Connected';
        } else {
            statusDot.style.background = 'var(--danger-color)';
            statusText.textContent = 'Disconnected';
        }
    }

    // Modal Functions
    showWinnerModal() {
        const modal = document.getElementById('winner-modal');
        const winnerText = document.getElementById('winner-text');
        winnerText.textContent = `Player ${this.currentPlayer} Wins!`;
        modal.classList.remove('hidden');
    }

    hideWinnerModal() {
        document.getElementById('winner-modal').classList.add('hidden');
    }

    showHelpModal() {
        document.getElementById('help-modal').classList.remove('hidden');
    }

    hideHelpModal() {
        document.getElementById('help-modal').classList.add('hidden');
    }

    // Utility Functions
    backToMenu() {
        if (this.gameMode === GameMode.ONLINE) {
            this.network.disconnect();
        }
        this.showScreen('menu-screen');
    }

    toggleSound() {
        const enabled = this.soundManager.toggle();
        const soundBtn = document.getElementById('sound-toggle');
        soundBtn.textContent = `Sound: ${enabled ? 'ON' : 'OFF'}`;
    }

    handleOpponentDisconnected() {
        alert('Your opponent has disconnected. Returning to menu...');
        this.backToMenu();
    }
}

// Initialize Game
document.addEventListener('DOMContentLoaded', () => {
    new TicTacToeGame();
});

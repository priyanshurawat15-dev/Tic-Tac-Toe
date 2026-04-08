

const winSound = new Audio("sounds/win.mp3");
const loseSound = new Audio("sounds/lose.mp3");

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

class SoundManager {
    constructor() {
        this.enabled = true;
        this.audioContext = null;
        this.initAudio();
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.log('Audio not supported');
            this.enabled = false;
        }
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) {
            return;
        }

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

class NetworkManager {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerSymbol = null;
        this.isConnected = false;
        this.onMessageCallback = null;
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
        this.connectionPromise = null;
    }

    getHttpBaseUrl() {
        return window.location.origin;
    }

    getServerUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    }

    connect(serverUrl = this.getServerUrl()) {
        if (this.isConnected && this.socket) {
            return Promise.resolve();
        }

        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(serverUrl);

                this.socket.onopen = () => {
                    this.isConnected = true;
                    this.connectionPromise = null;
                    console.log('Connected to server');
                    if (this.onConnectCallback) {
                        this.onConnectCallback();
                    }
                    resolve();
                };

                this.socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (this.onMessageCallback) {
                        this.onMessageCallback(data);
                    }
                };

                this.socket.onclose = () => {
                    this.isConnected = false;
                    this.connectionPromise = null;
                    console.log('Disconnected from server');
                    if (this.onDisconnectCallback) {
                        this.onDisconnectCallback();
                    }
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.isConnected = false;
                    this.connectionPromise = null;
                    reject(new Error('Failed to connect to server'));
                };
            } catch (error) {
                console.error('Failed to connect:', error);
                this.isConnected = false;
                this.connectionPromise = null;
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.isConnected = false;
        this.roomId = null;
        this.playerSymbol = null;
        this.connectionPromise = null;
    }

    send(message) {
        if (this.socket && this.isConnected) {
            this.socket.send(JSON.stringify(message));
        }
    }

    createRoom(playerName) {
        this.roomId = null;
        this.send({ type: 'create_room', playerName });
    }

    joinRoom(roomId, playerName) {
        this.roomId = roomId;
        this.send({ type: 'join_room', roomId, playerName });
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

    async syncState(state) {
        if (!this.roomId) {
            return null;
        }

        const response = await fetch(`${this.getHttpBaseUrl()}/api/room/${this.roomId}/state`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ state })
        });

        if (!response.ok) {
            throw new Error('Failed to sync state');
        }

        return response.json();
    }

    async fetchState(roomId = this.roomId) {
        if (!roomId) {
            return null;
        }

        const response = await fetch(`${this.getHttpBaseUrl()}/api/room/${roomId}/state`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch room state');
        }

        return response.json();
    }
}

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
        this.roomId = null;
        this.playerSymbol = null;
        this.playerName = '';
        this.players = {
            X: 'Player X',
            O: 'Player O'
        };
        this.lastSyncedRevision = 0;
        this.statePollInterval = null;

        this.network = new NetworkManager();
        this.soundManager = new SoundManager();

        this.initializeEventListeners();
        this.setupNetworkCallbacks();
        this.updateConnectionStatus(false);
    }

    initializeEventListeners() {
        document.getElementById('offline-btn').addEventListener('click', () => {
            this.startOfflineGame();
        });

        document.getElementById('online-btn').addEventListener('click', () => {
            this.showOnlineRoomScreen();
        });

        document.getElementById('help-menu-btn').addEventListener('click', () => {
            this.showHelpModal();
        });

        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.resetRoomUI();
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

        document.querySelectorAll('.cell').forEach((cell) => {
            cell.addEventListener('click', (event) => this.handleCellClick(event));
        });

        document.getElementById('room-id-input').addEventListener('input', (event) => {
            event.target.value = event.target.value.toUpperCase();
        });

        document.getElementById('player-name-input').addEventListener('input', (event) => {
            const name = this.normalizeName(event.target.value);
            event.target.value = name;
            if (name) {
                this.setRoomFeedback(`Hi ${name}. You can host a room or join one with a code.`, 'info');
            } else {
                this.setRoomFeedback('Enter your name before creating or joining a room.', 'info');
            }
        });
    }

    setupNetworkCallbacks() {
        this.network.onConnectCallback = () => {
            this.updateConnectionStatus(true);
            this.setRoomFeedback('Connected to the game server.', 'success');
        };

        this.network.onDisconnectCallback = () => {
            this.updateConnectionStatus(false);
            if (this.gameMode !== GameMode.ONLINE) {
                this.setRoomFeedback('Disconnected from the server.', 'error');
            }
        };

        this.network.onMessageCallback = (data) => {
            this.handleNetworkMessage(data);
        };
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach((screen) => {
            screen.classList.remove('active');
        });

        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    }

    handleNetworkMessage(data) {
        switch (data.type) {
            case 'room_created':
                this.handleRoomCreated(data.roomId);
                break;
            case 'room_joined':
                this.handleRoomJoined(data.roomId, data.playerSymbol, data.players);
                break;
            case 'game_start':
                this.handleGameStart(data.playerSymbol, data.players, data.state);
                break;
            case 'move_made':
                this.handleOpponentMove(data.move);
                break;
            case 'game_restart':
                this.handleGameRestart(data.state);
                break;
            case 'state_sync':
                this.handleStateSync(data.state, data.players);
                break;
            case 'opponent_disconnected':
                this.handleOpponentDisconnected();
                break;
            case 'error':
                this.handleServerError(data.message);
                break;
        }
    }

    startOfflineGame() {
        this.gameMode = GameMode.OFFLINE;
        this.playerSymbol = null;
        this.stopStatePolling();
        this.lastSyncedRevision = 0;
        this.players = {
            X: 'Player X',
            O: 'Player O'
        };
        this.resetGame();
        this.showScreen('game-screen');
        this.updateGameModeDisplay();
    }

    showOnlineRoomScreen() {
        this.showScreen('room-screen');
        this.setRoomFeedback('Enter your name before creating or joining a room.', 'info');
    }

    normalizeName(name) {
        return name.replace(/\s+/g, ' ').trim().slice(0, 20);
    }

    getPlayerNameInput() {
        return document.getElementById('player-name-input');
    }

    getValidatedPlayerName() {
        const input = this.getPlayerNameInput();
        const name = this.normalizeName(input.value);
        input.value = name;

        if (!name) {
            this.soundManager.playError();
            this.setRoomFeedback('Name is required before you can use online multiplayer.', 'error');
            input.focus();
            return null;
        }

        this.playerName = name;
        return name;
    }

    async createRoom() {
        const playerName = this.getValidatedPlayerName();
        if (!playerName) {
            return;
        }

        this.setRoomFeedback('Connecting and creating your room...', 'info');

        try {
            await this.network.connect();
            this.network.createRoom(playerName);
        } catch (error) {
            this.soundManager.playError();
            this.setRoomFeedback('Failed to connect to server. Please try again.', 'error');
        }
    }

    handleRoomCreated(roomId) {
        this.roomId = roomId;
        this.network.roomId = roomId;
        document.getElementById('generated-room-id').textContent = roomId;
        document.getElementById('room-id-display').classList.remove('hidden');
        document.getElementById('waiting-room-id').textContent = roomId;
        document.getElementById('waiting-player-name').textContent = this.playerName || 'Host';
        document.getElementById('waiting-room').classList.remove('hidden');
        this.setRoomFeedback(`Room ${roomId} created. Share it with your friend.`, 'success');
    }

    async joinRoom() {
        const playerName = this.getValidatedPlayerName();
        if (!playerName) {
            return;
        }

        const roomIdInput = document.getElementById('room-id-input');
        const roomId = roomIdInput.value.trim().toUpperCase();

        if (!roomId) {
            this.soundManager.playError();
            this.setRoomFeedback('Enter a room ID to join your friend.', 'error');
            roomIdInput.focus();
            return;
        }

        this.setRoomFeedback(`Connecting to room ${roomId}...`, 'info');

        try {
            await this.network.connect();
            this.network.joinRoom(roomId, playerName);
        } catch (error) {
            this.soundManager.playError();
            this.setRoomFeedback('Failed to connect to server. Please try again.', 'error');
        }
    }

    handleRoomJoined(roomId, playerSymbol, players = this.players) {
        this.roomId = roomId;
        this.playerSymbol = playerSymbol;
        this.network.roomId = roomId;
        this.network.playerSymbol = playerSymbol;
        this.players = { ...this.players, ...players };
        document.getElementById('waiting-room-id').textContent = roomId;
        document.getElementById('waiting-player-name').textContent = this.playerName || this.players[playerSymbol] || 'Player';
        document.getElementById('waiting-room').classList.remove('hidden');
        this.setRoomFeedback(`Joined room ${roomId}. Starting match...`, 'success');
    }

    handleGameStart(playerSymbol, players = this.players, state = null) {
        this.playerSymbol = playerSymbol;
        this.network.playerSymbol = playerSymbol;
        this.players = { ...this.players, ...players };
        this.gameMode = GameMode.ONLINE;
        this.resetGame();
        if (state) {
            this.applyServerState(state);
        }
        this.showScreen('game-screen');
        this.updateGameModeDisplay();
        document.getElementById('waiting-room').classList.add('hidden');
        document.getElementById('room-id-display').classList.add('hidden');
        this.startStatePolling();
    }

    handleServerError(message) {
        this.soundManager.playError();
        this.setRoomFeedback(message || 'Something went wrong on the server.', 'error');
    }

    copyRoomId() {
        const roomId = document.getElementById('generated-room-id').textContent;
        navigator.clipboard.writeText(roomId).then(() => {
            const button = document.getElementById('copy-room-btn');
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    }

    leaveRoom() {
        this.stopStatePolling();
        this.network.disconnect();
        this.gameMode = GameMode.OFFLINE;
        this.roomId = null;
        this.playerSymbol = null;
        this.lastSyncedRevision = 0;
        this.resetRoomUI();
        this.showScreen('menu-screen');
    }

    resetRoomUI() {
        document.getElementById('waiting-room').classList.add('hidden');
        document.getElementById('room-id-display').classList.add('hidden');
        document.getElementById('room-id-input').value = '';
        document.getElementById('generated-room-id').textContent = '';
        document.getElementById('waiting-room-id').textContent = '';
        document.getElementById('waiting-player-name').textContent = '';
        this.setRoomFeedback('Enter your name before creating or joining a room.', 'info');
    }

    setRoomFeedback(message, tone = 'info') {
        const feedback = document.getElementById('room-feedback');
        feedback.textContent = message;
        feedback.dataset.tone = tone;
    }

    handleCellClick(event) {
        if (this.gameOver) {
            return;
        }

        if (this.gameMode === GameMode.ONLINE && this.currentPlayer !== this.playerSymbol) {
            this.soundManager.playError();
            return;
        }

        const cell = event.target;
        const row = Number.parseInt(cell.dataset.row, 10);
        const col = Number.parseInt(cell.dataset.col, 10);

        if (this.phase === GamePhase.PLACEMENT) {
            this.handlePlacement(row, col, cell);
            return;
        }

        this.handleMovement(row, col, cell);
    }

    handlePlacement(row, col, cell) {
        if (this.board[row][col] !== null) {
            this.soundManager.playError();
            return;
        }

        const movingPlayer = this.currentPlayer;
        const currentPieces = movingPlayer === Player.X ? this.player1Pieces : this.player2Pieces;

        if (currentPieces >= 3) {
            this.soundManager.playError();
            return;
        }

        this.board[row][col] = movingPlayer;
        cell.textContent = movingPlayer;
        cell.classList.add('occupied', `${movingPlayer.toLowerCase()}-piece`);

        this.soundManager.playPlace();

        if (movingPlayer === Player.X) {
            this.player1Pieces += 1;
        } else {
            this.player2Pieces += 1;
        }

        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        if (this.player1Pieces === 3 && this.player2Pieces === 3) {
            this.phase = GamePhase.MOVEMENT;
        }

        this.currentPlayer = movingPlayer === Player.X ? Player.O : Player.X;

        if (this.gameMode === GameMode.ONLINE) {
            this.network.makeMove({
                type: 'place',
                row,
                col,
                player: movingPlayer,
                nextPlayer: this.currentPlayer,
                phase: this.phase,
                player1Pieces: this.player1Pieces,
                player2Pieces: this.player2Pieces
            });
            this.pushStateSync();
        }

        this.updateUI();
    }

    handleMovement(row, col, cell) {
        if (this.selectedPiece === null) {
            if (this.board[row][col] === this.currentPlayer) {
                this.selectPiece(row, col, cell);
                this.soundManager.playMove();
            }
            return;
        }

        if (this.board[row][col] === this.currentPlayer) {
            this.deselectPiece();
            this.selectPiece(row, col, cell);
            this.soundManager.playMove();
            return;
        }

        if (this.board[row][col] === null && this.isValidMove(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
            this.movePiece(row, col, cell);
            return;
        }

        this.deselectPiece();
        this.soundManager.playError();
    }

    selectPiece(row, col, cell) {
        this.selectedPiece = { row, col, cell };
        cell.classList.add('selected');
        this.highlightValidMoves(row, col);
    }

    deselectPiece() {
        if (!this.selectedPiece) {
            return;
        }

        this.selectedPiece.cell.classList.remove('selected');
        this.clearValidMoveHighlights();
        this.selectedPiece = null;
    }

    highlightValidMoves(row, col) {
        this.getValidMoves(row, col).forEach((move) => {
            const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            cell.classList.add('valid-move');
        });
    }

    clearValidMoveHighlights() {
        document.querySelectorAll('.valid-move').forEach((cell) => {
            cell.classList.remove('valid-move');
        });
    }

    getValidMoves(row, col) {
        const moves = [];
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
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
        return this.getValidMoves(fromRow, fromCol).some((move) => move.row === toRow && move.col === toCol);
    }

    movePiece(newRow, newCol, newCell) {
        const { row: oldRow, col: oldCol, cell: oldCell } = this.selectedPiece;
        const movingPlayer = this.currentPlayer;

        this.board[newRow][newCol] = movingPlayer;
        this.board[oldRow][oldCol] = null;

        newCell.textContent = movingPlayer;
        newCell.classList.add('occupied', `${movingPlayer.toLowerCase()}-piece`);

        oldCell.textContent = '';
        oldCell.classList.remove('occupied', 'x-piece', 'o-piece');

        this.soundManager.playMove();
        this.deselectPiece();

        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        this.currentPlayer = movingPlayer === Player.X ? Player.O : Player.X;

        if (this.gameMode === GameMode.ONLINE) {
            this.network.makeMove({
                type: 'move',
                from: { row: oldRow, col: oldCol },
                to: { row: newRow, col: newCol },
                player: movingPlayer,
                nextPlayer: this.currentPlayer,
                phase: this.phase
            });
            this.pushStateSync();
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
            this.currentPlayer = move.nextPlayer;
        } else if (move.type === 'move') {
            const fromCell = document.querySelector(`[data-row="${move.from.row}"][data-col="${move.from.col}"]`);
            const toCell = document.querySelector(`[data-row="${move.to.row}"][data-col="${move.to.col}"]`);

            this.board[move.from.row][move.from.col] = null;
            this.board[move.to.row][move.to.col] = move.player;

            fromCell.textContent = '';
            fromCell.classList.remove('occupied', 'x-piece', 'o-piece');

            toCell.textContent = move.player;
            toCell.classList.add('occupied', `${move.player.toLowerCase()}-piece`);

            this.phase = move.phase;
            this.currentPlayer = move.nextPlayer;
        }

        this.soundManager.playMove();
        this.updateUI();

        if (this.checkWinner()) {
            this.endGame();
        }
    }

    checkWinner() {
        const lines = [
            [[0, 0], [0, 1], [0, 2]],
            [[1, 0], [1, 1], [1, 2]],
            [[2, 0], [2, 1], [2, 2]],
            [[0, 0], [1, 0], [2, 0]],
            [[0, 1], [1, 1], [2, 1]],
            [[0, 2], [1, 2], [2, 2]],
            [[0, 0], [1, 1], [2, 2]],
            [[0, 2], [1, 1], [2, 0]]
        ];

        for (const line of lines) {
            const [a, b, c] = line;
            if (
                this.board[a[0]][a[1]] &&
                this.board[a[0]][a[1]] === this.board[b[0]][b[1]] &&
                this.board[a[0]][a[1]] === this.board[c[0]][c[1]]
            ) {
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


        
        if (this.gameMode === "offline") {
  // simple logic: X jeeta to O hara
  if (this.currentPlayer === "X") {
    winSound.play();
  } else {
    loseSound.play();
  }
} else {
  // online me check karo player ka symbol
  if (this.currentPlayer === this.playerSymbol) {
    winSound.play();
  } else {
    loseSound.play();
  }
}



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

    handleGameRestart(state = null) {
        this.resetGame();
        if (state) {
            this.applyServerState(state);
        }
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

        document.querySelectorAll('.cell').forEach((cell) => {
            cell.textContent = '';
            cell.classList.remove('occupied', 'x-piece', 'o-piece', 'selected', 'valid-move', 'winning');
        });

        this.updateUI();
    }

    getSerializableState() {
        return {
            board: this.board.map((row) => [...row]),
            currentPlayer: this.currentPlayer,
            phase: this.phase,
            player1Pieces: this.player1Pieces,
            player2Pieces: this.player2Pieces,
            gameOver: this.gameOver,
            winningLine: this.winningLine.map((line) => [...line])
        };
    }

    applyServerState(state) {
        if (!state || !Array.isArray(state.board)) {
            return;
        }

        this.board = state.board.map((row) => [...row]);
        this.currentPlayer = state.currentPlayer;
        this.phase = state.phase;
        this.player1Pieces = state.player1Pieces;
        this.player2Pieces = state.player2Pieces;
        this.gameOver = Boolean(state.gameOver);
        this.winningLine = Array.isArray(state.winningLine) ? state.winningLine.map((line) => [...line]) : [];
        this.lastSyncedRevision = Math.max(this.lastSyncedRevision, state.revision || 0);
        this.selectedPiece = null;
        this.renderBoard();
        this.updateUI();

        if (this.gameOver && this.winningLine.length > 0) {
            this.highlightWinningLine();
        }
    }

    renderBoard() {
        document.querySelectorAll('.cell').forEach((cell) => {
            const row = Number.parseInt(cell.dataset.row, 10);
            const col = Number.parseInt(cell.dataset.col, 10);
            const value = this.board[row][col];

            cell.textContent = value || '';
            cell.classList.remove('occupied', 'x-piece', 'o-piece', 'selected', 'valid-move', 'winning');

            if (value) {
                cell.classList.add('occupied', `${value.toLowerCase()}-piece`);
            }
        });
    }

    async pushStateSync() {
        try {
            const result = await this.network.syncState(this.getSerializableState());
            if (result?.revision) {
                this.lastSyncedRevision = result.revision;
            }
        } catch (error) {
            console.error('State sync failed', error);
        }
    }

    async pollLatestState() {
        if (this.gameMode !== GameMode.ONLINE || !this.roomId) {
            return;
        }

        try {
            const payload = await this.network.fetchState(this.roomId);
            if (!payload?.state) {
                return;
            }

            this.players = { ...this.players, ...(payload.players || {}) };

            if ((payload.state.revision || 0) > this.lastSyncedRevision) {
                this.applyServerState(payload.state);
            }
        } catch (error) {
            console.error('State poll failed', error);
        }
    }

    startStatePolling() {
        this.stopStatePolling();
        this.pollLatestState();
        this.statePollInterval = window.setInterval(() => {
            this.pollLatestState();
        }, 1200);
    }

    stopStatePolling() {
        if (this.statePollInterval) {
            window.clearInterval(this.statePollInterval);
            this.statePollInterval = null;
        }
    }

    handleStateSync(state, players = null) {
        if (players) {
            this.players = { ...this.players, ...players };
        }

        if ((state?.revision || 0) > this.lastSyncedRevision) {
            this.applyServerState(state);
        }
    }

    updateUI() {
        const currentPlayerElement = document.getElementById('current-player');
        const phaseIndicatorElement = document.getElementById('phase-indicator');
        const xPiecesElement = document.getElementById('x-pieces');
        const oPiecesElement = document.getElementById('o-pieces');

        const currentPlayerName = this.players[this.currentPlayer] || `Player ${this.currentPlayer}`;
        currentPlayerElement.textContent = `${currentPlayerName}'s Turn`;
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
            const displayName = this.players[this.playerSymbol] || this.playerName || 'You';
            gameModeElement.textContent = `${displayName} (${this.playerSymbol})`;
            document.getElementById('connection-status').classList.remove('hidden');
            return;
        }

        gameModeElement.textContent = 'Local Game';
        document.getElementById('connection-status').classList.add('hidden');
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        const statusDot = statusElement.querySelector('.status-dot');
        const statusText = statusElement.querySelector('.status-text');

        if (connected) {
            statusDot.style.background = 'var(--success-color)';
            statusText.textContent = 'Connected';
            return;
        }

        statusDot.style.background = 'var(--danger-color)';
        statusText.textContent = 'Disconnected';
    }

    showWinnerModal() {
        const modal = document.getElementById('winner-modal');
        const winnerText = document.getElementById('winner-text');
        const winnerName = this.players[this.currentPlayer] || `Player ${this.currentPlayer}`;
        winnerText.textContent = `${winnerName} Wins!`;
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

    backToMenu() {
        if (this.gameMode === GameMode.ONLINE) {
            this.stopStatePolling();
            this.network.disconnect();
        }

        this.gameMode = GameMode.OFFLINE;
        this.roomId = null;
        this.playerSymbol = null;
        this.lastSyncedRevision = 0;
        this.players = {
            X: 'Player X',
            O: 'Player O'
        };
        this.resetRoomUI();
        this.showScreen('menu-screen');
    }

    toggleSound() {
        const enabled = this.soundManager.toggle();
        document.getElementById('sound-toggle').textContent = `Sound: ${enabled ? 'ON' : 'OFF'}`;
    }

    handleOpponentDisconnected() {
        alert('Your opponent has disconnected. Returning to menu...');
        this.backToMenu();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TicTacToeGame();
});

const themeBtn = document.querySelector(".theme-btn");
const themeLabel = document.querySelector(".theme-label");

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");

  if (document.body.classList.contains("light-mode")) {
    themeLabel.textContent = "Light Mode";
  } else {
    themeLabel.textContent = "Dark Mode";
  }
});
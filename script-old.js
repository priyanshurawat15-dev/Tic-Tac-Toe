class TicTacToeGame {
    constructor() {
        this.board = Array(3).fill(null).map(() => Array(3).fill(null));
        this.currentPlayer = 'X';
        this.phase = 'placement';
        this.player1Pieces = 0;
        this.player2Pieces = 0;
        this.selectedPiece = null;
        this.gameOver = false;
        this.winningLine = [];
        
        this.initializeEventListeners();
        this.updateUI();
    }

    initializeEventListeners() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.addEventListener('click', (e) => this.handleCellClick(e));
        });

        document.getElementById('restart-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('modal-restart-btn').addEventListener('click', () => {
            this.hideWinnerModal();
            this.resetGame();
        });
        document.getElementById('help-btn').addEventListener('click', () => this.showHelpModal());
        document.getElementById('close-help-btn').addEventListener('click', () => this.hideHelpModal());
    }

    handleCellClick(event) {
        if (this.gameOver) return;

        const cell = event.target;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        if (this.phase === 'placement') {
            this.handlePlacement(row, col, cell);
        } else if (this.phase === 'movement') {
            this.handleMovement(row, col, cell);
        }
    }

    handlePlacement(row, col, cell) {
        if (this.board[row][col] !== null) return;

        const maxPieces = 3;
        const currentPieces = this.currentPlayer === 'X' ? this.player1Pieces : this.player2Pieces;
        
        if (currentPieces >= maxPieces) {
            this.showMessage('Maximum pieces placed! Moving to movement phase.');
            return;
        }

        this.board[row][col] = this.currentPlayer;
        cell.textContent = this.currentPlayer;
        cell.classList.add('occupied', `${this.currentPlayer.toLowerCase()}-piece`);

        if (this.currentPlayer === 'X') {
            this.player1Pieces++;
        } else {
            this.player2Pieces++;
        }

        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        if (this.player1Pieces === 3 && this.player2Pieces === 3) {
            this.phase = 'movement';
            this.showMessage('Movement phase started! Click a piece to select it.');
        } else {
            this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        }

        this.updateUI();
    }

    handleMovement(row, col, cell) {
        if (this.selectedPiece === null) {
            if (this.board[row][col] === this.currentPlayer) {
                this.selectPiece(row, col, cell);
            }
        } else {
            if (this.board[row][col] === this.currentPlayer) {
                this.deselectPiece();
                this.selectPiece(row, col, cell);
            } else if (this.board[row][col] === null && this.isValidMove(this.selectedPiece.row, this.selectedPiece.col, row, col)) {
                this.movePiece(row, col, cell);
            } else {
                this.deselectPiece();
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
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1] // up, down, left, right
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

        this.board[newRow][newCol] = this.currentPlayer;
        this.board[oldRow][oldCol] = null;

        newCell.textContent = this.currentPlayer;
        newCell.classList.add('occupied', `${this.currentPlayer.toLowerCase()}-piece`);

        oldCell.textContent = '';
        oldCell.classList.remove('occupied', 'x-piece', 'o-piece');

        this.deselectPiece();

        if (this.checkWinner()) {
            this.endGame();
            return;
        }

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateUI();
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
        setTimeout(() => {
            this.showWinnerModal();
        }, 500);
    }

    highlightWinningLine() {
        this.winningLine.forEach(([row, col]) => {
            const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            cell.classList.add('winning');
        });
    }

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

    showMessage(message) {
        console.log(message);
    }

    updateUI() {
        const currentPlayerElement = document.getElementById('current-player');
        const phaseIndicatorElement = document.getElementById('phase-indicator');
        const xPiecesElement = document.getElementById('x-pieces');
        const oPiecesElement = document.getElementById('o-pieces');

        currentPlayerElement.textContent = `Player ${this.currentPlayer}'s Turn`;
        phaseIndicatorElement.textContent = this.phase === 'placement' ? 'Placement Phase' : 'Movement Phase';
        xPiecesElement.textContent = `${this.player1Pieces}/3`;
        oPiecesElement.textContent = `${this.player2Pieces}/3`;

        if (this.phase === 'movement') {
            currentPlayerElement.textContent += ' (Select a piece to move)';
        }
    }

    resetGame() {
        this.board = Array(3).fill(null).map(() => Array(3).fill(null));
        this.currentPlayer = 'X';
        this.phase = 'placement';
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
}

document.addEventListener('DOMContentLoaded', () => {
    new TicTacToeGame();
});

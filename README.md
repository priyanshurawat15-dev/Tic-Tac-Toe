# Strategic Tic-Tac-Toe

A modern Tic-Tac-Toe variant with strategic movement and online multiplayer support.

## Game Rules

### Phase 1: Placement
- Each player places exactly 3 pieces on the board
- Players take turns (X goes first)
- Total pieces after this phase: 3 X and 3 O

### Phase 2: Movement
- Players must move one existing piece each turn
- **Movement includes ALL 8 directions**: up, down, left, right, and all 4 diagonals
- Can only move to adjacent empty cells
- No skipping turns allowed

### Winning
- First player to get 3 pieces in a row (horizontal, vertical, or diagonal) wins

## Features

- **Local Mode**: Play on the same device
- **Online Multiplayer**: Real-time gameplay over internet
- **Modern UI**: Beautiful, responsive design with smooth animations
- **Sound Effects**: Toggle-able audio feedback
- **Room System**: Create/join rooms with unique IDs

## How to Run

### Option 1: Play Offline (No Setup Required)
1. Open `index.html` in your browser
2. Click "Local Game" to play offline

### Option 2: Full Online Multiplayer
1. Install Node.js (if not already installed)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and go to `http://localhost:3000`
5. Two players can now play online!

## Online Multiplayer Setup

1. **Create Room**: Player 1 clicks "Online Multiplayer" then "Create New Room"
2. **Share ID**: Copy the 6-digit room ID and share with Player 2
3. **Join Room**: Player 2 enters the room ID and clicks "Join Room"
4. **Play**: Game starts automatically when both players are connected

## Controls

- **Placement Phase**: Click empty cells to place pieces
- **Movement Phase**: 
  - Click your piece to select it (highlighted in orange)
  - Click a highlighted green cell to move there
- **Restart**: Click "Restart" button to start a new game

## Technical Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js with WebSocket (ws library)
- **Styling**: Modern CSS with gradients, animations, and responsive design
- **Audio**: Web Audio API for sound effects

## File Structure

```
Tic-Tac-Toe/
|-- index.html          # Main game interface
|-- style.css           # Modern styling and animations
|-- script.js           # Complete game logic and networking
|-- server.js           # WebSocket server for multiplayer
|-- package.json        # Node.js dependencies
|-- README.md           # This file
```

## Game Architecture

### Frontend Components
- **Game Engine**: Core game logic, rules, and state management
- **Network Manager**: WebSocket communication for online play
- **UI Manager**: Screen transitions, animations, and user feedback
- **Sound Manager**: Audio effects using Web Audio API

### Backend Components
- **WebSocket Server**: Real-time bidirectional communication
- **Room System**: Manages active game rooms and player connections
- **Message Router**: Handles game state synchronization

### Game States
- **Menu Screen**: Choose between local and online play
- **Room Screen**: Create or join multiplayer rooms
- **Game Screen**: Main gameplay with board and controls
- **Modals**: Winner announcement and help information

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Mobile Support

The game is fully responsive and works on mobile devices with touch controls.

## Troubleshooting

### Online Mode Not Working
1. Ensure Node.js is installed
2. Run `npm install` to install dependencies
3. Start server with `npm start`
4. Check that port 3000 and 8080 are available

### Connection Issues
1. Check that both players are on the same network (for local testing)
2. Verify the room ID is entered correctly
3. Refresh the page and try reconnecting

### Sound Not Working
1. Click the "Sound: ON/OFF" button to toggle
2. Some browsers require user interaction before playing audio
3. Check that your browser supports Web Audio API

Enjoy playing Strategic Tic-Tac-Toe!

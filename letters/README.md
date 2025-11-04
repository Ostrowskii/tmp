# Letters - Multiplayer Browser Game

A simple multiplayer game demo built with the StateMachine system. Players control letters that move around a 2D space.

## How to Play

### 1. Start the WebSocket Server

From the root directory:
```bash
bun run server
```

### 2. Build the Game

From the root directory:
```bash
bun run letters:build
```

### 3. Start the Game Server

From the root directory:
```bash
bun run letters:serve
```

### 4. Open the Game

Open http://localhost:3000 in your browser. You'll be prompted for:
- Room name (join the same room to play with others)
- Your nickname (must be a single character)

### 4. Controls

- **W** - Move up
- **A** - Move left
- **S** - Move down
- **D** - Move right

## How It Works

- Each player spawns at a random position
- Movement speed: 200 pixels/second
- Game runs at 24 ticks/second
- Players are synchronized across all clients using the StateMachine
- All clients compute the same deterministic game state

## Technical Details

- **State**: Map of character → player position and key states
- **on_tick**: Updates positions based on WASD states
- **on_post**: Handles spawn and key up/down events
- **Tolerance**: 100ms for network lag compensation

Open multiple browser windows/tabs with the same room name to see multiplayer in action!

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: false
});

// Health check endpoint (keeps Render from sleeping + mobile connection check)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', players: countPlayers(), rooms: rooms.size });
});

app.use(express.static(path.join(__dirname, 'public')));

function countPlayers() {
  let count = 0;
  for (const [, room] of rooms) count += room.players.length;
  return count;
}

// ============ GAME CONFIG ============
const COLORS = ['red', 'blue', 'green', 'yellow'];
const CARD_TYPES = {
  NUMBER: 'number',
  SKIP: 'skip',
  REVERSE: 'reverse',
  DRAW2: 'draw2',
  WILD: 'wild',
  WILD_DRAW4: 'wild_draw4'
};

// ============ ROOMS ============
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function createDeck() {
  const deck = [];
  let id = 0;
  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: id++, type: CARD_TYPES.NUMBER, color, value: 0 });
    // Two of each 1-9
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: id++, type: CARD_TYPES.NUMBER, color, value: n });
      deck.push({ id: id++, type: CARD_TYPES.NUMBER, color, value: n });
    }
    // Two skip, reverse, draw2 per color
    for (let i = 0; i < 2; i++) {
      deck.push({ id: id++, type: CARD_TYPES.SKIP, color, value: 'skip' });
      deck.push({ id: id++, type: CARD_TYPES.REVERSE, color, value: 'reverse' });
      deck.push({ id: id++, type: CARD_TYPES.DRAW2, color, value: '+2' });
    }
  }
  // 4 wilds and 4 wild draw4
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, type: CARD_TYPES.WILD, color: null, value: 'wild' });
    deck.push({ id: id++, type: CARD_TYPES.WILD_DRAW4, color: null, value: '+4' });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createRoom(hostId, hostName) {
  const code = generateRoomCode();
  rooms.set(code, {
    code,
    players: [{ id: hostId, name: hostName, hand: [], saidFarbsturm: false }],
    state: 'lobby', // lobby, playing, finished
    deck: [],
    discard: [],
    currentPlayer: 0,
    direction: 1, // 1 = clockwise, -1 = counter
    currentColor: null,
    drawStack: 0, // accumulated +2/+4 cards
    winner: null,
    hostId
  });
  return code;
}

function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

function drawCards(room, count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      // Reshuffle discard pile (keep top card)
      const top = room.discard.pop();
      room.deck = shuffle(room.discard.map(c => {
        // Reset wild card colors
        if (c.type === CARD_TYPES.WILD || c.type === CARD_TYPES.WILD_DRAW4) {
          return { ...c, color: null };
        }
        return c;
      }));
      room.discard = [top];
    }
    if (room.deck.length > 0) {
      cards.push(room.deck.pop());
    }
  }
  return cards;
}

function nextPlayer(room) {
  room.currentPlayer = (room.currentPlayer + room.direction + room.players.length) % room.players.length;
}

function canPlay(card, room) {
  const topCard = room.discard[room.discard.length - 1];

  // If there's an active draw stack, only +2 or +4 can be played
  if (room.drawStack > 0) {
    if (topCard.type === CARD_TYPES.DRAW2 && card.type === CARD_TYPES.DRAW2) return true;
    if (topCard.type === CARD_TYPES.WILD_DRAW4 && card.type === CARD_TYPES.WILD_DRAW4) return true;
    return false;
  }

  // Wild cards always playable
  if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW4) return true;
  // Match color
  if (card.color === room.currentColor) return true;
  // Match value/type
  if (card.type === CARD_TYPES.NUMBER && topCard.type === CARD_TYPES.NUMBER && card.value === topCard.value) return true;
  if (card.type !== CARD_TYPES.NUMBER && card.type === topCard.type) return true;

  return false;
}

function getPlayableCards(player, room) {
  return player.hand.filter(c => canPlay(c, room));
}

function emitGameState(room) {
  for (const p of room.players) {
    const socket = io.sockets.sockets.get(p.id);
    if (!socket) continue;

    socket.emit('gameState', {
      players: room.players.map(pl => ({
        id: pl.id,
        name: pl.name,
        cardCount: pl.hand.length,
        saidFarbsturm: pl.saidFarbsturm,
        isMe: pl.id === p.id
      })),
      myHand: p.hand,
      playableCards: room.state === 'playing' && room.players[room.currentPlayer].id === p.id
        ? getPlayableCards(p, room).map(c => c.id)
        : [],
      topCard: room.discard[room.discard.length - 1],
      currentColor: room.currentColor,
      currentPlayer: room.currentPlayer,
      direction: room.direction,
      drawStack: room.drawStack,
      state: room.state,
      winner: room.winner,
      deckCount: room.deck.length,
      isMyTurn: room.players[room.currentPlayer]?.id === p.id,
      roomCode: room.code
    });
  }
}

function emitLobby(room) {
  for (const p of room.players) {
    const socket = io.sockets.sockets.get(p.id);
    if (socket) {
      socket.emit('lobby', {
        code: room.code,
        players: room.players.map(pl => ({ id: pl.id, name: pl.name })),
        isHost: p.id === room.hostId
      });
    }
  }
}

function startGame(room) {
  room.state = 'playing';
  room.deck = shuffle(createDeck());
  room.discard = [];
  room.currentPlayer = 0;
  room.direction = 1;
  room.drawStack = 0;
  room.winner = null;

  // Deal 7 cards
  for (const p of room.players) {
    p.hand = drawCards(room, 7);
    p.saidFarbsturm = false;
  }

  // First discard (no wild/action as first card)
  let firstCard;
  do {
    firstCard = room.deck.pop();
    if (firstCard.type !== CARD_TYPES.NUMBER) {
      room.deck.unshift(firstCard);
      shuffle(room.deck);
      firstCard = null;
    }
  } while (!firstCard);

  room.discard.push(firstCard);
  room.currentColor = firstCard.color;

  emitGameState(room);
}

// ============ SOCKET EVENTS ============
io.on('connection', (socket) => {
  console.log(`Verbunden: ${socket.id}`);

  socket.on('createRoom', (name, callback) => {
    const code = createRoom(socket.id, name.substring(0, 16));
    socket.join(code);
    callback({ success: true, code });
    emitLobby(getRoom(code));
  });

  socket.on('joinRoom', (data, callback) => {
    const room = getRoom(data.code);
    if (!room) return callback({ success: false, error: 'Raum nicht gefunden!' });
    if (room.state !== 'lobby') return callback({ success: false, error: 'Spiel läuft bereits!' });
    if (room.players.length >= 4) return callback({ success: false, error: 'Raum ist voll! (max. 4)' });
    if (room.players.some(p => p.id === socket.id)) return callback({ success: false, error: 'Du bist bereits im Raum!' });

    room.players.push({ id: socket.id, name: data.name.substring(0, 16), hand: [], saidFarbsturm: false });
    socket.join(room.code);
    callback({ success: true, code: room.code });
    emitLobby(room);
  });

  socket.on('startGame', (code) => {
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit('error', 'Mindestens 2 Spieler nötig!');
      return;
    }
    startGame(room);
  });

  socket.on('playCard', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state !== 'playing') return;

    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx === -1 || playerIdx !== room.currentPlayer) return;

    const player = room.players[playerIdx];
    const cardIdx = player.hand.findIndex(c => c.id === data.cardId);
    if (cardIdx === -1) return;

    const card = player.hand[cardIdx];
    if (!canPlay(card, room)) {
      socket.emit('error', 'Diese Karte kannst du nicht spielen!');
      return;
    }

    // Remove card from hand
    player.hand.splice(cardIdx, 1);

    // Set color for wild cards
    if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW4) {
      if (data.chosenColor && COLORS.includes(data.chosenColor)) {
        card.color = data.chosenColor;
        room.currentColor = data.chosenColor;
      } else {
        room.currentColor = COLORS[0];
      }
    } else {
      room.currentColor = card.color;
    }

    room.discard.push(card);

    // Reset farbsturm flag
    player.saidFarbsturm = false;

    // Broadcast the played card
    io.to(room.code).emit('cardPlayed', {
      playerName: player.name,
      card,
      currentColor: room.currentColor
    });

    // Check win
    if (player.hand.length === 0) {
      room.state = 'finished';
      room.winner = player.name;
      emitGameState(room);
      return;
    }

    // Handle action cards
    switch (card.type) {
      case CARD_TYPES.SKIP:
        nextPlayer(room);
        io.to(room.code).emit('action', {
          type: 'skip',
          target: room.players[(room.currentPlayer + room.direction + room.players.length) % room.players.length]?.name
        });
        nextPlayer(room);
        break;

      case CARD_TYPES.REVERSE:
        if (room.players.length === 2) {
          // In 2-player, reverse acts like skip
          nextPlayer(room);
          nextPlayer(room);
        } else {
          room.direction *= -1;
          nextPlayer(room);
        }
        io.to(room.code).emit('action', { type: 'reverse' });
        break;

      case CARD_TYPES.DRAW2:
        room.drawStack += 2;
        nextPlayer(room);
        break;

      case CARD_TYPES.WILD_DRAW4:
        room.drawStack += 4;
        nextPlayer(room);
        break;

      default:
        nextPlayer(room);
    }

    emitGameState(room);
  });

  socket.on('drawCard', (code) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return;

    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx === -1 || playerIdx !== room.currentPlayer) return;

    const player = room.players[playerIdx];
    const count = room.drawStack > 0 ? room.drawStack : 1;
    const newCards = drawCards(room, count);
    player.hand.push(...newCards);
    room.drawStack = 0;
    player.saidFarbsturm = false;

    io.to(room.code).emit('action', {
      type: 'draw',
      playerName: player.name,
      count
    });

    // If drew 1 card and it's playable, player can still play it
    // Otherwise, move to next player
    if (count === 1 && canPlay(newCards[0], room)) {
      // Player can choose to play the drawn card
      socket.emit('canPlayDrawn', { card: newCards[0] });
    } else {
      nextPlayer(room);
    }

    emitGameState(room);
  });

  socket.on('passAfterDraw', (code) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return;
    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (playerIdx === -1 || playerIdx !== room.currentPlayer) return;
    nextPlayer(room);
    emitGameState(room);
  });

  socket.on('sayFarbsturm', (code) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && player.hand.length <= 2) {
      player.saidFarbsturm = true;
      io.to(room.code).emit('action', {
        type: 'farbsturm',
        playerName: player.name
      });
      emitGameState(room);
    }
  });

  socket.on('challengeFarbsturm', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state !== 'playing') return;
    const target = room.players.find(p => p.id === data.targetId);
    if (target && target.hand.length === 1 && !target.saidFarbsturm) {
      // Penalty: draw 2 cards
      const penalty = drawCards(room, 2);
      target.hand.push(...penalty);
      target.saidFarbsturm = false;
      io.to(room.code).emit('action', {
        type: 'challenge',
        targetName: target.name,
        challengerName: room.players.find(p => p.id === socket.id)?.name
      });
      emitGameState(room);
    }
  });

  socket.on('playAgain', (code) => {
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    room.state = 'lobby';
    room.winner = null;
    emitLobby(room);
  });

  // Keep-alive ping from mobile clients
  socket.on('ping', () => {});

  socket.on('disconnect', () => {
    console.log(`Getrennt: ${socket.id}`);
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      room.players.splice(idx, 1);

      if (room.players.length === 0) {
        rooms.delete(code);
        continue;
      }

      // If host left, reassign
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }

      if (room.state === 'playing') {
        if (room.players.length < 2) {
          room.state = 'finished';
          room.winner = room.players[0]?.name;
        } else {
          if (room.currentPlayer >= room.players.length) {
            room.currentPlayer = 0;
          }
        }
        emitGameState(room);
      } else {
        emitLobby(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎴 Farbsturm Server läuft auf Port ${PORT}`);
  console.log(`   Öffne http://localhost:${PORT} im Browser`);
});

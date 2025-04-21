const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

let players = {};
let words = [];
let usedWords = [];
let scores = { red: 0, blue: 0 };
let currentTeam = 'red';
let explainer = null;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

io.on('connection', (socket) => {
  console.log('🟢 Подключился:', socket.id);

  players[socket.id] = {
    team: null,
    name: "?",
    guessedWords: [],
    skippedWords: [],
    isExplainer: false
  };

  socket.on("setTeam", (team) => {
    if (players[socket.id]) {
      players[socket.id].team = team;
      io.emit("playersUpdate", players);
    }
  });

  socket.on("setName", (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      io.emit("playersUpdate", players);
    }
  });

  socket.on("loadLessons", (selectedLessons) => {
    words = [];
    usedWords = [];
    scores = { red: 0, blue: 0 };
    explainer = null;
    currentTeam = "red";

    for (let id in players) {
      players[id].isExplainer = false;
      players[id].guessedWords = [];
      players[id].skippedWords = [];
    }

    selectedLessons.forEach(filename => {
      const fullPath = path.join(__dirname, "public", "words", filename);
      if (fs.existsSync(fullPath)) {
        const lessonWords = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        words = words.concat(lessonWords);
      }
    });

    shuffle(words);
    io.emit('scoreUpdate', scores);
    io.emit('playersUpdate', players);
    io.emit('turnEnded', currentTeam);
  });

  socket.on('startTurn', () => {
    if (explainer || currentTeam !== players[socket.id].team) return;
    explainer = socket.id;
    players[socket.id].isExplainer = true;

    const word = words.find(w => !usedWords.includes(w));
    if (!word) return endGame();
    usedWords.push(word);

    socket.emit('showWord', word);
    io.emit('turnStarted', { team: currentTeam });
io.emit('wordsLeft', words.length - usedWords.length);

  });

  socket.on('guessed', (isSkip) => {
    if (socket.id !== explainer) return;

    const word = usedWords[usedWords.length - 1];
    if (isSkip) {
      players[socket.id].skippedWords.push(word);
      scores[currentTeam] = Math.max(0, scores[currentTeam] - 1);
    } else {
      players[socket.id].guessedWords.push(word);
      scores[currentTeam]++;
    }

    io.emit('scoreUpdate', scores);

    if (scores[currentTeam] > words.length / 2 || usedWords.length >= words.length) {
      return endGame();
    }

    const nextWord = words.find(w => !usedWords.includes(w));
    if (!nextWord) return endGame();
    usedWords.push(nextWord);
    socket.emit('showWord', nextWord);
io.emit('wordsLeft', words.length - usedWords.length);


  });

  socket.on('endTurn', () => {
    if (socket.id !== explainer) return;
    players[socket.id].isExplainer = false;
    explainer = null;
    currentTeam = currentTeam === 'red' ? 'blue' : 'red';
    io.emit('turnEnded', currentTeam);
  });

  socket.on('restartGame', () => {
    words = [];
    usedWords = [];
    scores = { red: 0, blue: 0 };
    explainer = null;
    currentTeam = "red";
    for (let id in players) {
      players[id].isExplainer = false;
      players[id].guessedWords = [];
      players[id].skippedWords = [];
    }
    io.emit('scoreUpdate', scores);
    io.emit('playersUpdate', players);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Отключился:', socket.id);
    if (socket.id === explainer) explainer = null;
    delete players[socket.id];
    io.emit('playersUpdate', players);
  });

  function endGame() {
    let winner = scores.red > scores.blue ? 'red' : (scores.red < scores.blue ? 'blue' : 'draw');
    io.emit('gameOver', {
      scores,
      winner,
      results: Object.values(players).map(p => ({
        name: p.name,
        team: p.team,
        guessed: p.guessedWords.length,
        skipped: p.skippedWords
      }))
    });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

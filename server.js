const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

let players = {}; // socket.id -> { name, team, guessedWords, skippedWords }
let words = [
  "周末", "打算", "跟", "作业", "复习", "南方", "北方", "面包", "地图", "搬",
  "腿", "疼", "脚", "树", "容易", "难", "秘书", "经理", "办公室", "辆",
  "楼", "把", "伞", "胖", "瘦", "还是", "条", "裤子", "记得", "衬衫",
  "元", "甜", "饮料", "或者", "花", "绿", "比赛", "聪明", "努力", "饿",
  "超市", "蛋糕", "年轻", "客人", "发烧", "照顾", "季节", "春天", "草",
  "夏天", "裙子", "最近", "张"
];
let usedWords = [];
let scores = { red: 0, blue: 0 };
let currentTeam = 'red';
let explainer = null;

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

  

  io.emit('playersUpdate', players);
  io.emit('scoreUpdate', scores);

  socket.on("setName", (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      io.emit("playersUpdate", players);
    }
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

    const nextWord = words.find(w => !usedWords.includes(w));
    if (!nextWord) return endGame();
    usedWords.push(nextWord);
    socket.emit('showWord', nextWord);
  });

  socket.on('endTurn', () => {
    if (socket.id !== explainer) return;
    players[socket.id].isExplainer = false;
    explainer = null;
    currentTeam = currentTeam === 'red' ? 'blue' : 'red';
    io.emit('turnEnded', currentTeam);
  });

  socket.on('restartGame', () => {
    usedWords = [];
    scores = { red: 0, blue: 0 };
    explainer = null;
    currentTeam = 'red';
    for (let id in players) {
      players[id].isExplainer = false;
      players[id].guessedWords = [];
      players[id].skippedWords = [];
    }
    io.emit('scoreUpdate', scores);
    io.emit('playersUpdate', players);
    io.emit('turnEnded', currentTeam);
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

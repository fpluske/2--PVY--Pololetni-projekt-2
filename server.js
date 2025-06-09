const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {}; // { name: { x, y, name } }
const scores = {};  // { name: score }

let gameTimer;
let gameActive = false;

function startGame() {
  gameActive = true;
  gameTimer = setTimeout(() => endGame(), 2 * 60 * 1000); // 2 min
}

function endGame() {
  gameActive = false;
  io.emit("gameOver", scores, players);
  Object.keys(players).forEach(name => delete players[name]);
  Object.keys(scores).forEach(name => delete scores[name]);
}

io.on("connection", socket => {
  socket.on("checkName", (name, cb) => {
    cb(players[name] !== undefined);
  });

  socket.on("register", name => {
    if (players[name]) return;

    players[name] = {
      x: Math.random() * 800 + 100,
      y: Math.random() * 500 + 100,
      name
    };
    scores[name] = 0;
    socket.name = name;

    socket.emit("init", { players, scores });
    socket.broadcast.emit("playerJoined", players[name]);

    if (!gameActive) startGame();
  });

  socket.on("updatePosition", pos => {
    if (!socket.name || !players[socket.name]) return;
    players[socket.name].x = pos.x;
    players[socket.name].y = pos.y;
    socket.broadcast.emit("updatePosition", { name: socket.name, pos });
  });

  socket.on("shoot", bullet => {
    if (!socket.name) return;
    io.emit("shoot", { bullet, name: socket.name });
  });

  socket.on("hit", ({ shooter, target }) => {
    if (!players[target] || !players[shooter]) return;

    if (scores[shooter] !== undefined) {
      scores[shooter]++;
    }
    io.emit("scoreUpdate", scores);
    io.emit("playerHit", target);

    delete players[target];

    setTimeout(() => {
      players[target] = {
        x: Math.random() * 800 + 100,
        y: Math.random() * 500 + 100,
        name: target
      };
      io.emit("respawn", players[target]);
      io.emit("nameUpdate", players);
    }, 3000);
  });

  socket.on("disconnect", () => {
    if (!socket.name) return;

    delete players[socket.name];
    delete scores[socket.name];
    io.emit("playerLeft", socket.name);

    endGame();
  });
});

server.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});

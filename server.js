const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database("leaderboard.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS leaderboard (
    name TEXT PRIMARY KEY,
    score INTEGER
  )
`).run();

app.use(express.static("public"));

app.get("/leaderboard", (req, res) => {
  const rows = db.prepare("SELECT name, score FROM leaderboard ORDER BY score DESC").all();
  res.send(`
    <html>
      <head>
        <title>Leaderboard</title>
        <style>
          body { font-family: sans-serif; background: #111; color: white; padding: 2em; }
          table { width: 50%; margin: auto; border-collapse: collapse; }
          th, td { border: 1px solid #555; padding: 10px; text-align: left; }
          th { background: #222; }
          h1 { text-align: center; }
          a { color: #0f0; display: block; text-align: center; margin-top: 2em; }
        </style>
      </head>
      <body>
        <h1>Skóre hráčů</h1>
        <table>
          <tr><th>Jméno</th><th>Skóre</th></tr>
          ${rows.map(r => `<tr><td>${r.name}</td><td>${r.score}</td></tr>`).join("")}
        </table>
        <a href="/">Zpět do hry</a>
      </body>
    </html>
  `);
});

const players = {}; 
const scores = {};  

let gameTimer = null;
let gameActive = false;

function startGame() {
  if (gameActive) return;
  gameActive = true;
  console.log("Hra spuštěna");
  gameTimer = setTimeout(() => endGame(), 2 * 60 * 1000);
}

function resetGameTimer() {
  if (gameTimer) {
    clearTimeout(gameTimer);
    gameTimer = null;
    gameActive = false;
    console.log("Hra přerušena – čeká se na další hráče");
  }
}

function endGame() {
  console.log("Hra skončila");
  gameActive = false;

  const stmt = db.prepare(`
    INSERT INTO leaderboard (name, score)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET score = MAX(score, excluded.score)
  `);

  Object.entries(scores).forEach(([name, score]) => {
    stmt.run(name, score);
  });

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

    if (Object.keys(players).length >= 2) startGame();
  });

  socket.on("updatePosition", pos => {
    const player = players[socket.name];
    if (!player) return;

    player.x = Math.max(15, Math.min(pos.x, 1920 - 15));
    player.y = Math.max(15, Math.min(pos.y, 1080 - 15));

    socket.broadcast.emit("updatePosition", {
      name: socket.name,
      pos: { x: player.x, y: player.y }
    });
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

    if (Object.keys(players).length < 2) {
      resetGameTimer();
    }
  });
});

server.listen(3000, () => {
  console.log("Server běží na: http://localhost:3000");
});

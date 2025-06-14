const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const scoreboard = document.getElementById("scoreboard");
const gameOverScreen = document.getElementById("gameOverScreen");
const nameInputScreen = document.getElementById("nameInputScreen");
const nameInput = document.getElementById("nameInput");
const startBtn = document.getElementById("startBtn");

let myName = "";
let players = {};
let scores = {};
let bullets = [];
let gameActive = true;

const speed = 5;
const bulletSpeed = 10;
const bulletRadius = 5;

const keys = {};

startBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return;
  socket.emit("checkName", name, isTaken => {
    if (isTaken) {
      alert("Toto jméno je již obsazeno. Zvol jiné.");
    } else {
      myName = name;
      nameInputScreen.classList.add("hidden");
      canvas.classList.remove("hidden");
      socket.emit("register", myName);
    }
  });
});

socket.on("init", data => {
  players = data.players;
  scores = data.scores;
});

socket.on("playerJoined", player => {
  players[player.name] = { x: player.x, y: player.y, name: player.name };
});

socket.on("updatePosition", data => {
  if (players[data.name]) {
    players[data.name].x = data.pos.x;
    players[data.name].y = data.pos.y;
  }
});

socket.on("shoot", data => {
  const shooter = players[data.name];
  if (!shooter) return;
  bullets.push({
    x: data.bullet.x,
    y: data.bullet.y,
    dx: data.bullet.dx,
    dy: data.bullet.dy,
    owner: data.name
  });
});

socket.on("playerHit", name => {
  delete players[name];
});

socket.on("respawn", data => {
  players[data.name] = { x: data.x, y: data.y, name: data.name };
});

socket.on("playerLeft", name => {
  delete players[name];
  delete scores[name];
});

socket.on("scoreUpdate", newScores => {
  scores = newScores;
});

socket.on("nameUpdate", updatedPlayers => {
  players = updatedPlayers;
});

socket.on("gameOver", (finalScores, finalPlayers) => {
  gameActive = false;
  canvas.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  const sorted = Object.entries(finalScores).sort((a, b) => b[1] - a[1]);
  gameOverScreen.innerHTML = `<h2>Výsledky:</h2>` +
    sorted.map(([name, score]) => {
      return `<div>${name}: ${score}</div>`;
    }).join("");
});

function update() {
  if (!gameActive) return;

  const me = players[myName];
  if (!me) return;

  const newX = me.x + (keys["ArrowRight"] || keys["d"] ? speed : 0) - (keys["ArrowLeft"] || keys["a"] ? speed : 0);
  const newY = me.y + (keys["ArrowDown"] || keys["s"] ? speed : 0) - (keys["ArrowUp"] || keys["w"] ? speed : 0);

  // Omez hráče na velikost canvasu
  me.x = Math.max(15, Math.min(canvas.width - 15, newX));
  me.y = Math.max(15, Math.min(canvas.height - 15, newY));

  socket.emit("updatePosition", { x: me.x, y: me.y });
}


function render() {
  if (!gameActive) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Hráči
  for (const name in players) {
    const p = players[name];
    ctx.fillStyle = name === myName ? "lime" : "white";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.x, p.y - 20);
  }

  // Kulky
  ctx.fillStyle = "red";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, bulletRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scoreboard
  scoreboard.innerHTML = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([name, score]) => `${name}: ${score}`)
    .join("<br>");
}

function loop() {
  update();
  render();

  if (gameActive) {
    for (const b of bullets) {
      b.x += b.dx * bulletSpeed;
      b.y += b.dy * bulletSpeed;

      for (const name in players) {
        if (name === b.owner) continue;
        const p = players[name];
        const dist = Math.hypot(p.x - b.x, p.y - b.y);
        if (dist < 15) {
          socket.emit("hit", { shooter: b.owner, target: name });
          bullets = bullets.filter(bb => bb !== b);
          break;
        }
      }
    }

    bullets = bullets.filter(b => b.x >= 0 && b.x <= canvas.width && b.y >= 0 && b.y <= canvas.height);
  }

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

window.addEventListener("click", e => {
  if (!gameActive) return;

  const me = players[myName];
  if (!me) return;

  const dxRaw = e.clientX - me.x;
  const dyRaw = e.clientY - me.y;
  const length = Math.hypot(dxRaw, dyRaw);
  const dx = dxRaw / length;
  const dy = dyRaw / length;

  const bullet = {
    x: me.x,
    y: me.y,
    dx,
    dy
  };

  bullets.push({ ...bullet, owner: myName });
  socket.emit("shoot", bullet);
});


// Responzivní plátno
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

loop();

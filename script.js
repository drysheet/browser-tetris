const COLS = 10;
const ROWS = 20;
const CELL_SIZE = 30;
const PREVIEW_CELL = 24;
const BASE_DROP_INTERVAL = 900;
const MIN_DROP_INTERVAL = 120;
const LEVEL_STEP = 1000;
const SCORE_TABLE = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

const TETROMINOES = {
  I: {
    color: "#39d5ff",
    matrix: [[1, 1, 1, 1]],
  },
  O: {
    color: "#ffd84d",
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  T: {
    color: "#c77dff",
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  },
  S: {
    color: "#4ade80",
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  },
  Z: {
    color: "#ff6b6b",
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  },
  J: {
    color: "#60a5fa",
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  L: {
    color: "#fb923c",
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  },
};

class Piece {
  constructor(type) {
    const definition = TETROMINOES[type];
    this.type = type;
    this.color = definition.color;
    this.matrix = definition.matrix.map((row) => [...row]);
    this.x = Math.floor((COLS - this.matrix[0].length) / 2);
    this.y = 0;
  }

  clone() {
    const clone = new Piece(this.type);
    clone.color = this.color;
    clone.matrix = this.matrix.map((row) => [...row]);
    clone.x = this.x;
    clone.y = this.y;
    return clone;
  }

  rotate() {
    const rotated = this.matrix[0].map((_, index) =>
      this.matrix.map((row) => row[index]).reverse(),
    );
    this.matrix = rotated;
  }
}

class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => null),
    );
  }

  collides(piece) {
    return piece.matrix.some((row, y) =>
      row.some((value, x) => {
        if (!value) {
          return false;
        }

        const boardX = piece.x + x;
        const boardY = piece.y + y;

        return (
          boardX < 0 ||
          boardX >= this.cols ||
          boardY >= this.rows ||
          (boardY >= 0 && this.grid[boardY][boardX])
        );
      }),
    );
  }

  merge(piece) {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const boardY = piece.y + y;
        if (boardY >= 0) {
          this.grid[boardY][piece.x + x] = piece.color;
        }
      });
    });
  }

  findFullRows() {
    const rows = [];
    this.grid.forEach((row, index) => {
      if (row.every(Boolean)) {
        rows.push(index);
      }
    });
    return rows;
  }

  clearRows(rows) {
    rows
      .slice()
      .sort((a, b) => a - b)
      .forEach((rowIndex) => {
        this.grid.splice(rowIndex, 1);
        this.grid.unshift(Array.from({ length: this.cols }, () => null));
      });
  }
}

class TetrisGame {
  constructor() {
    this.boardCanvas = document.getElementById("game-board");
    this.boardContext = this.boardCanvas.getContext("2d");
    this.previewCanvas = document.getElementById("next-piece");
    this.previewContext = this.previewCanvas.getContext("2d");

    this.scoreElement = document.getElementById("score");
    this.levelElement = document.getElementById("level");
    this.linesElement = document.getElementById("lines");
    this.startPauseButton = document.getElementById("start-pause-button");
    this.restartButton = document.getElementById("restart-button");
    this.overlay = document.getElementById("message-overlay");
    this.overlayTitle = document.getElementById("overlay-title");
    this.overlayText = document.getElementById("overlay-text");

    this.board = new Board(ROWS, COLS);
    this.lastTime = 0;
    this.dropAccumulator = 0;
    this.lockDelay = null;

    this.bindEvents();
    this.reset();
    requestAnimationFrame((time) => this.loop(time));
  }

  bindEvents() {
    this.startPauseButton.addEventListener("click", () => {
      if (this.gameOver) {
        this.restart();
        return;
      }

      if (!this.started) {
        this.start();
        return;
      }

      this.togglePause();
    });

    this.restartButton.addEventListener("click", () => this.restart());

    window.addEventListener("keydown", (event) => this.handleInput(event));
  }

  reset() {
    this.board.reset();
    this.score = 0;
    this.level = 1;
    this.linesCleared = 0;
    this.started = false;
    this.paused = false;
    this.gameOver = false;
    this.dropAccumulator = 0;
    this.lastTime = 0;
    this.lockDelay = null;
    this.flashRows = [];
    this.flashUntil = 0;
    this.turnLocked = false;
    this.bag = [];
    this.currentPiece = this.createRandomPiece();
    this.nextPiece = this.createRandomPiece();
    this.updateScoreboard();
    this.updateOverlay("Tetris", "Press Start to play.", true);
    this.startPauseButton.textContent = "Start";
    this.render();
  }

  restart() {
    this.reset();
    this.start();
  }

  start() {
    this.started = true;
    this.paused = false;
    this.gameOver = false;
    this.updateOverlay("", "", false);
    this.startPauseButton.textContent = "Pause";
  }

  togglePause() {
    this.paused = !this.paused;
    this.updateOverlay(
      "Paused",
      "Press Start to continue the game.",
      this.paused,
    );
    this.startPauseButton.textContent = this.paused ? "Resume" : "Pause";
  }

  createBag() {
    const types = Object.keys(TETROMINOES);
    for (let index = types.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [types[index], types[randomIndex]] = [types[randomIndex], types[index]];
    }
    return types;
  }

  createRandomPiece() {
    if (!this.bag.length) {
      this.bag = this.createBag();
    }
    return new Piece(this.bag.pop());
  }

  getDropInterval() {
    return Math.max(
      MIN_DROP_INTERVAL,
      BASE_DROP_INTERVAL - (this.level - 1) * 60,
    );
  }

  handleInput(event) {
    const handledKeys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowDown",
      "ArrowUp",
      " ",
      "Spacebar",
    ];

    if (!handledKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();

    if (
      !this.started ||
      this.paused ||
      this.gameOver ||
      this.flashRows.length ||
      this.turnLocked
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      this.tryMove(-1, 0);
      return;
    }

    if (event.key === "ArrowRight") {
      this.tryMove(1, 0);
      return;
    }

    if (event.key === "ArrowDown") {
      this.stepDown(true);
      return;
    }

    this.tryRotate();
  }

  tryMove(offsetX, offsetY) {
    const testPiece = this.currentPiece.clone();
    testPiece.x += offsetX;
    testPiece.y += offsetY;
    if (!this.board.collides(testPiece)) {
      this.currentPiece = testPiece;
      return true;
    }
    return false;
  }

  tryRotate() {
    const testPiece = this.currentPiece.clone();
    testPiece.rotate();
    const kicks = [0, -1, 1, -2, 2];

    for (const offset of kicks) {
      testPiece.x = this.currentPiece.x + offset;
      if (!this.board.collides(testPiece)) {
        this.currentPiece = testPiece;
        return true;
      }
    }

    return false;
  }

  stepDown(softDrop = false) {
    if (this.tryMove(0, 1)) {
      if (softDrop) {
        this.score += 1;
        this.updateScoreboard();
      }
      return true;
    }

    this.lockPiece();
    return false;
  }

  lockPiece() {
    if (this.turnLocked) {
      return;
    }

    this.turnLocked = true;
    this.board.merge(this.currentPiece);
    const fullRows = this.board.findFullRows();

    if (fullRows.length) {
      this.flashRows = fullRows;
      this.flashUntil = performance.now() + 140;
    } else {
      this.finishTurn();
    }
  }

  finishTurn() {
    if (this.flashRows.length) {
      this.board.clearRows(this.flashRows);
      this.linesCleared += this.flashRows.length;
      this.score += SCORE_TABLE[this.flashRows.length] ?? 0;
      this.level = Math.floor(this.score / LEVEL_STEP) + 1;
      this.flashRows = [];
      this.flashUntil = 0;
      this.updateScoreboard();
    }

    this.dropAccumulator = 0;
    this.turnLocked = false;
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.createRandomPiece();

    if (this.board.collides(this.currentPiece)) {
      this.gameOver = true;
      this.started = false;
      this.updateOverlay("Game Over", "Press Restart to try again.", true);
      this.startPauseButton.textContent = "Start";
    }
  }

  updateScoreboard() {
    this.scoreElement.textContent = String(this.score);
    this.levelElement.textContent = String(this.level);
    this.linesElement.textContent = String(this.linesCleared);
  }

  updateOverlay(title, text, visible) {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlay.classList.toggle("hidden", !visible);
  }

  getGhostPiece() {
    const ghost = this.currentPiece.clone();
    while (!this.board.collides(ghost)) {
      ghost.y += 1;
    }
    ghost.y -= 1;
    return ghost;
  }

  loop(time) {
    const delta = this.lastTime ? time - this.lastTime : 0;
    this.lastTime = time;

    if (this.started && !this.paused && !this.gameOver) {
      if (this.flashRows.length) {
        if (time >= this.flashUntil) {
          this.finishTurn();
        }
      } else {
        this.dropAccumulator += delta;
        if (this.dropAccumulator >= this.getDropInterval()) {
          this.dropAccumulator = 0;
          this.stepDown();
        }
      }
    }

    this.render();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  render() {
    this.drawBoard();
    this.drawGrid();
    this.drawLockedCells();

    if (this.currentPiece) {
      this.drawPiece(this.getGhostPiece(), true);
      this.drawPiece(this.currentPiece);
    }

    this.drawPreview();
  }

  drawBoard() {
    this.boardContext.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    this.boardContext.fillStyle = "#050914";
    this.boardContext.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
  }

  drawGrid() {
    this.boardContext.strokeStyle = "rgba(255, 255, 255, 0.06)";
    this.boardContext.lineWidth = 1;

    for (let x = 0; x <= COLS; x += 1) {
      this.boardContext.beginPath();
      this.boardContext.moveTo(x * CELL_SIZE, 0);
      this.boardContext.lineTo(x * CELL_SIZE, ROWS * CELL_SIZE);
      this.boardContext.stroke();
    }

    for (let y = 0; y <= ROWS; y += 1) {
      this.boardContext.beginPath();
      this.boardContext.moveTo(0, y * CELL_SIZE);
      this.boardContext.lineTo(COLS * CELL_SIZE, y * CELL_SIZE);
      this.boardContext.stroke();
    }
  }

  drawLockedCells() {
    this.board.grid.forEach((row, y) => {
      row.forEach((color, x) => {
        if (!color) {
          return;
        }

        const flashing = this.flashRows.includes(y);
        this.drawCell(
          this.boardContext,
          x * CELL_SIZE,
          y * CELL_SIZE,
          CELL_SIZE,
          flashing ? "#ffffff" : color,
          flashing ? 0.95 : 1,
        );
      });
    });
  }

  drawPiece(piece, ghost = false) {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const boardY = piece.y + y;
        if (boardY < 0) {
          return;
        }

        this.drawCell(
          this.boardContext,
          (piece.x + x) * CELL_SIZE,
          boardY * CELL_SIZE,
          CELL_SIZE,
          piece.color,
          ghost ? 0.18 : 1,
        );
      });
    });
  }

  drawPreview() {
    this.previewContext.clearRect(
      0,
      0,
      this.previewCanvas.width,
      this.previewCanvas.height,
    );
    this.previewContext.fillStyle = "#050914";
    this.previewContext.fillRect(
      0,
      0,
      this.previewCanvas.width,
      this.previewCanvas.height,
    );

    const { matrix, color } = this.nextPiece;
    const width = matrix[0].length * PREVIEW_CELL;
    const height = matrix.length * PREVIEW_CELL;
    const offsetX = (this.previewCanvas.width - width) / 2;
    const offsetY = (this.previewCanvas.height - height) / 2;

    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        this.drawCell(
          this.previewContext,
          offsetX + x * PREVIEW_CELL,
          offsetY + y * PREVIEW_CELL,
          PREVIEW_CELL,
          color,
          1,
        );
      });
    });
  }

  drawCell(context, x, y, size, color, alpha) {
    const padding = size * 0.08;
    const radius = size * 0.16;

    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.shadowBlur = alpha > 0.3 ? 12 : 0;
    context.shadowColor = color;

    context.beginPath();
    context.moveTo(x + padding + radius, y + padding);
    context.arcTo(
      x + size - padding,
      y + padding,
      x + size - padding,
      y + size - padding,
      radius,
    );
    context.arcTo(
      x + size - padding,
      y + size - padding,
      x + padding,
      y + size - padding,
      radius,
    );
    context.arcTo(
      x + padding,
      y + size - padding,
      x + padding,
      y + padding,
      radius,
    );
    context.arcTo(
      x + padding,
      y + padding,
      x + size - padding,
      y + padding,
      radius,
    );
    context.closePath();
    context.fill();

    context.strokeStyle = "rgba(255, 255, 255, 0.35)";
    context.lineWidth = 1.4;
    context.stroke();
    context.restore();
  }
}

window.tetrisGame = new TetrisGame();

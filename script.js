'use strict';

const INITIAL_DURATION_SECONDS = 30;

const DIFFICULTY_CONFIG = {
  easy: { showMinMs: 800, showMaxMs: 1200 },
  normal: { showMinMs: 600, showMaxMs: 1000 },
  hard: { showMinMs: 380, showMaxMs: 800 },
};

const boardElement = document.getElementById('board');
const scoreElement = document.getElementById('score');
const timeLeftElement = document.getElementById('timeLeft');
const startButton = document.getElementById('startBtn');
const pauseButton = document.getElementById('pauseBtn');
const resetButton = document.getElementById('resetBtn');
const difficultySelect = document.getElementById('difficulty');

let isPlaying = false;
let isPaused = false;
let score = 0;
let timeLeft = INITIAL_DURATION_SECONDS;
let countdownIntervalId = null;
let currentHideTimeoutId = null;
let currentHole = null;
let lastHoleIndex = -1;

function getHoles() {
  return Array.from(document.querySelectorAll('.hole'));
}

function updateScoreDisplay() {
  scoreElement.textContent = String(score);
}

function updateTimeDisplay() {
  timeLeftElement.textContent = String(timeLeft);
}

function setControlsOnStartState() {
  startButton.disabled = true;
  pauseButton.disabled = false;
}

function setControlsOnStopState() {
  startButton.disabled = false;
  pauseButton.disabled = true;
}

function pickRandomHoleExcluding(excludedIndex) {
  const holes = getHoles();
  if (holes.length === 0) return { hole: null, index: -1 };
  let index = Math.floor(Math.random() * holes.length);
  if (holes.length > 1) {
    while (index === excludedIndex) {
      index = Math.floor(Math.random() * holes.length);
    }
  }
  return { hole: holes[index], index };
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showMoleOnce() {
  if (!isPlaying || isPaused || timeLeft <= 0) return;
  const config = DIFFICULTY_CONFIG[difficultySelect.value] || DIFFICULTY_CONFIG.normal;
  const { hole, index } = pickRandomHoleExcluding(lastHoleIndex);
  if (!hole) return;
  lastHoleIndex = index;
  currentHole = hole;
  hole.classList.add('up');
  const visibleMs = randomBetween(config.showMinMs, config.showMaxMs);
  clearTimeout(currentHideTimeoutId);
  currentHideTimeoutId = setTimeout(() => {
    hole.classList.remove('up');
    if (isPlaying && !isPaused && timeLeft > 0) {
      showMoleOnce();
    }
  }, visibleMs);
}

function onHolePointerDown(event) {
  const targetHole = event.target.closest('.hole');
  if (!targetHole) return;
  if (!isPlaying || isPaused) return;
  if (!targetHole.classList.contains('up')) return;
  score += 1;
  updateScoreDisplay();
  targetHole.classList.remove('up');
  if (currentHole === targetHole) {
    clearTimeout(currentHideTimeoutId);
  }
  showMoleOnce();
}

function startCountdown() {
  clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(() => {
    if (isPaused) return;
    timeLeft -= 1;
    updateTimeDisplay();
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function startGame() {
  if (isPlaying) return;
  isPlaying = true;
  isPaused = false;
  score = 0;
  timeLeft = INITIAL_DURATION_SECONDS;
  updateScoreDisplay();
  updateTimeDisplay();
  setControlsOnStartState();
  showMoleOnce();
  startCountdown();
}

function pauseGame() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseButton.textContent = '繼續';
  } else {
    pauseButton.textContent = '暫停';
    showMoleOnce();
  }
}

function endGame() {
  isPlaying = false;
  isPaused = false;
  clearInterval(countdownIntervalId);
  clearTimeout(currentHideTimeoutId);
  const holes = getHoles();
  holes.forEach(h => h.classList.remove('up'));
  setControlsOnStopState();
}

function resetGame() {
  endGame();
  score = 0;
  timeLeft = INITIAL_DURATION_SECONDS;
  updateScoreDisplay();
  updateTimeDisplay();
  pauseButton.textContent = '暫停';
}

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', pauseGame);
resetButton.addEventListener('click', resetGame);

boardElement.addEventListener('pointerdown', onHolePointerDown, { passive: true });

difficultySelect.addEventListener('change', () => {
  if (!isPlaying || isPaused) return;
});

updateScoreDisplay();
updateTimeDisplay();
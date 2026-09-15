<template>
  <div class="board-wrap" ref="wrapRef" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <!-- 主棋盘 -->
    <div class="board" :style="{ width: boardPx + 'px', height: boardPx * (ROWS / COLS) + 'px' }">
      <div
        v-for="(row, r) in view"
        :key="r"
        class="row"
      >
        <div
          v-for="(cell, c) in row"
          :key="c"
          class="cell"
          :class="{ filled: !!cell, ghost: cell === 'GHOST' }"
          :style="cell && cell !== 'GHOST' ? { background: colorOf(cell), boxShadow: `inset 0 0 0 1px rgba(255,255,255,.25), 0 0 ${cellPx / 4}px ${shadeOf(cell)}` } : {}"
        >
          <span v-if="cell && cell !== 'GHOST'" class="glyph">{{ glyph }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  COLS, ROWS, SHAPES,
  createBoard, createPiece, rotateCells,
  collide, mergePiece, clearLines,
  calcScore, CLEAR_QUOTES, dropInterval,
} from '../game/tetris.js'
import { playBGM, stopBGM, pauseBGM, resumeBGM, playEliminate } from '../game/audio.js'

const emit = defineEmits(['score', 'lines', 'level', 'quote', 'gameover'])

// ----- 棋盘尺寸自适应 -----
const wrapRef = ref(null)
const boardPx = ref(300)
const cellPx = computed(() => boardPx.value / COLS)

function fitBoard() {
  const h = window.innerHeight
  const w = window.innerWidth
  // 留出顶部信息栏和底部按钮区
  const maxH = h * 0.58
  const maxW = w * 0.92
  boardPx.value = Math.floor(Math.min(maxW, maxH * (COLS / ROWS)))
}
fitBoard()

// ----- 游戏状态 -----
let board = createBoard()
const view = ref([])
const cur = ref(null)
let nextPiece = createPiece()
const nextType = ref(nextPiece.type)

const score = ref(0)
const lines = ref(0)
const level = ref(1)

let timer = null
let running = false
let touchStart = null
let lastMoveTime = 0

function colorOf(type) {
  return SHAPES[type]?.color || '#888'
}
function shadeOf(type) {
  return (SHAPES[type]?.color || '#888') + '55'
}
const glyph = computed(() => '武')

/** 组合视图：棋盘 + 幽灵投影 + 当前方块 */
function buildView() {
  const b = board.map((row) => [...row])
  if (cur.value) {
    // 幽灵投影（落点预览）
    let gy = cur.value.y
    while (!collide(board, cur.value, cur.value.x, gy + 1)) gy++
    if (gy !== cur.value.y) {
      cur.value.cells.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v && gy + r >= 0) b[gy + r][cur.value.x + c] = 'GHOST'
        })
      )
    }
    cur.value.cells.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v && cur.value.y + r >= 0) b[cur.value.y + r][cur.value.x + c] = cur.value.type
      })
    )
  }
  view.value = b
}

function spawn() {
  cur.value = nextPiece
  nextPiece = createPiece()
  nextType.value = nextPiece.type
  if (collide(board, cur.value)) {
    // 顶部堆满，游戏结束
    gameOver()
    return
  }
  buildView()
}

function lockPiece() {
  board = mergePiece(board, cur.value)
  const [newBoard, cleared] = clearLines(board)
  board = newBoard
  if (cleared > 0) {
    playEliminate(cleared) // 消除几行就播放几次音效
    lines.value += cleared
    const gained = calcScore(cleared, level.value)
    score.value += gained
    emit('score', score.value)
    emit('lines', lines.value)
    emit('quote', CLEAR_QUOTES[cleared] || '妙招！')
    const newLevel = Math.floor(lines.value / 10) + 1
    if (newLevel > level.value) {
      level.value = newLevel
      emit('level', level.value)
      restartTimer()
    }
  }
  spawn()
}

function step() {
  if (!running || !cur.value) return
  if (!collide(board, cur.value, cur.value.x, cur.value.y + 1)) {
    cur.value.y++
  } else {
    lockPiece()
  }
  buildView()
}

function move(dx) {
  if (!running || !cur.value) return
  if (!collide(board, cur.value, cur.value.x + dx, cur.value.y)) {
    cur.value.x += dx
    buildView()
  }
}

function rotate() {
  if (!running || !cur.value) return
  const rotated = rotateCells(cur.value.cells)
  // 踢墙：尝试原位、左移、右移
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collide(board, cur.value, cur.value.x + kick, cur.value.y, rotated)) {
      cur.value.cells = rotated
      cur.value.x += kick
      buildView()
      return
    }
  }
}

/** 硬降：直接落地并锁定 */
function hardDrop() {
  if (!running || !cur.value) return
  while (!collide(board, cur.value, cur.value.x, cur.value.y + 1)) {
    cur.value.y++
    score.value += 2
  }
  emit('score', score.value)
  lockPiece()
  buildView()
}

function softDrop() {
  if (!running || !cur.value) return
  if (!collide(board, cur.value, cur.value.x, cur.value.y + 1)) {
    cur.value.y++
    score.value += 1
    emit('score', score.value)
    buildView()
  } else {
    lockPiece()
    buildView()
  }
}

// ----- 游戏循环 -----
function restartTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(step, dropInterval(level.value))
}

function start() {
  board = createBoard()
  score.value = 0
  lines.value = 0
  level.value = 1
  nextPiece = createPiece()
  nextType.value = nextPiece.type
  running = true
  emit('score', 0)
  emit('lines', 0)
  emit('level', 1)
  spawn()
  restartTimer()
  playBGM() // 游戏开始播放背景音乐
}

function pause() {
  running = false
  if (timer) clearInterval(timer)
  pauseBGM()
}

function resume() {
  running = true
  restartTimer()
  resumeBGM()
}

function gameOver() {
  running = false
  if (timer) clearInterval(timer)
  stopBGM() // 游戏结束停止背景音乐
  emit('gameover', { score: score.value, lines: lines.value, level: level.value })
}

// ----- 触屏手势（在棋盘上滑动）-----
function onTouchStart(e) {
  const t = e.touches[0]
  touchStart = { x: t.clientX, y: t.clientY, time: Date.now() }
}

function onTouchEnd(e) {
  if (!touchStart || !running) return
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStart.x
  const dy = t.clientY - touchStart.y
  const dt = Date.now() - touchStart.time
  touchStart = null

  const THRESH = 24
  if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) {
    if (dt < 300) rotate() // 轻点旋转
    return
  }
  if (dy > THRESH * 2 && dt < 350) {
    hardDrop() // 快速下滑：硬降
    return
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    // 水平滑：可连续移动多格
    const steps = Math.min(3, Math.floor(Math.abs(dx) / THRESH))
    for (let i = 0; i < steps; i++) move(dx > 0 ? 1 : -1)
  } else if (dy > 0) {
    softDrop()
  }
}

onMounted(() => {
  window.addEventListener('resize', fitBoard)
  buildView()
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('resize', fitBoard)
})

defineExpose({
  start, pause, resume, move, rotate, softDrop, hardDrop,
  nextType,
})
</script>

<style scoped>
.board-wrap {
  display: flex;
  justify-content: center;
  padding: 8px;
}
.board {
  display: flex;
  flex-direction: column;
  background: #2b1a10;
  border: 3px solid #8a5a2b;
  border-radius: 6px;
  box-shadow: 0 0 24px rgba(212, 158, 82, 0.25), inset 0 0 20px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.row {
  display: flex;
  flex: 1;
}
.cell {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell.ghost {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px dashed rgba(255, 255, 255, 0.25);
}
.glyph {
  font-size: calc(min(2.2vw, 12px));
  color: rgba(0, 0, 0, 0.35);
  font-weight: bold;
}
</style>

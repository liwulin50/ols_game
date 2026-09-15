/**
 * 音效管理（纯本地音频，无网络请求）
 * public/bg.mp3         - 背景音乐（循环）
 * public/eliminate.mp3  - 消行音效
 */

let bgm = null

/** 播放背景音乐（游戏开始时调用，幂等） */
export function playBGM() {
  try {
    if (!bgm) {
      bgm = new Audio('./bg.mp3')
      bgm.loop = true
    }
    bgm.currentTime = 0
    bgm.play().catch(() => {})
  } catch {
    // 音频不可用时静默失败
  }
}

/** 停止背景音乐 */
export function stopBGM() {
  try {
    if (bgm) {
      bgm.pause()
      bgm.currentTime = 0
    }
  } catch {}
}

/** 暂停背景音乐（保留进度） */
export function pauseBGM() {
  try {
    bgm?.pause()
  } catch {}
}

/** 恢复背景音乐（继续播放） */
export function resumeBGM() {
  try {
    bgm?.play().catch(() => {})
  } catch {}
}

/**
 * 播放消行音效：消除几行就播放几次（间隔 150ms 依次触发）
 * @param {number} count 消除行数
 */
export function playEliminate(count) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      try {
        const sfx = new Audio('./eliminate.mp3')
        sfx.play().catch(() => {})
      } catch {}
    }, i * 150)
  }
}

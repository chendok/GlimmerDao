/**
 * AudioWorklet 处理器 —— 捕获麦克风 PCM 音频并通过 MessagePort 发送到主线程
 *
 * 每 128 samples（~8ms @ 16kHz）触发一次 process()，
 * 内部缓冲到 640 samples（~40ms）后批量发送，避免 WebSocket 过载。
 *
 * 音频预处理功能：
 * - 自动增益控制 (AGC)：自适应调整音频幅度，确保语音信号在合理范围
 * - 噪声门控 (Noise Gate)：抑制低幅度噪声，减少无效音频数据发送
 * - 削波保护：防止过大幅度的音频信号导致失真
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // 缓冲区：累积 40ms 的音频数据（640 samples @ 16kHz）
    this.buffer = new Float32Array(640)
    this.bufferIndex = 0
    this.callCount = 0
    this.sendCount = 0

    // ── 自动增益控制 (AGC) 参数 ──
    // 目标 RMS 幅度：0.15（经验值，适合语音识别）
    this.targetRMS = 0.15
    // 增益平滑系数：值越大响应越快，但越不稳定（0.01-0.1）
    this.gainSmoothFactor = 0.05
    // 当前增益值（初始为 1.0，即不改变）
    this.currentGain = 1.0
    // 增益范围限制
    this.minGain = 0.2   // 最大衰减 5x
    this.maxGain = 5.0   // 最大放大 5x
    // AGC 更新间隔（每 N 个 buffer 更新一次增益）
    this.agcUpdateInterval = 5
    this.agcUpdateCounter = 0

    // ── 噪声门控 (Noise Gate) 参数 ──
    // RMS 阈值：低于此值的音频被认为是噪声
    this.noiseGateThreshold = 0.005
    // 噪声门控启用/禁用
    this.noiseGateEnabled = true

    // ── 削波保护 ──
    this.clipThreshold = 0.95
  }

  /**
   * 计算 RMS (Root Mean Square) 幅度
   */
  calculateRMS(samples) {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    return Math.sqrt(sum / samples.length)
  }

  /**
   * 自动增益控制：根据当前音频幅度调整增益
   */
  applyAGC(samples) {
    const rms = this.calculateRMS(samples)

    // 定期更新增益（避免每帧更新导致不稳定）
    this.agcUpdateCounter++
    if (this.agcUpdateCounter >= this.agcUpdateInterval && rms > this.noiseGateThreshold) {
      this.agcUpdateCounter = 0

      // 计算目标增益
      const targetGain = this.targetRMS / Math.max(rms, 0.0001)

      // 限制增益范围
      const clampedGain = Math.max(this.minGain, Math.min(this.maxGain, targetGain))

      // 平滑过渡
      this.currentGain = this.currentGain * (1 - this.gainSmoothFactor) +
                         clampedGain * this.gainSmoothFactor
    }

    // 应用增益
    const gain = this.currentGain
    if (Math.abs(gain - 1.0) < 0.02) {
      // 增益接近 1.0，跳过处理以节省计算
      return samples
    }

    const result = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      result[i] = samples[i] * gain
      // 削波保护
      if (result[i] > this.clipThreshold) {
        result[i] = this.clipThreshold
      } else if (result[i] < -this.clipThreshold) {
        result[i] = -this.clipThreshold
      }
    }
    return result
  }

  process(inputs) {
    this.callCount++
    // 每 100 次调用打印一次日志（~800ms @ 16kHz）
    if (this.callCount === 1) {
      console.log('[AudioWorklet] process() 首次被调用，inputs:', inputs.length, 'channels:', inputs[0]?.length,
                  'AGC:', '启用', 'NoiseGate:', this.noiseGateEnabled ? '启用' : '禁用')
    }
    if (this.callCount % 100 === 0) {
      console.log('[AudioWorklet] process() 已调用', this.callCount, '次，已发送', this.sendCount, '个音频块',
                  '增益:', this.currentGain.toFixed(2))
    }
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true
    }

    let channelData = input[0]
    if (!channelData || channelData.length === 0) {
      return true
    }

    // ── 噪声门控：检测并抑制噪声 ──
    if (this.noiseGateEnabled) {
      const rms = this.calculateRMS(channelData)
      if (rms < this.noiseGateThreshold) {
        // 低于阈值，衰减为接近静音（不完全静音，避免断开连接）
        channelData = new Float32Array(channelData.length)
        // 填充极小值（-60dB），保持连接活跃
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] = (Math.random() - 0.5) * 0.00003
        }
      }
    }

    // ── 自动增益控制 ──
    channelData = this.applyAGC(channelData)

    // 累积到缓冲区
    const remaining = this.buffer.length - this.bufferIndex
    const copyCount = Math.min(channelData.length, remaining)

    this.buffer.set(
      channelData.length <= copyCount ? channelData : channelData.subarray(0, copyCount),
      this.bufferIndex
    )
    this.bufferIndex += copyCount

    // 缓冲区满，发送数据
    if (this.bufferIndex >= this.buffer.length) {
      // 发送缓冲区副本（Float32Array → ArrayBuffer）
      const sendBuffer = new Float32Array(this.buffer)
      this.port.postMessage(sendBuffer.buffer, [sendBuffer.buffer])
      this.sendCount++

      // 重置缓冲区
      this.buffer = new Float32Array(640)
      this.bufferIndex = 0

      // 如果还有剩余数据（极少见），放入新缓冲区
      if (copyCount < channelData.length) {
        const leftover = channelData.subarray(copyCount)
        this.buffer.set(leftover, 0)
        this.bufferIndex = leftover.length
      }
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
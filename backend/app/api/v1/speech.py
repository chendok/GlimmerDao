"""语音识别 API"""
import json
import logging
import re
import struct

import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from ...services.speech_service import (
    transcribe_audio,
    model_loaded,
    get_recognizer,
    get_model_type,
    is_ctc_model,
    restore_punctuation,
)
from ...services.text_postprocessor import correct_partial_text

logger = logging.getLogger("uvicorn")
router = APIRouter()

# 编译一次正则，避免每次清洗时重复编译
_RE_CLEAN = re.compile(r'[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\u200B-\u200F\uFEFF]')

# 音频幅度归一化阈值
_MAX_AMPLITUDE_THRESHOLD = 1.0  # 超过此值进行削波
_MIN_AMPLITUDE_THRESHOLD = 0.01  # 低于此值进行增强

# 停止指令检测正则 —— 匹配完整停止指令短语（必须位于文本末尾）
# 使用词边界确保精确匹配，避免"公交车停了"等误触发
_STOP_COMMAND_PATTERN = re.compile(
    r'(?:停止录入|停止录音|结束录音|退出录音|关闭录音|'
    r'停止识别|结束录入|完成录入|录入完成|录音完成|'
    r'停止语音|结束语音|语音停止|停止说话|'
    r'停止录入吧|结束录入吧|停止吧|结束吧)$'
)

# 停止指令前缀（用于匹配末尾的简略指令，需要更严格的上下文检查）
# 支持句末助词（了/啦/吧/啊/呢/吗/哦/哟）后直接跟停止指令的场景，如"说完了结束"
# 使用 lookbehind 避免消耗句末助词字符
_STOP_SHORT_PATTERN = re.compile(
    r'(?:^|。|，|？|！|,|\s|(?<=[了啦吧啊呢吗哦哟]))(停止|结束)(?:录音|录入|识别|语音)?(?:吧)?$'
)

# 简略停止指令允许的最大前置文本长度（超过此长度视为正常内容，避免误触发）
_STOP_SHORT_MAX_PREFIX_LEN = 8


def _clean_text(text: str) -> str:
    """清洗识别文本：过滤异常字符、控制字符、未配对代理对"""
    if not text:
        return ""
    text = _RE_CLEAN.sub('', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _normalize_audio_chunk(samples: np.ndarray) -> np.ndarray:
    """对音频块进行幅度归一化

    确保音频幅度在合理范围内，防止削波和量化失真。
    流式处理中，每个 chunk 独立归一化，避免累积误差。

    Args:
        samples: float32 numpy 数组，音频采样数据

    Returns:
        归一化后的音频采样数据
    """
    if len(samples) == 0:
        return samples

    max_abs = np.max(np.abs(samples))
    if max_abs <= 0:
        return samples

    if max_abs > _MAX_AMPLITUDE_THRESHOLD:
        # 削波：将过大幅度的音频缩放到 [-1, +1]
        return samples / max_abs
    elif max_abs < _MIN_AMPLITUDE_THRESHOLD:
        # 极低幅度：放大到合理范围（乘以 0.5 作为安全边际）
        return samples / max_abs * 0.5

    return samples


def _detect_stop_command(text: str) -> tuple[bool, str]:
    """检测文本中是否包含停止指令

    Args:
        text: 当前识别文本

    Returns:
        (is_stop, cleaned_text): 是否检测到停止指令，以及移除停止指令后的文本
    """
    if not text:
        return False, text

    # 检查完整停止指令
    if _STOP_COMMAND_PATTERN.search(text):
        cleaned = _STOP_COMMAND_PATTERN.sub('', text).strip()
        # 清理末尾可能残留的标点
        cleaned = re.sub(r'[，,。！？\s]+$', '', cleaned)
        return True, cleaned

    # 检查简短停止指令（需要更严格的上下文）
    match = _STOP_SHORT_PATTERN.search(text)
    if match:
        # 长度检查：前缀文本过长时（>8字符）不触发，避免长句误触发
        before_stop = text[:match.start()]
        if len(before_stop) <= _STOP_SHORT_MAX_PREFIX_LEN:
            cleaned = _STOP_SHORT_PATTERN.sub('', text).strip()
            cleaned = re.sub(r'[，,。！？\s]+$', '', cleaned)
            return True, cleaned

    return False, text


def _strip_stop_command(text: str) -> str:
    """从文本中移除停止指令返回清理后的文本"""
    if not text:
        return text

    text = _STOP_COMMAND_PATTERN.sub('', text).strip()
    text = _STOP_SHORT_PATTERN.sub('', text).strip()
    text = re.sub(r'[，,。！？\s]+$', '', text)
    return text


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """转录音频为文字

    Args:
        file: 音频文件 (支持 WAV/MP3/WebM/OGG 格式)

    Returns:
        {"success": true, "text": "识别结果文字"}
    """
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="请上传音频文件")

    try:
        audio_bytes = await file.read()
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="音频文件为空")

        if len(audio_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="音频文件过大 (最大 10MB)")

        text = transcribe_audio(audio_bytes, language="zh")
        return JSONResponse(content={
            "success": True,
            "text": text,
        })

    except HTTPException:
        raise
    except RuntimeError as e:
        msg = str(e)
        if "未安装" in msg:
            raise HTTPException(status_code=503, detail=msg)
        raise HTTPException(status_code=500, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"语音识别失败: {str(e)}")


@router.websocket("/stream")
async def speech_stream(websocket: WebSocket):
    """WebSocket 流式语音识别

    客户端发送消息：
        二进制消息：float32 PCM 音频数据 (16kHz, 单声道)
        文本消息：{"type": "stop"} —— 手动停止录音

    服务端返回 JSON 消息：
        {"type": "partial",       "text": "部分识别结果"}
        {"type": "stop_detected", "text": "检测到停止指令"}
        {"type": "final",         "text": "最终识别结果（含标点）"}
        {"type": "error",         "message": "错误信息"}

    CTC 模型（默认）使用模拟流式解码：
    - 累积音频块，定期（~500ms）对全部累积音频进行 CTC 解码
    - CTC 推理速度极快 (RTF ~0.05)，定期解码不会阻塞流式体验
    """
    await websocket.accept()
    logger.info("WebSocket 语音识别连接已建立")

    recognizer = None
    stream = None
    target_rate = 16000
    stop_detected = False
    use_ctc = False
    # CTC 模拟流式：累积音频数据
    audio_chunks = []

    try:
        logger.info("[语音识别] 正在初始化语音识别器...")
        recognizer = get_recognizer()
        use_ctc = is_ctc_model()
        model_type = get_model_type()

        if use_ctc:
            logger.info(f"[语音识别] CTC 模型已就绪，使用模拟流式解码 (解码间隔 ~500ms)")
        else:
            stream = recognizer.create_stream()
            logger.info("[语音识别] Transducer 模型已就绪，开始接收音频数据")

        last_text = ""
        chunk_count = 0
        # CTC 模拟流式：每 12 个 chunk (~480ms) 解码一次
        _CTC_DECODE_INTERVAL = 12

        while True:
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                logger.info("WebSocket 客户端断开连接")
                break

            if message["type"] == "websocket.disconnect":
                logger.info("WebSocket 客户端断开连接")
                break

            if message["type"] != "websocket.receive":
                continue

            # 处理文本控制消息
            if "text" in message:
                try:
                    msg_data = json.loads(message["text"])
                    if msg_data.get("type") == "stop":
                        logger.info("收到手动停止指令")
                        break
                except (json.JSONDecodeError, TypeError):
                    pass
                continue

            # 处理二进制音频数据
            if "bytes" not in message:
                continue

            data = message["bytes"]
            if len(data) == 0:
                continue

            try:
                samples = np.frombuffer(data, dtype=np.float32).copy()
            except Exception as e:
                logger.warning(f"音频数据解析失败: {e}")
                continue

            if len(samples) == 0:
                continue

            # ── 音频预处理：幅度归一化 ──
            samples = _normalize_audio_chunk(samples)

            chunk_count += 1

            if use_ctc:
                # ── CTC 模拟流式：累积音频 ──
                audio_chunks.append(samples)

                if chunk_count == 1:
                    logger.info(f"[语音识别] 收到第一个音频块: {len(samples)} samples, "
                               f"max={samples.max():.4f}, min={samples.min():.4f}")
                elif chunk_count % 10 == 0:
                    total_samples = sum(len(c) for c in audio_chunks)
                    logger.info(f"[语音识别] 已接收 {chunk_count} 个音频块 "
                               f"(~{chunk_count * 40}ms, 累积 {total_samples} samples)")

                # 定期解码：每 _CTC_DECODE_INTERVAL 个 chunk 运行一次
                if chunk_count % _CTC_DECODE_INTERVAL == 0 and len(audio_chunks) > 0:
                    current_text = _ctc_partial_decode(
                        recognizer, audio_chunks, target_rate
                    )
                    current_text = _clean_text(current_text)

                    if current_text and current_text != last_text:
                        logger.info(f"[语音识别] CTC 部分结果: '{current_text}'")
                        last_text = current_text

                        corrected_text = correct_partial_text(current_text)

                        is_stop, cleaned_text = _detect_stop_command(corrected_text)
                        if is_stop:
                            stop_detected = True
                            logger.info(f"检测到停止指令: '{current_text}' → 清理后: '{cleaned_text}'")
                            try:
                                await websocket.send_json({
                                    "type": "stop_detected",
                                    "text": cleaned_text if cleaned_text else current_text,
                                })
                            except Exception:
                                pass
                            break

                        await websocket.send_json({
                            "type": "partial",
                            "text": corrected_text,
                        })
            else:
                # ── Transducer 流式：原有逻辑 ──
                stream.accept_waveform(target_rate, samples)

                if chunk_count == 1:
                    logger.info(f"[语音识别] 收到第一个音频块: {len(samples)} samples, "
                               f"max={samples.max():.4f}, min={samples.min():.4f}, "
                               f"mean_abs={np.abs(samples).mean():.6f}")
                elif chunk_count % 10 == 0:
                    logger.info(f"[语音识别] 已接收 {chunk_count} 个音频块 (~{chunk_count * 40}ms)")

                while recognizer.is_ready(stream):
                    recognizer.decode_stream(stream)

                current_text = _clean_text(recognizer.get_result(stream))

                if current_text and current_text != last_text:
                    logger.info(f"[语音识别] 部分结果: '{current_text}'")
                    last_text = current_text

                    corrected_text = correct_partial_text(current_text)

                    is_stop, cleaned_text = _detect_stop_command(corrected_text)
                    if is_stop:
                        stop_detected = True
                        logger.info(f"检测到停止指令: '{current_text}' → 清理后: '{cleaned_text}'")
                        try:
                            await websocket.send_json({
                                "type": "stop_detected",
                                "text": cleaned_text if cleaned_text else current_text,
                            })
                        except Exception:
                            pass
                        break

                    await websocket.send_json({
                        "type": "partial",
                        "text": corrected_text,
                    })

    except WebSocketDisconnect:
        logger.info("WebSocket 客户端断开连接")
    except Exception as e:
        logger.error(f"WebSocket 语音识别错误: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass
    finally:
        # 发送最终结果
        if recognizer is not None:
            try:
                if use_ctc and len(audio_chunks) > 0:
                    # ── CTC 最终解码 ──
                    final_text = _ctc_final_decode(recognizer, audio_chunks, target_rate)
                elif stream is not None:
                    # ── Transducer 最终解码 ──
                    stream.input_finished()
                    while recognizer.is_ready(stream):
                        recognizer.decode_stream(stream)
                    final_text = _clean_text(recognizer.get_result(stream))
                else:
                    final_text = ""

                if stop_detected:
                    final_text = _strip_stop_command(final_text)
                    if not final_text:
                        final_text = _strip_stop_command(last_text) if last_text else ""

                if final_text:
                    try:
                        punctuated_text = await restore_punctuation(final_text)
                        if punctuated_text:
                            final_text = punctuated_text
                            logger.info(f"标点恢复完成: {len(final_text)} 字符")
                    except Exception as e:
                        logger.warning(f"标点恢复失败，使用原始文本: {e}")

                    try:
                        await websocket.send_json({
                            "type": "final",
                            "text": final_text,
                        })
                        logger.info(f"已发送最终结果 ({model_type}): {final_text}")
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"处理最终结果失败: {e}")

        if stream is not None:
            del stream

        try:
            await websocket.close()
        except Exception:
            pass


def _ctc_partial_decode(recognizer, audio_chunks: list, sample_rate: int) -> str:
    """CTC 模拟流式部分解码：对累积音频进行增量识别"""
    import numpy as np
    try:
        all_samples = np.concatenate(audio_chunks).astype(np.float32)
        stream = recognizer.create_stream()
        stream.accept_waveform(sample_rate, all_samples)
        recognizer.decode_stream(stream)
        return stream.result.text
    except Exception as e:
        logger.warning(f"CTC 部分解码失败: {e}")
        return ""


def _ctc_final_decode(recognizer, audio_chunks: list, sample_rate: int) -> str:
    """CTC 最终解码"""
    import numpy as np
    all_samples = np.concatenate(audio_chunks).astype(np.float32)
    logger.info(f"CTC 最终解码: {len(all_samples)} samples ({len(all_samples) / sample_rate:.1f}s)")

    stream = recognizer.create_stream()
    stream.accept_waveform(sample_rate, all_samples)
    recognizer.decode_stream(stream)
    text = _clean_text(stream.result.text)
    logger.info(f"CTC 最终解码完成: {len(text)} 字符")
    return text


@router.get("/status")
async def status():
    """检查语音识别服务状态"""
    return JSONResponse(content={
        "success": True,
        "model_loaded": model_loaded(),
        "engine": "sherpa-onnx",
        "model_type": get_model_type() if model_loaded() else "unknown",
    })
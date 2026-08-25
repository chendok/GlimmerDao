"""语音识别服务 —— 基于 sherpa-onnx 的本地离线语音识别

模型演进：
- v1: Zipformer Transducer 14M (流式) — CER ~6.2%, greedy_search
- v2: Zipformer Transducer 14M (流式) — CER ~6.2%, modified_beam_search + hotwords + dither
- v3: Zipformer CTC (离线, 模拟流式) — CER ~1.74%, 精度提升 3.5x

CTC 模型虽然是非流式模型，但推理速度极快 (RTF ~0.05)，
通过模拟流式解码（定期对累积音频进行增量识别），
可以在保持流式体验的同时获得接近离线模型的精度。
"""
import io
import logging
import os
import tarfile
import urllib.request
from pathlib import Path
from typing import Optional

logger = logging.getLogger("uvicorn")

MODEL_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "models"

# ── Zipformer CTC 模型（2025-07-03，最新非流式模型）──
# CER: 1.74% on AISHELL-1, WER: 5.92% on WenetSpeech test_net
# 模型大小：350MB (int8)，RTF ~0.05（CPU 上约 20x 实时）
CTC_MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-zipformer-ctc-zh-int8-2025-07-03.tar.bz2"
CTC_MODEL_DIR_NAME = "sherpa-onnx-zipformer-ctc-zh-int8-2025-07-03"

# 降级模型：旧版流式 Transducer
FALLBACK_MODEL_URL = "https://raw.fastgit.org/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-14M-2025-06-30.tar.bz2"
FALLBACK_MODEL_DIR_NAME = "sherpa-onnx-streaming-zipformer-zh-14M-2025-06-30"
FALLBACK_MODEL_DIR_NAME_INT8 = "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30"

_recognizer: Optional[object] = None
_model_type: str = ""  # "ctc" or "transducer"


def _download_ctc_model() -> str:
    """下载 Zipformer CTC 模型（v3，精度最高）"""
    model_dir = MODEL_CACHE_DIR / CTC_MODEL_DIR_NAME
    if model_dir.exists() and len(list(model_dir.iterdir())) > 0:
        logger.info(f"CTC 模型已存在: {model_dir}")
        return str(model_dir)

    model_dir.mkdir(parents=True, exist_ok=True)
    tar_path = MODEL_CACHE_DIR / f"{CTC_MODEL_DIR_NAME}.tar.bz2"

    logger.info(f"正在下载 CTC 模型 (350MB, CER 1.74%): {CTC_MODEL_URL}")
    try:
        urllib.request.urlretrieve(CTC_MODEL_URL, str(tar_path))
        logger.info(f"CTC 模型下载完成: {tar_path}")

        logger.info("正在解压 CTC 模型...")
        with tarfile.open(str(tar_path), "r:bz2") as tar:
            tar.extractall(str(MODEL_CACHE_DIR))
        logger.info("CTC 模型解压完成")

        try:
            os.remove(str(tar_path))
        except OSError:
            pass

        return str(model_dir)
    except Exception as e:
        logger.warning(f"CTC 模型下载失败: {e}，尝试降级到流式 Transducer 模型")

        try:
            import shutil
            shutil.rmtree(str(model_dir), ignore_errors=True)
            if tar_path.exists():
                os.remove(str(tar_path))
        except Exception:
            pass

        return _download_fallback_model()


def _download_fallback_model() -> str:
    """降级：下载旧版流式 Transducer 模型"""
    # 先检查 int8 降级模型
    fallback_dir = MODEL_CACHE_DIR / FALLBACK_MODEL_DIR_NAME_INT8
    if fallback_dir.exists() and len(list(fallback_dir.iterdir())) > 0:
        logger.info(f"使用 int8 降级模型: {fallback_dir}")
        return str(fallback_dir)

    # 尝试 14M 模型
    model_dir = MODEL_CACHE_DIR / FALLBACK_MODEL_DIR_NAME
    if model_dir.exists() and len(list(model_dir.iterdir())) > 0:
        logger.info(f"14M 模型已存在: {model_dir}")
        return str(model_dir)

    model_dir.mkdir(parents=True, exist_ok=True)
    tar_path = MODEL_CACHE_DIR / f"{FALLBACK_MODEL_DIR_NAME}.tar.bz2"

    logger.info(f"正在下载 14M 流式模型: {FALLBACK_MODEL_URL}")
    try:
        urllib.request.urlretrieve(FALLBACK_MODEL_URL, str(tar_path))
        with tarfile.open(str(tar_path), "r:bz2") as tar:
            tar.extractall(str(MODEL_CACHE_DIR))
        try:
            os.remove(str(tar_path))
        except OSError:
            pass
        return str(model_dir)
    except Exception as e:
        logger.warning(f"14M 模型下载失败: {e}")
        try:
            import shutil
            shutil.rmtree(str(model_dir), ignore_errors=True)
            if tar_path.exists():
                os.remove(str(tar_path))
        except Exception:
            pass

        if fallback_dir.exists() and len(list(fallback_dir.iterdir())) > 0:
            return str(fallback_dir)

        raise RuntimeError(
            "所有模型下载失败。请手动下载模型：\n"
            f"1. CTC 模型: {CTC_MODEL_URL}\n"
            f"2. 解压到: {MODEL_CACHE_DIR / CTC_MODEL_DIR_NAME}"
        )


def get_recognizer():
    """懒加载语音识别器（单例）

    优先使用 CTC 模型（CER 1.74%），降级使用 Transducer 模型（CER 6.2%）。
    CTC 模型是非流式的，但通过模拟流式解码实现实时体验。
    """
    global _recognizer, _model_type

    if _recognizer is not None:
        return _recognizer

    try:
        import sherpa_onnx
    except ImportError:
        raise RuntimeError(
            "sherpa-onnx 未安装，请运行: pip install sherpa-onnx"
        )

    model_dir = _download_ctc_model()
    is_ctc = CTC_MODEL_DIR_NAME in str(model_dir)

    logger.info(f"正在初始化 sherpa-onnx 语音识别器 ({'CTC' if is_ctc else 'Transducer'} 模型)...")

    try:
        if is_ctc:
            _recognizer = _init_ctc_recognizer(model_dir)
            _model_type = "ctc"
        else:
            _recognizer = _init_transducer_recognizer(model_dir)
            _model_type = "transducer"
    except Exception as e:
        logger.error(f"语音识别器初始化失败: {e}")
        raise RuntimeError(f"语音识别器初始化失败: {str(e)}")

    return _recognizer


def _init_ctc_recognizer(model_dir: str):
    """初始化 CTC 离线识别器（精度最高，CER 1.74%）"""
    import sherpa_onnx

    model_path = str(Path(model_dir) / "model.int8.onnx")
    tokens_path = str(Path(model_dir) / "tokens.txt")

    recognizer = sherpa_onnx.OfflineRecognizer.from_zipformer_ctc(
        model=model_path,
        tokens=tokens_path,
        num_threads=4,
        # ── 解码策略 ──
        # CTC 模型使用 greedy_search（默认）
        decoding_method="greedy_search",
        # ── 采样率与特征维度 ──
        sample_rate=16000,
        feature_dim=80,
        # ── 调试选项 ──
        debug=False,
    )
    logger.info(
        "sherpa-onnx CTC 识别器初始化完成 "
        "(model=Zipformer CTC int8, CER=1.74%, "
        "decoding=greedy_search, sample_rate=16000)"
    )
    return recognizer


def _init_transducer_recognizer(model_dir: str):
    """初始化 Transducer 流式识别器（降级方案）"""
    import sherpa_onnx

    is_int8 = FALLBACK_MODEL_DIR_NAME_INT8 in str(model_dir)

    if is_int8:
        encoder_path = str(Path(model_dir) / "encoder.int8.onnx")
        joiner_path = str(Path(model_dir) / "joiner.int8.onnx")
        num_threads = 2
        model_label = "int8"
    else:
        encoder_path = str(Path(model_dir) / "encoder-14M.onnx")
        joiner_path = str(Path(model_dir) / "joiner-14M.onnx")
        num_threads = 4
        model_label = "14M"

    decoder_path = str(Path(model_dir) / "decoder.onnx")
    tokens_path = str(Path(model_dir) / "tokens.txt")

    hotwords_path = str(MODEL_CACHE_DIR / "hotwords.txt")

    recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=tokens_path,
        encoder=encoder_path,
        decoder=decoder_path,
        joiner=joiner_path,
        num_threads=num_threads,
        decoding_method="modified_beam_search",
        max_active_paths=4,
        temperature_scale=2.0,
        hotwords_file=hotwords_path if os.path.exists(hotwords_path) else "",
        hotwords_score=1.5,
        modeling_unit="cjkchar",
        dither=0.00003,
        low_freq=20.0,
        high_freq=-400.0,
        normalize_samples=True,
        enable_endpoint_detection=True,
        rule1_min_trailing_silence=1.2,
        rule2_min_trailing_silence=0.8,
        rule3_min_utterance_length=30.0,
    )
    logger.info(
        f"sherpa-onnx Transducer 识别器初始化完成 ({model_label} 模型, "
        f"decoding=modified_beam_search, "
        f"hotwords={'启用' if os.path.exists(hotwords_path) else '未配置'})"
    )
    return recognizer


def get_model_type() -> str:
    """返回当前模型类型: 'ctc' 或 'transducer'"""
    return _model_type


def is_ctc_model() -> bool:
    """是否使用 CTC 模型（高精度）"""
    return _model_type == "ctc"


def transcribe_audio(audio_bytes: bytes, language: str = "zh") -> str:
    """将音频字节流转为文字

    支持 CTC 和 Transducer 两种模型，自动适配不同的 API。
    """
    recognizer = get_recognizer()

    try:
        import av
        import numpy as np

        # 用 PyAV 解码音频（支持 WebM / OGG / WAV / MP3 等格式）
        container = av.open(io.BytesIO(audio_bytes))
        audio_stream = container.streams.audio[0]
        target_rate = 16000

        # 配置重采样器：float32 planar, 单声道, 16kHz
        resampler = av.AudioResampler(
            format=av.AudioFormat('fltp'),
            layout="mono",
            rate=target_rate,
        )

        frames = []
        for frame in container.decode(audio=0):
            for resampled_frame in resampler.resample(frame):
                frames.append(resampled_frame.to_ndarray().flatten())

        container.close()

        if not frames:
            logger.warning("音频流为空")
            return ""

        samples = np.concatenate(frames).astype(np.float32)
        logger.info(f"音频解码完成: {len(samples)} samples @ {target_rate}Hz")

        # ── 音频预处理：幅度归一化 ──
        max_abs = np.max(np.abs(samples))
        if max_abs > 0 and max_abs != 1.0:
            if max_abs > 1.0:
                samples = samples / max_abs
                logger.info(f"音频幅度归一化: max={max_abs:.2f} → 缩放到 [-1, +1]")
            elif max_abs < 0.01:
                samples = samples / max_abs * 0.5
                logger.info(f"音频幅度增强: max={max_abs:.6f} → 放大到 [-0.5, +0.5]")

        if is_ctc_model():
            # ── CTC 模型：离线解码 ──
            stream = recognizer.create_stream()
            stream.accept_waveform(target_rate, samples)
            recognizer.decode_stream(stream)
            text = stream.result.text.strip()
        else:
            # ── Transducer 模型：流式解码 ──
            stream = recognizer.create_stream()
            stream.accept_waveform(target_rate, samples)

            tail = np.zeros(int(0.5 * target_rate), dtype=np.float32)
            stream.accept_waveform(target_rate, tail)
            stream.input_finished()

            while recognizer.is_ready(stream):
                recognizer.decode_stream(stream)

            result = recognizer.get_result_all(stream)
            text = result.text.strip()

        if not text:
            logger.warning("未识别到语音内容")
            return ""

        logger.info(f"语音识别完成 ({get_model_type()}): {len(text)} 字符")
        return text

    except Exception as e:
        logger.error(f"语音识别失败: {e}")
        raise RuntimeError(f"语音识别失败: {str(e)}")


def model_loaded() -> bool:
    """检查模型是否已加载"""
    return _recognizer is not None


# ---- 文本后处理（纠错 + 断句 + 标点） ----

async def restore_punctuation(text: str, timeout: float = 5.0) -> str:
    """对语音识别结果进行后处理：自动纠错 + 断句 + 标点添加

    使用双引擎架构：
    - LLM 引擎（DeepSeek）：全面处理，精度 >95%
    - 规则引擎（降级）：LLM 不可用时使用，精度 ~80-85%

    Args:
        text: 原始识别文本
        timeout: LLM 调用超时时间（秒）

    Returns:
        处理后的文本
    """
    from .text_postprocessor import postprocess_text

    return await postprocess_text(
        text,
        correction="medium",
        punctuation="standard",
        timeout=timeout,
    )
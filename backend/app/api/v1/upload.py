"""图片上传接口"""
import os
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger("uvicorn")

router = APIRouter()

# 上传目录
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    """上传单张图片

    - 支持 JPG / PNG / WEBP 格式
    - 限制单张不超过 5MB
    """
    # 格式校验
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片格式: {file.content_type}，仅支持 JPG、PNG、WEBP",
        )

    # 大小校验（从请求体读取后检查）
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"图片大小超过限制 ({len(content) / 1024 / 1024:.1f}MB > 5MB)",
        )

    # 读取文件内容后需要重置 file.size 相关状态
    await file.seek(0)
    content = await file.read()

    # 生成唯一文件名
    ext = os.path.splitext(file.filename or "image.png")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"

    # 确保上传目录存在
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # 保存文件
    file_path = UPLOAD_DIR / unique_name
    file_path.write_bytes(content)

    # 返回可访问的 URL
    url = f"/uploads/{unique_name}"

    logger.info(f"图片上传成功: {file.filename} → {unique_name} ({len(content)} bytes)")

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "url": url,
            "name": file.filename,
            "size": len(content),
        },
    )


@router.delete("/image/{filename}")
async def delete_image(filename: str):
    """删除已上传的图片"""
    file_path = UPLOAD_DIR / filename
    # 安全检查：防止路径穿越
    resolved = file_path.resolve()
    if not str(resolved).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=403, detail="非法文件路径")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    file_path.unlink()
    logger.info(f"图片已删除: {filename}")
    return {"success": True}

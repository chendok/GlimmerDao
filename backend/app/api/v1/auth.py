"""认证 API 路由"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ..deps import get_current_user_id
from ...database import get_db
from ...schemas.auth import (
    PasswordLoginRequest,
    PasswordRegisterRequest,
    EmailResetPasswordRequest,
    SendEmailCodeRequest,
    TokenResponse,
    MessageResponse,
    SendCodeResponse,
    UserInfo,
)
from ...services import auth_service as auth
from ...services import email_service

logger = logging.getLogger("uvicorn")
router = APIRouter()


def get_client_ip(request: Request) -> str:
    """获取客户端IP"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── 发送邮箱验证码 ──

@router.post("/email/send-code", response_model=SendCodeResponse)
async def send_email_code(
    req: SendEmailCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """发送邮箱验证码"""
    success, message = await email_service.send_email_code(db, req.email, req.purpose)
    if not success:
        raise HTTPException(status_code=429, detail=message)
    return SendCodeResponse(
        message=message,
        success=True,
        cooldown_seconds=settings.EMAIL_CODE_COOLDOWN_SECONDS,
    )


# ── 邮箱密码登录 ──

@router.post("/login", response_model=TokenResponse)
async def login(
    req: PasswordLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """邮箱密码登录"""
    account = auth.sanitize_input(req.account)
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")

    # 检查锁定
    is_locked, remaining = await auth.check_login_lockout(db, account)
    if is_locked:
        await auth.record_login_log(db, None, account, ip, ua, "failure", "账户锁定")
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"账户已被临时锁定，请 {remaining} 秒后重试",
        )

    # 查找用户
    user = await auth.get_user_by_account(db, account)
    if not user:
        await auth.record_login_attempt(db, account, ip, False)
        await auth.record_login_log(db, None, account, ip, ua, "failure", "用户不存在")
        await db.commit()
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    # 验证密码
    if not user.password_hash or not auth.verify_password(req.password, user.password_hash):
        await auth.record_login_attempt(db, account, ip, False)
        await auth.record_login_log(db, user.id, account, ip, ua, "failure", "密码错误")
        await db.commit()
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    # 登录成功
    await auth.record_login_attempt(db, account, ip, True)
    await auth.record_login_log(db, user.id, account, ip, ua, "success")
    user.last_login_at = datetime.utcnow()
    await db.flush()

    token, expires_in = auth.create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserInfo(**auth.user_to_info(user)),
    )


# ── 登出 ──

@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """登出 — 记录登出日志"""
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    user = await auth.get_user_by_id(db, user_id)
    username = (user.email or user.phone) if user else None
    await auth.record_login_log(db, user_id, username, ip, ua, "logout")
    return MessageResponse(message="登出成功")


# ── 邮箱注册（带验证码验证） ──

@router.post("/register", response_model=TokenResponse)
async def register(
    req: PasswordRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """邮箱密码注册（需邮箱验证码）"""
    account = auth.sanitize_input(req.account)

    # 检查邮箱是否已注册
    existing = await auth.get_user_by_account(db, account)
    if existing:
        raise HTTPException(status_code=409, detail="该邮箱已注册")

    # 验证邮箱验证码
    code_valid, msg = await email_service.verify_email_code(
        db, account, req.verification_code, purpose="register"
    )
    if not code_valid:
        raise HTTPException(status_code=400, detail=msg)

    # 创建用户
    user = await auth.create_user(db, email=account, password=req.password)

    user.is_verified = True
    user.last_login_at = datetime.utcnow()
    await db.flush()

    logger.info(f"新用户注册: {account}")
    token, expires_in = auth.create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=UserInfo(**auth.user_to_info(user)),
    )


# ── 重置密码（通过邮箱） ──

@router.post("/password/reset", response_model=MessageResponse)
async def reset_password(
    req: EmailResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """通过邮箱重置密码（需验证码验证）"""
    from app.services.email_service import verify_email_code

    account = auth.sanitize_input(req.account)

    # 1. 验证邮箱验证码
    code_valid, code_msg = await verify_email_code(db, account, req.verification_code, purpose="reset_password")
    if not code_valid:
        raise HTTPException(status_code=400, detail=code_msg)

    # 2. 查找用户
    user = await auth.get_user_by_account(db, account)
    if not user:
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    # 3. 更新密码
    await auth.update_user_password(db, user, req.new_password)
    logger.info(f"用户 {account} 密码已重置")

    return MessageResponse(message="密码重置成功")


# ── 获取当前用户信息 ──

@router.get("/me", response_model=UserInfo)
async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取当前登录用户信息"""
    user = await auth.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="账户已被禁用")

    return UserInfo(**auth.user_to_info(user))

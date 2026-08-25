"""认证服务层"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import bcrypt
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt

from ..config import settings
from ..models.user import User, LoginAttempt, LoginLog, SmsVerificationCode

logger = logging.getLogger("uvicorn")


# ── 密码处理 ──

def hash_password(password: str) -> str:
    """使用 bcrypt 加盐哈希密码"""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """验证密码"""
    return bcrypt.checkpw(
        password.encode("utf-8"),
        password_hash.encode("utf-8")
    )


# ── JWT 令牌 ──

def create_access_token(user_id: int) -> Tuple[str, int]:
    """创建 JWT 访问令牌，返回 (token, expires_in_seconds)"""
    expires_in = settings.JWT_EXPIRE_MINUTES * 60
    expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "access",
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> Optional[int]:
    """解码 JWT 令牌，返回 user_id 或 None"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except Exception:
        return None


# ── 用户管理 ──

async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """根据ID获取用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_phone(db: AsyncSession, phone: str) -> Optional[User]:
    """根据手机号获取用户"""
    result = await db.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """根据邮箱获取用户"""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_account(db: AsyncSession, account: str) -> Optional[User]:
    """根据手机号或邮箱获取用户"""
    result = await db.execute(
        select(User).where(
            (User.phone == account) | (User.email == account)
        )
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    password: Optional[str] = None,
) -> User:
    """创建新用户"""
    user = User(
        phone=phone,
        email=email,
        password_hash=hash_password(password) if password else None,
        is_active=True,
        is_verified=bool(phone),
    )
    db.add(user)
    await db.flush()
    return user


async def update_user_password(db: AsyncSession, user: User, new_password: str) -> None:
    """更新用户密码"""
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.utcnow()
    await db.flush()


def user_to_info(user: User) -> dict:
    """将 User 模型转为安全的字典（不暴露敏感字段）"""
    return {
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "gender": user.gender,
        "wechat_nickname": user.wechat_nickname,
        "is_verified": user.is_verified,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ── 登录安全 ──

async def check_login_lockout(db: AsyncSession, identifier: str) -> Tuple[bool, int]:
    """检查是否被锁定，返回 (is_locked, remaining_seconds)"""
    window_start = datetime.utcnow() - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    result = await db.execute(
        select(func.count(LoginAttempt.id))
        .where(
            LoginAttempt.identifier == identifier,
            LoginAttempt.success == False,
            LoginAttempt.attempted_at >= window_start,
        )
    )
    failed_count = result.scalar() or 0

    if failed_count >= settings.MAX_LOGIN_ATTEMPTS:
        result = await db.execute(
            select(LoginAttempt.attempted_at)
            .where(
                LoginAttempt.identifier == identifier,
                LoginAttempt.success == False,
            )
            .order_by(LoginAttempt.attempted_at.desc())
            .limit(1)
        )
        last_attempt = result.scalar_one_or_none()
        if last_attempt:
            lock_until = last_attempt + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            remaining = (lock_until - datetime.utcnow()).total_seconds()
            if remaining > 0:
                return True, int(remaining)

    return False, 0


async def record_login_attempt(
    db: AsyncSession, identifier: str, ip_address: Optional[str], success: bool
) -> None:
    """记录登录尝试"""
    attempt = LoginAttempt(
        identifier=identifier,
        ip_address=ip_address,
        success=success,
    )
    db.add(attempt)
    await db.flush()


def parse_device(user_agent: Optional[str]) -> Optional[str]:
    """从 User-Agent 解析登录设备信息（操作系统 · 浏览器）"""
    if not user_agent:
        return None
    ua = user_agent

    # 操作系统
    if "Windows NT 10" in ua:
        os_name = "Windows"
    elif "Windows NT" in ua:
        os_name = "Windows"
    elif "iPhone" in ua or "iPad" in ua:
        os_name = "iOS"
    elif "Android" in ua:
        os_name = "Android"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    else:
        os_name = "未知系统"

    # 浏览器（顺序重要：Edg/Chrome/Safari 等存在包含关系）
    if "Edg/" in ua:
        browser = "Edge"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "未知浏览器"

    return f"{os_name} · {browser}"


async def record_login_log(
    db: AsyncSession,
    user_id: Optional[int],
    username: Optional[str],
    ip_address: Optional[str],
    user_agent: Optional[str],
    status: str,
    failure_reason: Optional[str] = None,
) -> None:
    """记录登录日志（成功/失败/登出）

    使用请求会话写入。失败路径下，调用方需在抛出 HTTPException 前调用 db.commit()
    以避免 get_db 回滚导致日志丢失。
    status: success / failure / logout
    """
    try:
        log = LoginLog(
            user_id=user_id,
            username=username,
            ip_address=ip_address,
            device=parse_device(user_agent),
            status=status,
            failure_reason=failure_reason,
        )
        db.add(log)
        await db.flush()
    except Exception as e:
        logger.error(f"登录日志记录失败: {e}")


# ── 短信验证码 ──

async def check_sms_cooldown(db: AsyncSession, phone: str) -> int:
    """检查短信发送冷却时间，返回剩余秒数"""
    result = await db.execute(
        select(SmsVerificationCode.created_at)
        .where(
            SmsVerificationCode.phone == phone,
            SmsVerificationCode.created_at >= (
                datetime.utcnow() - timedelta(seconds=settings.SMS_CODE_COOLDOWN_SECONDS)
            ),
        )
        .order_by(SmsVerificationCode.created_at.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    if last:
        elapsed = (datetime.utcnow() - last).total_seconds()
        remaining = settings.SMS_CODE_COOLDOWN_SECONDS - int(elapsed)
        if remaining > 0:
            return remaining
    return 0


def generate_sms_code() -> str:
    """生成6位短信验证码"""
    return "".join(str(random.randint(0, 9)) for _ in range(6))


async def save_sms_code(db: AsyncSession, phone: str, code: str, purpose: str) -> SmsVerificationCode:
    """保存短信验证码"""
    sms_code = SmsVerificationCode(
        phone=phone,
        code=code,
        purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.SMS_CODE_EXPIRE_MINUTES),
    )
    db.add(sms_code)
    await db.flush()
    return sms_code


async def verify_sms_code(db: AsyncSession, phone: str, code: str, purpose: str) -> bool:
    """验证短信验证码"""
    result = await db.execute(
        select(SmsVerificationCode)
        .where(
            SmsVerificationCode.phone == phone,
            SmsVerificationCode.code == code,
            SmsVerificationCode.purpose == purpose,
            SmsVerificationCode.used == False,
            SmsVerificationCode.expires_at > datetime.utcnow(),
        )
        .order_by(SmsVerificationCode.created_at.desc())
        .limit(1)
    )
    sms_code = result.scalar_one_or_none()
    if sms_code:
        sms_code.used = True
        await db.flush()
        return True
    return False


# ── 输入清理 ──

def sanitize_input(value: str) -> str:
    """清理用户输入，防止 XSS"""
    import html as _html
    return _html.escape(value.strip())
"""邮箱验证码服务"""
import logging
import random
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.header import Header

import aiosmtplib
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.user import EmailVerificationCode

logger = logging.getLogger("uvicorn")


def generate_code() -> str:
    """生成6位数字验证码"""
    return ''.join([str(random.randint(0, 9)) for _ in range(6)])


def _build_email_html(code: str, purpose: str) -> str:
    """构建验证码邮件HTML"""
    purpose_map = {
        "register": "注册",
        "reset_password": "重置密码",
        "login": "登录",
    }
    purpose_text = purpose_map.get(purpose, "验证")
    expire_minutes = settings.EMAIL_CODE_EXPIRE_MINUTES

    return f"""
    <div style="max-width: 500px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">微光问道</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">{purpose_text}验证码</p>
        </div>
        <div style="background: #fff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <p style="color: #333; font-size: 16px; margin: 0 0 20px;">您好，</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                您正在进行<strong>{purpose_text}</strong>操作，验证码为：
            </p>
            <div style="background: #f5f5f7; border-radius: 8px; padding: 24px; text-align: center; margin: 0 0 24px;">
                <span style="font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 8px;">{code}</span>
            </div>
            <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                此验证码将在 <strong style="color: #667eea;">{expire_minutes} 分钟</strong> 内有效，请勿泄露给他人。<br>
                如果您没有进行此操作，请忽略此邮件。
            </p>
        </div>
    </div>
    """


async def send_email_code(
    db: AsyncSession,
    email: str,
    purpose: str = "register",
) -> tuple[bool, str]:
    """
    发送邮箱验证码
    
    Returns:
        tuple[bool, str]: (是否成功, 消息)
    """
    # 检查冷却时间
    cooldown_seconds = settings.EMAIL_CODE_COOLDOWN_SECONDS
    recent = await db.execute(
        select(EmailVerificationCode)
        .where(
            and_(
                EmailVerificationCode.email == email,
                EmailVerificationCode.purpose == purpose,
                EmailVerificationCode.created_at > datetime.utcnow() - timedelta(seconds=cooldown_seconds),
            )
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )
    last_record = recent.scalar_one_or_none()
    if last_record:
        remaining = cooldown_seconds - int((datetime.utcnow() - last_record.created_at).total_seconds())
        if remaining > 0:
            return False, f"验证码发送过于频繁，请 {remaining} 秒后重试"

    # 生成验证码
    code = generate_code()
    expires_at = datetime.utcnow() + timedelta(minutes=settings.EMAIL_CODE_EXPIRE_MINUTES)

    # 保存到数据库
    new_record = EmailVerificationCode(
        email=email,
        code=code,
        purpose=purpose,
        used=False,
        attempt_count=0,
        expires_at=expires_at,
    )
    db.add(new_record)
    await db.commit()

    # 模拟模式
    if settings.EMAIL_SIMULATE:
        logger.info(f"[EMAIL_SIMULATE] 验证码已生成: {email} -> {code} (purpose={purpose})")
        return True, f"验证码已发送（模拟模式）：{code}"

    # 真实发送邮件
    try:
        msg = MIMEText(_build_email_html(code, purpose), "html", "utf-8")
        msg["From"] = Header(f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>", "utf-8")
        msg["To"] = Header(email, "utf-8")
        msg["Subject"] = Header(f"【{settings.SMTP_FROM_NAME}】您的验证码", "utf-8")

        if settings.SMTP_USE_SSL:
            smtp = aiosmtplib.SMTP(hostname=settings.SMTP_HOST, port=settings.SMTP_PORT, use_tls=True)
        else:
            smtp = aiosmtplib.SMTP(hostname=settings.SMTP_HOST, port=settings.SMTP_PORT)

        async with smtp:
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                await smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            await smtp.send_message(msg)

        logger.info(f"验证码邮件已发送: {email} (purpose={purpose})")
        return True, "验证码已发送至您的邮箱"

    except Exception as e:
        logger.error(f"邮件发送失败: {email}, error={e}")
        # 回滚数据库记录
        await db.execute(
            delete(EmailVerificationCode).where(EmailVerificationCode.id == new_record.id)
        )
        await db.commit()
        return False, "邮件发送失败，请稍后重试"


async def verify_email_code(
    db: AsyncSession,
    email: str,
    code: str,
    purpose: str = "register",
) -> tuple[bool, str]:
    """
    验证邮箱验证码
    
    Returns:
        tuple[bool, str]: (是否正确, 消息)
    """
    # 查找未使用、未过期的最新验证码
    result = await db.execute(
        select(EmailVerificationCode)
        .where(
            and_(
                EmailVerificationCode.email == email,
                EmailVerificationCode.purpose == purpose,
                EmailVerificationCode.used == False,
                EmailVerificationCode.expires_at > datetime.utcnow(),
            )
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )
    record = result.scalar()

    if not record:
        return False, "验证码不存在或已过期"

    # 检查尝试次数
    max_attempts = settings.EMAIL_MAX_ATTEMPTS
    if record.attempt_count >= max_attempts:
        record.used = True
        await db.commit()
        return False, "验证码错误次数过多，请重新获取"

    # 验证
    if record.code != code:
        record.attempt_count += 1
        await db.commit()
        remaining = max_attempts - record.attempt_count
        return False, f"验证码错误，还可尝试 {remaining} 次"

    # 验证通过，标记为已使用
    record.used = True
    await db.commit()
    return True, "验证码验证成功"


async def invalidate_email_codes(
    db: AsyncSession,
    email: str,
    purpose: str,
) -> None:
    """使用后作废所有同 purpose 的验证码"""
    from sqlalchemy import update
    await db.execute(
        update(EmailVerificationCode)
        .where(
            and_(
                EmailVerificationCode.email == email,
                EmailVerificationCode.purpose == purpose,
                EmailVerificationCode.used == False,
            )
        )
        .values(used=True)
    )
    await db.commit()

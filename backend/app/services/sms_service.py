"""腾讯云短信服务封装 + 验证码存储校验"""
import logging
import random
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.user import SmsVerificationCode

logger = logging.getLogger("uvicorn.sms")


PURPOSE_TEMPLATE_MAP = {
    "login": settings.TENCENT_SMS_TEMPLATE_LOGIN,
    "register": settings.TENCENT_SMS_TEMPLATE_REGISTER,
    "reset_password": settings.TENCENT_SMS_TEMPLATE_RESET,
}


def _build_tencent_client():
    """构建腾讯云 SMS 客户端"""
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.sms.v20210111 import sms_client

    cred = credential.Credential(
        settings.TENCENTCLOUD_SECRET_ID,
        settings.TENCENTCLOUD_SECRET_KEY,
    )
    http_profile = HttpProfile()
    http_profile.endpoint = "sms.tencentcloudapi.com"
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = sms_client.SmsClient(cred, settings.TENCENT_SMS_REGION, client_profile)
    return client


def generate_sms_code() -> str:
    """生成 6 位短信验证码"""
    return "".join(str(random.randint(0, 9)) for _ in range(6))


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


async def save_sms_code(db: AsyncSession, phone: str, code: str, purpose: str) -> SmsVerificationCode:
    """保存验证码到数据库"""
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
    """验证短信验证码，验证成功后标记为已使用"""
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


async def send_sms_via_tencent(phone: str, code: str, purpose: str) -> None:
    """
    通过腾讯云 SDK 发送短信。
    当 SMS_SIMULATE=true 或凭据未完整配置时，退化为本地模拟发送（仅打印日志）。
    """
    template_id = PURPOSE_TEMPLATE_MAP.get(purpose)
    simulate = settings.SMS_SIMULATE

    if not simulate:
        missing = []
        if not settings.TENCENTCLOUD_SECRET_ID:
            missing.append("TENCENTCLOUD_SECRET_ID")
        if not settings.TENCENTCLOUD_SECRET_KEY:
            missing.append("TENCENTCLOUD_SECRET_KEY")
        if not settings.TENCENT_SMS_SDK_APP_ID:
            missing.append("TENCENT_SMS_SDK_APP_ID")
        if not settings.TENCENT_SMS_SIGN_NAME:
            missing.append("TENCENT_SMS_SIGN_NAME")
        if not template_id:
            missing.append(f"TENCENT_SMS_TEMPLATE_{purpose.upper()}")
        if missing:
            logger.warning(
                "[SMS] 腾讯云短信配置不完整 (%s)，降级为模拟模式。phone=%s purpose=%s code=%s",
                ",".join(missing), phone, purpose, code,
            )
            simulate = True

    if simulate:
        logger.info(
            "[SMS][SIMULATE] 验证码已生成：phone=%s purpose=%s code=%s",
            phone, purpose, code,
        )
        return

    try:
        client = _build_tencent_client()
        from tencentcloud.sms.v20210111 import models as sms_models

        req = sms_models.SendSmsRequest()
        req.SmsSdkAppId = settings.TENCENT_SMS_SDK_APP_ID
        req.SignName = settings.TENCENT_SMS_SIGN_NAME
        req.TemplateId = template_id
        req.TemplateParamSet = [code]
        req.PhoneNumberSet = [f"+86{phone}"]

        resp = client.SendSms(req)
        status = getattr(resp, "SendStatusSet", None) or []
        first = status[0] if status else None
        if first is None:
            raise RuntimeError("腾讯云返回空结果")

        code_val = getattr(first, "Code", "")
        message = getattr(first, "Message", "")
        if code_val != "Ok":
            raise RuntimeError(f"{code_val}: {message}")

        logger.info(
            "[SMS][TENCENT] 发送成功：phone=%s purpose=%s bizid=%s",
            phone, purpose, getattr(first, "BizId", None),
        )
    except Exception as e:
        logger.error(
            "[SMS][TENCENT] 发送失败：phone=%s purpose=%s error=%s",
            phone, purpose, str(e),
        )
        raise RuntimeError(f"短信发送失败：{e}") from e

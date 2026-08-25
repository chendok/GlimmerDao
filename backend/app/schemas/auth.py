"""认证相关 Pydantic 数据模型"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re


# ── 请求模型 ──

class PasswordLoginRequest(BaseModel):
    """邮箱密码登录请求"""
    account: str = Field(..., description="邮箱")
    password: str = Field(..., min_length=6, max_length=40, description="密码")

    @field_validator("account")
    @classmethod
    def validate_account(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("邮箱不能为空")
        if "@" not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v


class PasswordRegisterRequest(BaseModel):
    """邮箱密码注册请求"""
    account: str = Field(..., description="邮箱")
    password: str = Field(..., min_length=8, max_length=40, description="密码")
    verification_code: str = Field(..., min_length=6, max_length=6, description="邮箱验证码")

    @field_validator("account")
    @classmethod
    def validate_account(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("邮箱不能为空")
        if "@" not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("密码必须包含大写字母")
        if not re.search(r"[a-z]", v):
            raise ValueError("密码必须包含小写字母")
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含数字")
        return v

    @field_validator("verification_code")
    @classmethod
    def validate_verification_code(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{6}$", v):
            raise ValueError("验证码必须为6位数字")
        return v


class EmailResetPasswordRequest(BaseModel):
    """重置密码请求（通过邮箱）"""
    account: str = Field(..., description="邮箱")
    new_password: str = Field(..., min_length=8, max_length=40, description="新密码")
    verification_code: str = Field(..., min_length=6, max_length=6, description="邮箱验证码")

    @field_validator("account")
    @classmethod
    def validate_account(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("邮箱不能为空")
        if "@" not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("密码必须包含大写字母")
        if not re.search(r"[a-z]", v):
            raise ValueError("密码必须包含小写字母")
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含数字")
        return v

    @field_validator("verification_code")
    @classmethod
    def validate_verification_code(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{6}$", v):
            raise ValueError("验证码必须为6位数字")
        return v


class SendEmailCodeRequest(BaseModel):
    """发送邮箱验证码请求"""
    email: str = Field(..., description="邮箱地址")
    purpose: str = Field(default="register", description="用途: register/reset_password")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("邮箱不能为空")
        if "@" not in v:
            raise ValueError("请输入有效的邮箱地址")
        return v

    @field_validator("purpose")
    @classmethod
    def validate_purpose(cls, v: str) -> str:
        if v not in ("register", "reset_password", "login"):
            raise ValueError("purpose 必须是 register/reset_password/login")
        return v


# ── 响应模型 ──

class UserInfo(BaseModel):
    """用户信息"""
    id: int
    username: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    gender: Optional[str] = None
    wechat_nickname: Optional[str] = None
    is_verified: bool = False
    is_admin: bool = False
    created_at: Optional[str] = None


class TokenResponse(BaseModel):
    """令牌响应"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserInfo


class MessageResponse(BaseModel):
    """通用消息响应"""
    message: str
    success: bool = True


class SendCodeResponse(BaseModel):
    """发送验证码响应"""
    message: str
    success: bool = True
    cooldown_seconds: int = 0

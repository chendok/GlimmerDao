"""API 依赖与鉴权辅助函数"""
from typing import Optional

from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..services.auth_service import decode_access_token, get_user_by_id
from ..database import get_db


def resolve_user_id_from_auth_header(authorization: Optional[str]) -> Optional[int]:
    """从 Bearer token 中解析 user_id。未提供请求头时返回 None。"""
    if authorization is None:
        return None

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的认证令牌")

    token = authorization[7:]
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌无效或已过期")

    return user_id


def get_optional_user_id(
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> Optional[int]:
    """可选鉴权依赖。匿名请求或无效 token 均返回 None。"""
    if authorization is None:
        return None

    if not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]
    user_id = decode_access_token(token)
    return user_id


async def get_current_user_id(
    authorization: Optional[str] = Header(None, description="Bearer token"),
    db: AsyncSession = Depends(get_db),
) -> int:
    """必需鉴权依赖。缺失/无效/被禁用时返回 401。"""
    user_id = resolve_user_id_from_auth_header(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="缺少认证令牌")
    # 校验用户存在且未被禁用
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="账户已被禁用")
    return user_id


async def get_current_admin_user(
    authorization: Optional[str] = Header(None, description="Bearer token"),
    db: AsyncSession = Depends(get_db),
):
    """管理员鉴权依赖。需认证 + is_admin=True。"""
    user_id = resolve_user_id_from_auth_header(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="缺少认证令牌")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="账户已被禁用")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user

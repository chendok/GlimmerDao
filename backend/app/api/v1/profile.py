"""用户画像 API 路由

提供用户偏好的读取与更新接口，支撑跨会话个性化体验（P2-2）。
匿名用户（无 token）调用将返回 401，因为画像仅对登录用户持久化。
"""
import logging
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_current_user_id
from ...core.agent.profile import profile_manager, VALID_DEPTHS, VALID_STYLES

logger = logging.getLogger(__name__)
router = APIRouter()


class ProfileResponse(BaseModel):
    """用户画像响应"""
    user_id: int
    preferred_depth: str = "detailed"
    preferred_style: str = "professional"
    interested_topics: list[str] = Field(default_factory=list)
    birth_data: Optional[dict[str, Any]] = None
    frequent_skills: list[Any] = Field(default_factory=list)
    feedback_history: list[dict[str, Any]] = Field(default_factory=list)
    total_sessions: int = 0


class ProfileUpdateRequest(BaseModel):
    """用户画像更新请求（所有字段可选）"""
    preferred_depth: Optional[str] = Field(
        None, description=f"回答深度: {VALID_DEPTHS}"
    )
    preferred_style: Optional[str] = Field(
        None, description=f"回答风格: {VALID_STYLES}"
    )
    interested_topics: Optional[list[str]] = Field(
        None, description="感兴趣的话题列表"
    )
    birth_data: Optional[dict[str, Any]] = Field(
        None, description="生辰数据（通常由系统自动从 context_data 提取，也可手动设置）"
    )


class FeedbackRequest(BaseModel):
    """用户反馈请求"""
    rating: int = Field(..., ge=1, le=5, description="评分 1-5")
    comment: Optional[str] = Field(None, max_length=500, description="反馈内容")
    skill_name: Optional[str] = Field(None, description="关联的技能名")


@router.get("/", response_model=ProfileResponse)
async def get_profile(user_id: int = Depends(get_current_user_id)):
    """获取当前用户画像。无记录时返回默认画像。"""
    profile = await profile_manager.get_profile(user_id)
    if profile is None:
        return ProfileResponse(user_id=user_id)
    return ProfileResponse(**profile)


@router.put("/", response_model=ProfileResponse)
async def update_profile(
    req: ProfileUpdateRequest,
    user_id: int = Depends(get_current_user_id),
):
    """更新当前用户画像偏好（部分更新）。"""
    # 枚举值校验
    if req.preferred_depth is not None and req.preferred_depth not in VALID_DEPTHS:
        raise HTTPException(
            status_code=422,
            detail=f"preferred_depth 必须为 {VALID_DEPTHS} 之一",
        )
    if req.preferred_style is not None and req.preferred_style not in VALID_STYLES:
        raise HTTPException(
            status_code=422,
            detail=f"preferred_style 必须为 {VALID_STYLES} 之一",
        )

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    profile = await profile_manager.upsert_profile(user_id, **updates)
    if profile is None:
        profile = await profile_manager.get_profile(user_id) or {"user_id": user_id}
    return ProfileResponse(**profile)


@router.post("/feedback", response_model=ProfileResponse)
async def submit_feedback(
    req: FeedbackRequest,
    user_id: int = Depends(get_current_user_id),
):
    """提交用户反馈（评分/评论），用于长期学习用户偏好。"""
    feedback = {
        "rating": req.rating,
        "comment": req.comment,
        "skill_name": req.skill_name,
    }
    await profile_manager.record_feedback(user_id, feedback)
    profile = await profile_manager.get_profile(user_id) or {"user_id": user_id}
    return ProfileResponse(**profile)


@router.delete("/birth-data", response_model=ProfileResponse)
async def clear_birth_data(user_id: int = Depends(get_current_user_id)):
    """清除缓存的生辰数据（用户希望重新提供生辰时调用）。"""
    await profile_manager.upsert_profile(user_id, birth_data=None)
    profile = await profile_manager.get_profile(user_id) or {"user_id": user_id}
    profile["birth_data"] = None
    return ProfileResponse(**profile)

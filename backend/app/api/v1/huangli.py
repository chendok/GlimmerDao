"""黄历择吉 API"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ...services.huangli_service import huangli_service, DayHuangli, DayBrief, MonthHuangli, FilterResult, ACTIVITY_CATEGORIES

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ── 响应模型 ──

class DayDetailResponse(BaseModel):
    success: bool = True
    data: DayHuangli

    class Config:
        arbitrary_types_allowed = True


class MonthOverviewResponse(BaseModel):
    success: bool = True
    data: MonthHuangli

    class Config:
        arbitrary_types_allowed = True


class FilterResponse(BaseModel):
    success: bool = True
    data: FilterResult

    class Config:
        arbitrary_types_allowed = True


class MultiFilterResponse(BaseModel):
    success: bool = True
    data: dict[str, FilterResult]

    class Config:
        arbitrary_types_allowed = True


class CategoriesResponse(BaseModel):
    success: bool = True
    data: list[dict]


# ── API 路由 ──

@router.get("/day", response_model=DayDetailResponse)
async def get_day_detail(
    year: int = Query(..., ge=1900, le=2100, description="公历年份"),
    month: int = Query(..., ge=1, le=12, description="公历月份"),
    day: int = Query(..., ge=1, le=31, description="公历日"),
):
    """获取指定日期的黄历详情"""
    result = huangli_service.get_day(year, month, day)
    return DayDetailResponse(data=result)


@router.get("/today", response_model=DayDetailResponse)
async def get_today_detail():
    """获取今日黄历详情"""
    today = date.today()
    result = huangli_service.get_day(today.year, today.month, today.day)
    return DayDetailResponse(data=result)


@router.get("/month", response_model=MonthOverviewResponse)
async def get_month_overview(
    year: int = Query(..., ge=1900, le=2100, description="公历年份"),
    month: int = Query(..., ge=1, le=12, description="公历月份"),
):
    """获取某月每日黄历概览"""
    result = huangli_service.get_month(year, month)
    return MonthOverviewResponse(data=result)


@router.get("/filter", response_model=FilterResponse)
async def filter_by_activity(
    year: int = Query(..., ge=1900, le=2100, description="公历年份"),
    month: int = Query(..., ge=1, le=12, description="公历月份"),
    activity: str = Query(..., description="活动类型"),
):
    """按活动筛选某月吉日"""
    if activity not in ACTIVITY_CATEGORIES:
        return FilterResponse(
            success=False,
            data=FilterResult(category=activity, matched_dates=[], total=0),
        )
    result = huangli_service.filter_by_activity(year, month, activity)
    return FilterResponse(data=result)


@router.get("/filter-multi", response_model=MultiFilterResponse)
async def filter_by_multi_activities(
    year: int = Query(..., ge=1900, le=2100, description="公历年份"),
    month: int = Query(..., ge=1, le=12, description="公历月份"),
    activities: str = Query(..., description="活动类型，逗号分隔"),
):
    """批量按多个活动筛选某月吉日"""
    act_list = [a.strip() for a in activities.split(",") if a.strip() in ACTIVITY_CATEGORIES]
    if not act_list:
        return MultiFilterResponse(success=False, data={})
    result = huangli_service.filter_by_activities(year, month, act_list)
    return MultiFilterResponse(data=result)


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories():
    """获取所有活动分类"""
    cats = [
        {"key": k, "label": k, "icon": _category_icon(k), "count": len(v)}
        for k, v in ACTIVITY_CATEGORIES.items()
    ]
    return CategoriesResponse(data=cats)


def _category_icon(cat: str) -> str:
    icons = {
        # 传统活动
        "婚嫁": "heart", "祭祀": "pray", "安葬": "grave", "动土": "tool",
        "入宅": "home", "出行": "plane", "开业": "store", "上官": "briefcase",
        "祈福": "candle", "求嗣": "baby", "入学": "graduate", "裁衣": "scissors",
        "纳采": "ring", "订盟": "handshake", "纳畜": "ox", "开市": "shop",
        "交易": "money", "立券": "document", "挂匾": "label", "拆卸": "wrench",
        "修造": "hammer", "上梁": "construction", "安床": "bed", "安门": "door",
        "作灶": "cooking", "移徙": "truck", "安香": "incense", "沐浴": "bath",
        "剃头": "haircut", "扫舍": "broom",
        # 现代活动
        "领证": "certificate", "签约": "pen", "求职": "bag", "搬家": "box",
        "买车": "car", "提车": "car2", "装修": "art", "谈判": "chat",
        "会友": "users", "求医": "hospital", "栽种": "leaf", "入职": "briefcase",
        "投资": "chart", "购房": "house", "出国": "globe", "出差": "luggage",
        "考试": "book", "面试": "microphone", "答辩": "speech", "晋升": "arrow-up",
        "转行": "refresh", "创业": "rocket", "注册": "building", "专利": "flask",
        "发布": "megaphone", "活动": "party", "直播": "broadcast", "旅游": "beach",
        "健身": "muscle", "美容": "lipstick",
    }
    return icons.get(cat, "calendar")
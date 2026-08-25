"""黄历择吉服务 — 基于 cnlunar 封装"""
import datetime
import logging
from typing import Optional
from dataclasses import dataclass, field, asdict

import cnlunar

logger = logging.getLogger("uvicorn")

# ── 活动分类映射表（用于筛选）──
# 关键词使用 cnlunar 实际产出的传统宜忌词，现代概念映射到最接近的传统事项
# 关键词列表经 cnlunar 2026-08 实际输出验证（68个宜事词）
ACTIVITY_CATEGORIES: dict[str, list[str]] = {
    # ═══ 传统活动（30项，与前端 TRADITIONAL_CATEGORIES 一一对应）═══
    "婚嫁": ["结婚姻", "嫁娶", "纳采", "冠带", "冠笄", "婚姻",
             "问名", "纳吉", "纳征", "请期", "亲迎", "纳婿", "招赘"],
    "祭祀": ["祭祀", "祈福", "酬神", "还愿", "祭祖", "祭天地", "祭灶", "谢土"],
    "安葬": ["安葬", "修坟", "立碑", "成服", "除服", "移柩", "启攒",
             "破土", "行丧", "安厝", "入殓"],
    "动土": ["修造", "动土", "起基", "竖柱", "上梁", "盖屋", "安门", "作灶",
             "修仓库", "修置产室", "修宫室", "营建", "缮城郭", "开渠", "穿井",
             "筑堤", "修桥", "修路", "补垣", "塞穴", "修饰垣墙", "平治道涂"],
    "入宅": ["入宅", "搬移", "移徙", "迁徙", "移居"],
    "出行": ["出行", "远行", "赴任", "出国"],
    "开业": ["开市", "开张", "开市立券", "立券", "交易", "纳财", "开仓",
             "开仓库", "出货财", "求财", "置产", "挂匾"],
    "上官": ["上官", "赴任", "上任", "就职", "到任", "莅任", "就任"],
    "祈福": ["祈福", "祭祀", "酬神", "还愿", "谢土"],
    "求嗣": ["求嗣"],
    "入学": ["入学", "求师", "拜师", "学艺", "习艺", "进学", "启蒙"],
    "裁衣": ["裁制", "裁衣", "经络"],
    "纳采": ["纳采", "结婚姻", "问名", "纳吉", "订盟"],
    "订盟": ["订盟", "纳采", "结婚姻", "问名", "纳吉"],
    "纳畜": ["纳畜", "牧养"],
    "开市": ["开市", "开张", "开市立券", "立券交易"],
    "交易": ["交易", "立券交易", "纳财"],
    "立券": ["立券", "立券交易", "交易", "纳财"],
    "挂匾": ["挂匾", "开市", "纳财", "开张"],
    "拆卸": ["拆卸", "破屋坏垣", "补垣", "塞穴"],
    "修造": ["修造", "修宫室", "修置产室", "营建", "缮城郭",
             "修饰垣墙", "补垣", "塞穴"],
    "上梁": ["上梁", "竖柱上梁", "竖柱"],
    "安床": ["安床", "设床", "安床设帐", "安床铺床", "设帐"],
    "安门": ["安门", "修造", "修宫室", "营建"],
    "作灶": ["作灶", "安碓硙", "修造"],
    "移徙": ["移徙", "搬移", "迁徙", "移居"],
    "安香": ["安香", "祭祀", "祈福"],
    "沐浴": ["沐浴"],
    "剃头": ["剃头", "整容", "整手足甲"],
    "扫舍": ["扫舍", "扫舍宇", "解除"],

    # ═══ 现代活动（30项，与前端 MODERN_CATEGORIES 一一对应）═══
    "领证": ["纳采", "订盟", "问名", "纳吉", "请期", "结婚姻"],
    "签约": ["立券", "交易", "订盟", "纳财", "立券交易"],
    "求职": ["赴任", "上任", "就职", "到任", "莅任", "就任",
             "求仕", "求官", "上官"],
    "搬家": ["移徙", "搬移", "入宅", "迁徙", "移居"],
    "买车": ["交易", "纳财", "纳畜", "置产", "立券交易"],
    "提车": ["交易", "纳财", "出行", "纳畜", "立券交易"],
    "装修": ["修饰垣墙", "修造", "拆卸", "修葺", "修整", "修补",
             "补垣", "破屋坏垣", "修宫室", "营建"],
    "谈判": ["会宾客", "会亲友", "会商", "宴客", "招贤", "宴会"],
    "会友": ["会亲友", "会宾客", "宴客", "招贤", "接客", "宴会"],
    "求医": ["求医疗病", "治病", "服药", "针灸", "施药", "诊病"],
    "栽种": ["栽种", "种植", "播种", "牧养"],
    "入职": ["赴任", "上任", "就职", "到任", "莅任", "就任", "上官"],
    "投资": ["纳财", "求财", "开仓", "纳畜", "置产"],
    "购房": ["纳财", "置产", "入宅", "搬移", "移徙"],
    "出国": ["出行", "远行", "出国", "赴任"],
    "出差": ["出行", "远行", "赴任"],
    "考试": ["入学", "求师", "拜师", "学艺", "习艺", "进学", "启蒙"],
    "面试": ["招贤", "上官", "赴任", "上任", "就职"],
    "答辩": ["诉讼", "上表章", "颁诏", "雪冤"],
    "晋升": ["上官", "赴任", "上任", "就职", "到任", "莅任", "就任",
             "庆赐", "施恩", "覃恩"],
    "转行": ["求师", "拜师", "学艺", "习艺", "入学"],
    "创业": ["开市", "立券交易", "纳财", "开张", "开仓"],
    "注册": ["立券交易", "纳财", "立券", "交易"],
    "专利": ["颁诏", "上表章", "覃恩"],
    "发布": ["颁诏", "宣政事", "布政事", "上表章"],
    "活动": ["宴会", "招贤", "会亲友", "会宾客", "宴客", "庆赐"],
    "直播": ["宣政事", "布政事", "颁诏", "上表章"],
    "旅游": ["出行", "远行", "出国"],
    "健身": ["整手足甲", "沐浴", "整容", "剃头"],
    "美容": ["整容", "剃头", "整手足甲", "沐浴"],
}


def _match_activity(things: list[str], category: str) -> bool:
    """检查宜事列表中是否包含与活动类别匹配的传统宜忌词（双向子串匹配）"""
    keywords = ACTIVITY_CATEGORIES.get(category, [])
    for thing in things:
        for kw in keywords:
            if kw == thing or kw in thing or thing in kw:
                return True
    return False


# cnlunar levelDic 共 7 档：-1(无)/0(上吉)/1(上次)/2(中)/3(中次)/4(下)/5(下下)
# thingLevelDic 受 isDe 修正：有德神时凶日可从宜，无德神时吉不抵凶应降级
_LEVEL_TO_LABEL: dict[int, str] = {
    -1: "平",   # 无等级信息
    0:  "吉",  # 上：吉足胜凶
    1:  "吉",  # 上次：吉足抵凶
    2:  "平",  # 中：吉不抵凶（默认降为平，不作吉日推荐）
    3:  "凶",  # 中次：凶胜于吉
    4:  "凶",  # 下：凶又逢凶
    5:  "凶",  # 下下：凶叠大凶（不受德神影响）
}


def _compute_day_level(level: int, is_de: bool) -> str:
    """将 cnlunar 的 level 转换为统一等级标识（吉/凶/平）

    修正点：
    - level 0（上吉）正确映射为"吉"（原误标"平"）
    - level 2（吉不抵凶）降为"平"（原误标"吉"）
    - level 5（下下大凶）映射为"凶"（原误标"平"）
    - 有德神时 level 3/4 的凶日可降为"平"（从宜不从忌）
    - level 5（下下大凶）不受德神影响，始终为"凶"
    """
    base = _LEVEL_TO_LABEL.get(level, "平")
    if base == "凶" and is_de and level < 5:
        return "平"
    return base


@dataclass
class DayHuangli:
    """单日黄历信息"""
    date: str
    lunar_year: str
    lunar_month: str
    lunar_day: str
    year_ganzhi: str
    month_ganzhi: str
    day_ganzhi: str
    weekday: str
    zodiac: str
    clash: str
    level: int
    level_name: str
    level_label: str          # 吉/凶/平
    thing_level: str
    good_things: list[str]
    bad_things: list[str]
    good_gods: list[str]
    bad_gods: list[str]
    day_officer: str          # 建除十二神
    day_god: str              # 十二神（青龙/明堂等）
    star_28: str              # 二十八星宿
    solar_term: str
    elements: str
    peng_taboo: str
    lucky_directions: list[str]
    fetal_god: str
    nayin: str
    season: str
    next_solar_term: str
    next_solar_term_date: str
    zodiac_mark6: str         # 六合
    zodiac_mark3: list[str]   # 三合
    is_de: bool               # 是否有德神
    twohour_list: list[dict]  # 时辰吉凶
    is_year_god_duty: bool    # 是否岁德值班


@dataclass
class DayBrief:
    """单日黄历简要信息（用于月历概览）"""
    date: str
    lunar_day: str
    weekday: str
    level_label: str
    solar_term: str
    day_officer: str
    day_ganzhi: str
    good_things: list[str]   # 仅前3条
    bad_things: list[str]    # 仅前3条


@dataclass
class MonthHuangli:
    """月份黄历概览"""
    year: int
    month: int
    month_days: int
    lunar_month_info: str
    days: list[DayBrief] = field(default_factory=list)


@dataclass
class FilterResult:
    """活动筛选结果"""
    category: str
    matched_dates: list[str]
    total: int


class HuangliService:
    """黄历服务"""

    def get_day(self, year: int, month: int, day: int, hour: int = 12) -> DayHuangli:
        """获取指定日期的黄历详情"""
        dt = datetime.datetime(year, month, day, hour)
        lunar = cnlunar.Lunar(dt, godType="8char")
        return self._build_day(lunar)

    def get_month(self, year: int, month: int) -> MonthHuangli:
        """获取某月每日黄历概览（轻量版）"""
        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        month_info = MonthHuangli(year=year, month=month, month_days=days_in_month, lunar_month_info="")

        for d in range(1, days_in_month + 1):
            dt = datetime.datetime(year, month, d, 12)
            lunar = cnlunar.Lunar(dt, godType="8char")
            if d == 1:
                month_info.lunar_month_info = f"{lunar.lunarYearCn} {lunar.lunarMonthCn}"
            month_info.days.append(self._build_brief(lunar))

        return month_info

    def filter_by_activity(self, year: int, month: int, activity: str) -> FilterResult:
        """按活动筛选某月中的吉日（仅返回吉日与平日，凶日不推荐）"""
        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        matched: list[str] = []

        for d in range(1, days_in_month + 1):
            dt = datetime.datetime(year, month, d, 12)
            lunar = cnlunar.Lunar(dt, godType="8char")
            label = _compute_day_level(lunar.todayLevel, lunar.isDe)
            # 凶日跳过，不作吉日推荐
            if label == "凶":
                continue
            # 使用完整的宜事列表（非 _build_brief 的 [:3] 截断版）
            if _match_activity(lunar.goodThing, activity):
                matched.append(lunar.date.strftime("%Y-%m-%d"))

        return FilterResult(category=activity, matched_dates=matched, total=len(matched))

    def filter_by_activities(self, year: int, month: int, activities: list[str]) -> dict[str, FilterResult]:
        """批量按多个活动筛选"""
        return {act: self.filter_by_activity(year, month, act) for act in activities}

    def _build_brief(self, lunar: cnlunar.Lunar) -> DayBrief:
        """内部方法：构建轻量 DayBrief"""
        return DayBrief(
            date=lunar.date.strftime("%Y-%m-%d"),
            lunar_day=lunar.lunarDayCn,
            weekday=lunar.weekDayCn,
            level_label=_compute_day_level(lunar.todayLevel, lunar.isDe),
            solar_term=lunar.todaySolarTerms or "无",
            day_officer=lunar.today12DayOfficer,
            day_ganzhi=lunar.day8Char,
            good_things=lunar.goodThing[:3],
            bad_things=lunar.badThing[:3],
        )

    def _build_day(self, lunar: cnlunar.Lunar) -> DayHuangli:
        """内部方法：构建 DayHuangli"""
        # 时辰吉凶
        twohour_list = []
        for i, (ch, lucky) in enumerate(zip(lunar.twohour8CharList, lunar.get_twohourLuckyList())):
            twohour_list.append({
                "hour": i,
                "ganzhi": ch,
                "lucky": lucky == "吉",
            })

        return DayHuangli(
            date=lunar.date.strftime("%Y-%m-%d"),
            lunar_year=lunar.lunarYearCn,
            lunar_month=lunar.lunarMonthCn,
            lunar_day=lunar.lunarDayCn,
            year_ganzhi=lunar.year8Char,
            month_ganzhi=lunar.month8Char,
            day_ganzhi=lunar.day8Char,
            weekday=lunar.weekDayCn,
            zodiac=lunar.chineseYearZodiac,
            clash=lunar.chineseZodiacClash,
            level=lunar.todayLevel,
            level_name=lunar.todayLevelName,
            level_label=_compute_day_level(lunar.todayLevel, lunar.isDe),
            thing_level=lunar.thingLevelName,
            good_things=lunar.goodThing,
            bad_things=lunar.badThing,
            good_gods=lunar.goodGodName,
            bad_gods=lunar.badGodName,
            day_officer=lunar.today12DayOfficer,
            day_god=lunar.today12DayGod,
            star_28=lunar.today28Star,
            solar_term=lunar.todaySolarTerms or "无",
            elements=" ".join(lunar.get_today5Elements()),
            peng_taboo=lunar.get_pengTaboo(),
            lucky_directions=lunar.get_luckyGodsDirection(),
            fetal_god=lunar.get_fetalGod(),
            nayin=lunar.get_nayin(),
            season=lunar.get_season(),
            next_solar_term=lunar.nextSolarTerm,
            next_solar_term_date=f"{lunar.nextSolarTermYear}-{lunar.nextSolarTermDate[0]:02d}-{lunar.nextSolarTermDate[1]:02d}" if lunar.nextSolarTermDate else "",
            zodiac_mark6=lunar.zodiacMark6,
            zodiac_mark3=lunar.zodiacMark3List,
            is_de=lunar.isDe,
            twohour_list=twohour_list,
            is_year_god_duty=lunar.isYeargodDuty,
        )


huangli_service = HuangliService()
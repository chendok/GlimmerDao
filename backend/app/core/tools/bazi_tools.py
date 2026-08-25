"""
工具系统 - 实现 Claude Code 风格的工具定义

每个工具遵循 Tool Protocol：
- name: 工具名称
- description: 工具描述（LLM 据此选择工具）
- parameters: 参数 schema
- execute: 执行逻辑
"""

import json

from langchain_core.tools import tool


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 八字排盘工具
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool
def bazi_calculate(
    birth_date: str,
    birth_hour: int,
    gender: str,
    calendar_type: str = "solar",
) -> str:
    """
    八字排盘工具 - 计算用户的四柱八字。

    参数:
    - birth_date: 出生日期，格式 YYYY-MM-DD
    - birth_hour: 出生时辰，0-23 的小时数
    - gender: 性别，"male" 或 "female"
    - calendar_type: 历法类型，"solar"（公历）或 "lunar"（农历）

    返回: 包含四柱、十神、五行、大运、流年等完整八字分析结果。
    """
    try:
        from lunar_python import Solar, Lunar

        year, month, day = map(int, birth_date.split("-"))

        if calendar_type == "solar":
            solar = Solar.fromYmdHms(year, month, day, birth_hour, 0, 0)
            lunar = solar.getLunar()
        else:
            lunar = Lunar.fromYmd(year, month, day)
            solar = lunar.getSolar()

        eight_char = lunar.getEightChar()

        # 时辰对照表
        shichen = [
            "子时", "丑时", "丑时", "寅时", "寅时", "卯时", "卯时",
            "辰时", "辰时", "巳时", "巳时", "午时", "午时",
            "未时", "未时", "申时", "申时", "酉时", "酉时",
            "戌时", "戌时", "亥时", "亥时", "子时",
        ]

        result = {
            "birth_info": {
                "date": birth_date,
                "hour": birth_hour,
                "shichen": shichen[birth_hour] if birth_hour < 24 else "子时",
                "gender": gender,
                "calendar_type": calendar_type,
                "lunar_date": f"{lunar.getYear()}年{lunar.getMonthInChinese()}月{lunar.getDayInChinese()}日",
                "solar_date": solar.toFullString(),
            },
            "pillars": {
                "year": {
                    "pillar": eight_char.getYear(),
                    "gan": eight_char.getYearGan(),
                    "zhi": eight_char.getYearZhi(),
                    "hidden_gan": eight_char.getYearHideGan(),
                    "shi_shen": eight_char.getYearShiShenGan(),
                },
                "month": {
                    "pillar": eight_char.getMonth(),
                    "gan": eight_char.getMonthGan(),
                    "zhi": eight_char.getMonthZhi(),
                    "hidden_gan": eight_char.getMonthHideGan(),
                    "shi_shen": eight_char.getMonthShiShenGan(),
                },
                "day": {
                    "pillar": eight_char.getDay(),
                    "gan": eight_char.getDayGan(),
                    "zhi": eight_char.getDayZhi(),
                    "hidden_gan": eight_char.getDayHideGan(),
                    "shi_shen": "日主",
                },
                "hour": {
                    "pillar": eight_char.getTime(),
                    "gan": eight_char.getTimeGan(),
                    "zhi": eight_char.getTimeZhi(),
                    "hidden_gan": eight_char.getTimeHideGan(),
                    "shi_shen": eight_char.getTimeShiShenGan(),
                },
            },
            "day_master": {
                "gan": eight_char.getDayGan(),
                "element": eight_char.getDayWuXing(),
                "yin_yang": "阳" if eight_char.getDayGan() in ["甲", "丙", "戊", "庚", "壬"] else "阴",
            },
            "analysis": {
                "overview": f"日主{get_day_master_description(eight_char.getDayGan())}",
                "wuxing_hint": f"五行属{eight_char.getDayWuXing()}",
            },
        }

        return f"八字排盘结果：\n{json.dumps(result, ensure_ascii=False, indent=2)}"

    except ImportError:
        return "八字排盘模块未安装。请安装 lunar-python 库。"
    except Exception as e:
        return f"八字排盘计算错误：{str(e)}"


@tool
def knowledge_search(query: str, category: str = "all") -> str:
    """
    知识库搜索工具 - 搜索八字命理知识库。

    参数:
    - query: 搜索关键词
    - category: 分类，可选 "basic"（基础）、"advanced"（进阶）、"case"（案例）、"all"（全部）

    返回: 匹配的知识内容。
    """
    knowledge_base = {
        "八字入门": "八字，又称四柱命理，是以出生年月日时的天干地支推算命运的术数。年柱、月柱、日柱、时柱各由一个天干和一个地支组成，共八个字。",
        "天干": "十天干：甲、乙、丙、丁、戊、己、庚、辛、壬、癸。其中甲丙戊庚壬为阳干，乙丁己辛癸为阴干。",
        "地支": "十二地支：子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥。对应十二生肖。",
        "五行": "五行：木、火、土、金、水。相生：木生火、火生土、土生金、金生水、水生木。相克：木克土、土克水、水克火、火克金、金克木。",
        "十神": "十神包括：比肩、劫财、食神、伤官、偏财、正财、七杀、正官、偏印、正印。十神由日主与其他天干的关系决定。",
        "格局": "常见格局：正官格、七杀格、食神格、伤官格、正印格、偏印格、正财格、偏财格、建禄格、羊刃格等。",
        "大运": "大运每十年一换，阳男阴女顺排，阴男阳女逆排。起运年龄由出生日到下一个节气（或上一个节气）的天数计算。",
        "流年": "流年即每年的运势，通过流年天干地支与八字原局的相互作用来分析当年吉凶。",
    }

    results = []
    for title, content in knowledge_base.items():
        if query.lower() in title.lower() or query.lower() in content.lower():
            results.append(f"【{title}】\n{content}")

    if not results:
        return f"未找到与「{query}」相关的知识内容。请尝试其他关键词。"

    return "\n\n".join(results[:3])


@tool
def web_search(query: str) -> str:
    """
    网络搜索工具 - 搜索互联网获取最新信息。

    参数:
    - query: 搜索关键词

    返回: 搜索结果摘要（标题、URL、摘要）。
    """
    try:
        from duckduckgo_search import DDGS

        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=5):
                results.append(
                    f"【{r.get('title', '无标题')}】\n"
                    f"URL: {r.get('href', '')}\n"
                    f"摘要: {r.get('body', '')}"
                )

        if not results:
            return f"网络搜索「{query}」：未找到相关结果。"

        return (
            f"网络搜索「{query}」结果（共 {len(results)} 条）：\n\n"
            + "\n\n".join(results)
        )
    except ImportError:
        return "搜索模块未安装。请运行: pip install duckduckgo-search"
    except Exception as e:
        return f"网络搜索失败：{str(e)}"


@tool
def web_fetch(url: str) -> str:
    """
    网页抓取工具 - 获取指定 URL 的网页内容并提取文本。

    参数:
    - url: 要抓取的网页 URL

    返回: 网页文本内容（最多 3000 字）。
    """
    try:
        import httpx

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        response = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
        response.raise_for_status()

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, "html.parser")

        # 移除 script/style/nav/footer 等非内容元素
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        # 压缩空白行
        import re
        text = re.sub(r"\n{3,}", "\n\n", text)

        if len(text) > 3000:
            text = text[:3000] + "\n\n...（内容过长，已截断）"

        return f"网页「{url}」内容：\n\n{text}" if text.strip() else f"网页「{url}」无有效文本内容。"

    except ImportError as e:
        return f"抓取模块未安装：{e}"
    except Exception as e:
        return f"网页抓取失败：{str(e)}"


@tool
def get_current_time() -> str:
    """
    获取当前时间工具 - 返回当前日期、时间和节气信息。

    返回: 当前时间的详细信息。
    """
    from datetime import datetime

    now = datetime.now()
    return f"当前时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}，星期{['一','二','三','四','五','六','日'][now.weekday()]}"


def get_day_master_description(gan: str) -> str:
    """获取日主描述"""
    descriptions = {
        "甲": "甲木参天，正直仁慈，有上进心，如参天大树。",
        "乙": "乙木柔顺，温和善良，适应力强，如藤萝花草。",
        "丙": "丙火太阳，热情开朗，表现欲强，如烈日当空。",
        "丁": "丁火灯烛，温和内敛，心思细腻，如烛光之火。",
        "戊": "戊土大地，厚重诚实，包容大度，如广袤大地。",
        "己": "己土田园，温和包容，细心周到，如田园之土。",
        "庚": "庚金刀剑，刚毅果断，执行力强，如刀剑之锋。",
        "辛": "辛金珠宝，精致细腻，审美独到，如珠宝之贵。",
        "壬": "壬水江河，聪明灵活，胸怀宽广，如江河奔流。",
        "癸": "癸水雨露，细腻敏感，智慧深邃，如雨露滋润。",
    }
    return descriptions.get(gan, f"日主为{gan}，具有独特的个性特质。")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 工具注册表
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 对话框与报告生成可用的工具集。
# 仅保留核心排盘工具；不注入日期、联网搜索、知识检索等工具，
# 避免 Agent 在对话/报告中额外调用「当前日期」「搜索相关知识」等非必要能力。
ALL_TOOLS = [
    bazi_calculate,
]

TOOL_DESCRIPTIONS = {
    t.name: t.description for t in ALL_TOOLS
}
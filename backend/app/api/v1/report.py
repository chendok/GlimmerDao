"""解盘报告 API — 生成、保存、查看、下载、删除"""
import json
import re
from urllib.parse import quote
import asyncio
import traceback
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import StreamingResponse, Response
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_current_user_id, get_optional_user_id, resolve_user_id_from_auth_header
from ...database import get_db
from ...models.user import BaziReport, BaziArchive
from ...core.skills import get_skill_manager
from ...core.agent.prompts import SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT, load_report_system_prompt
from ...services.auth_service import get_user_by_id
from ...services.name_analysis import format_name_analysis

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ── 报告生成指令构建 ──


def _assemble_full_system_prompt(
    skill_prompt: str = "",
    outline: list[dict] | None = None,
    base_prompt: str | None = None,
) -> str:
    """构建完整 System Prompt（与 harness._build_effective_system_prompt 一致）

    供前端"复制提示词"功能使用，完整还原发送给 LLM 的 System Prompt 内容。
    报告生成场景使用 base_prompt（默认为 REPORT_SYSTEM_PROMPT 常量，可由 DB 加载覆盖）。

    注意：outline 已在用户消息中作为「报告目录结构」提供，此处不再重复渲染以节省 token。
    """
    parts = [base_prompt or REPORT_SYSTEM_PROMPT]
    if skill_prompt:
        parts.append(f"\n\n## 当前任务指南\n{skill_prompt}")
    return "\n".join(parts)


def _render_outline_for_prompt(outline: list[dict], depth: int = 0) -> str:
    """将 outline 树渲染为与 harness._render_outline_to_prompt 一致的 Markdown 文本"""
    if not outline:
        return ""

    lines: list[str] = []
    for idx, node in enumerate(outline, start=1):
        indent = "  " * depth
        title = node.get("title", "")
        lines.append(f"{indent}{idx}. {title}")
        children = node.get("children") or []
        if children:
            child_md = _render_outline_for_prompt(children, depth + 1)
            if child_md:
                lines.append(child_md)
    rendered = "\n".join(lines)
    if not rendered:
        return ""
    return (
        "\n\n## 报告目录结构（用户自定义，必须严格按此结构生成）\n"
        "请严格按照以下目录结构组织报告章节。可在每个章节下自由展开内容，"
        "但顶层章节标题、顺序、嵌套层级必须与此结构一致，不得增减顶层章节：\n\n"
        f"{rendered}"
    )


def _render_outline_to_markdown(outline: list[dict], depth: int = 0) -> str:
    """
    递归将 outline 树渲染为 Markdown 嵌套有序列表。

    格式：
        1. 命局基础分析
           1.1 过三关
               1.1.1 分清日元强弱
               ...
    """
    if not outline:
        return ""
    lines: list[str] = []
    for idx, node in enumerate(outline, start=1):
        # 用缩进表达层级，每层编号从 1 重新计起
        indent = "  " * depth
        title = node.get("title", "")
        lines.append(f"{indent}{idx}. {title}")
        children = node.get("children") or []
        if children:
            child_md = _render_outline_to_markdown(children, depth + 1)
            if child_md:
                lines.append(child_md)
    return "\n".join(lines)


# ── 策略3：共享基础信息提取 ──


def _extract_base_info_digest(context_data: str) -> str:
    """从排盘上下文数据中提取关键基础信息，生成紧凑摘要。

    确保所有章节使用统一的基础信息解读，避免重复解析和不一致。
    从 analysis 预计算字段提取：日主旺衰、用神、喜忌、格局、五行等。
    """
    import re as _re
    import json as _json

    if not context_data:
        return ""

    # 尝试从上下文数据中提取 JSON 块
    json_str = ""
    json_match = _re.search(r'```json\s*(.*?)\s*```', context_data, _re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # 尝试直接解析
        try:
            _json.loads(context_data)
            json_str = context_data
        except (_json.JSONDecodeError, TypeError):
            # 尝试查找 JSON 块
            brace_match = _re.search(r'\{.*\}', context_data, _re.DOTALL)
            if brace_match:
                json_str = brace_match.group(0)

    if not json_str:
        return ""

    try:
        data = _json.loads(json_str)
    except (_json.JSONDecodeError, TypeError):
        return ""

    analysis = data.get("analysis") or data.get("Analysis") or {}
    # analysis 可选（部分排盘类型无预计算分析），但五行标准表仍需注入
    if not analysis and not data.get("wuXingBreakdown"):
        return ""

    digest_parts: list[str] = []

    # 日主旺衰
    dm = analysis.get("dayMasterStrength") or {}
    if dm:
        level = dm.get("level", "")
        score = dm.get("score", "")
        digest_parts.append(f"日主旺衰：{level}（评分 {score}）")

    # 用神
    ys = analysis.get("yongShen") or {}
    if ys:
        categories = ys.get("categories") or {}
        yong = categories.get("yongShen", "")
        xi = categories.get("xiShen", "")
        ji = categories.get("jiShen", "")
        chou = categories.get("chouShen", "")
        if yong:
            digest_parts.append(f"用神：{yong}")
        if xi:
            digest_parts.append(f"喜神：{xi}")
        if ji:
            digest_parts.append(f"忌神：{ji}")
        if chou:
            digest_parts.append(f"仇神：{chou}")

    # 格局
    gj = analysis.get("geJuInfo") or {}
    if gj:
        name = gj.get("name", "")
        success = gj.get("success", "")
        digest_parts.append(f"格局：{name}（{'成格' if success else '破格'}）")

    # 命局层次
    mj = analysis.get("mingJuLevel") or {}
    if mj:
        level = mj.get("level", "")
        score = mj.get("score", "")
        digest_parts.append(f"命局层次：{level}（评分 {score}）")

    # 调候
    th = analysis.get("tiaoHou") or {}
    if th:
        season = th.get("season", "")
        need = th.get("need", "")
        if need:
            digest_parts.append(f"调候：{season}月，需{need}")

    # 五行流通
    wxf = analysis.get("wuXingFlow") or {}
    if wxf:
        path = wxf.get("path", "")
        blocked = wxf.get("blocked", False)
        digest_parts.append(f"五行流通：{'阻塞' if blocked else '通畅'}，路径 {path}")

    # 十神力量排序（取前3）
    ssp = analysis.get("shiShenPower") or []
    if ssp and isinstance(ssp, list):
        top3 = ssp[:3]
        power_str = "、".join(
            f"{item.get('name', '')}({item.get('power', '')})"
            for item in top3 if isinstance(item, dict)
        )
        if power_str:
            digest_parts.append(f"十神力量前三：{power_str}")

    # 核心十神组合
    ssc = analysis.get("shiShenCombination") or []
    if ssc and isinstance(ssc, list):
        combos = [item.get("name", "") for item in ssc if isinstance(item, dict) and item.get("isCore")]
        if combos:
            digest_parts.append(f"核心十神组合：{'、'.join(combos)}")

    # 四柱干支
    bazi = data.get("bazi") or data.get("sizhu") or {}
    if bazi:
        year_gz = bazi.get("year_ganzhi") or bazi.get("year", "")
        month_gz = bazi.get("month_ganzhi") or bazi.get("month", "")
        day_gz = bazi.get("day_ganzhi") or bazi.get("day", "")
        hour_gz = bazi.get("hour_ganzhi") or bazi.get("hour", "")
        if year_gz or month_gz or day_gz or hour_gz:
            digest_parts.append(f"四柱：{year_gz} {month_gz} {day_gz} {hour_gz}")

    # 五行力量分布标准表（引用 wuXingBreakdown，禁止 LLM 自行拆解计算）
    wxb = data.get("wuXingBreakdown") or {}
    if isinstance(wxb, dict) and wxb.get("金") is not None:
        digest_parts.append(
            "五行力量分布标准表（报告 1.2 节表格数值必须与此完全一致，禁止自行计算）："
            + "；".join(
                f"{wx}：天干{wxb[wx]['gan']}、地支本气{wxb[wx]['zhiBenQi']}、"
                f"藏干{wxb[wx]['zhiCangGan']}、综合{wxb[wx]['total']}"
                for wx in ("金", "木", "水", "火", "土")
                if isinstance(wxb.get(wx), dict)
            )
        )

        # 印星强弱确定性说明：日主为X，印星=生X者，其综合分值决定「印旺/印弱」，
        # 禁止 LLM 凭感觉写「印旺」与五行分布数据矛盾。
        dm_wx = (data.get("dayMaster") or {}).get("wuXing") or (dm or {}).get("wuXing") or ""
        # 生X者（印星）映射：木生火、火生土、土生金、金生水、水生木
        sheng_map = {"木": "水", "火": "木", "土": "火", "金": "土", "水": "金"}
        if dm_wx in sheng_map:
            yin_wx = sheng_map[dm_wx]
            yin_total = (wxb.get(yin_wx) or {}).get("total", 0)
            if isinstance(yin_total, (int, float)):
                yin_desc = "强" if yin_total >= 4 else "弱"
                digest_parts.append(
                    f"印星强弱（确定性）：日主为{dm_wx}，印星为{yin_wx}，其综合分值为"
                    f"{yin_total}，属{yin_desc}。报告中所有「印旺/印弱/印星有力/印星无力」"
                    f"表述必须与此一致，禁止写与「印{yin_desc}」相反的措辞（如印星仅{yin_total}分"
                    f"却写「印旺」）"
                )

    # 完整大运列表（含精确起止年龄与公历年份），供报告「大运总览/重大转折期」等章节
    # 直接引用，避免 LLM 自行推算年份（如「48岁=2021年」这类错误）。
    # 独立于 digest_parts 收集，确保即使其他分析字段缺失也能注入大运年份表。
    dayun = data.get("daYun") or data.get("daXian")
    if isinstance(dayun, list) and dayun:
        dayun_lines = []
        for dy in dayun:
            if not isinstance(dy, dict):
                continue
            gz = dy.get("ganZhi") or f"{dy.get('gan', '')}{dy.get('zhi', '')}"
            sa = dy.get("startAge", "")
            ea = dy.get("endAge", "")
            sy = dy.get("startYear", "")
            ey = dy.get("endYear", "")
            year_part = f"（{sy}-{ey}年）" if sy and ey else ""
            zx = dy.get("zhuXing") or ""
            dayun_lines.append(f"{sa}-{ea}岁{year_part} {gz}{(' ' + zx) if zx else ''}")
        if dayun_lines:
            digest_parts.append(
                "【大运精确年份表】起运年龄约8岁（每步大运10年），各步大运起止年龄与公历年份如下，"
                "报告中所有大运年份必须与此表严格一致，禁止自行推算：\n"
                + "\n".join(dayun_lines)
            )

    # 姓名学确定性数据（康熙笔画、五格数理、三才配置、姓名五行）
    # 报告「姓名分析」章节必须引用此数据，禁止 LLM 自行猜测康熙笔画/五行/五格/三才。
    # 仅八字报告含「姓名分析」章节，限定 chartType=八字 时注入。
    chart_type = data.get("chartType") or ""
    person_name = (
        (data.get("basicInfo") or {}).get("name")
        or (data.get("personInfo") or {}).get("name")
        or ""
    )
    if chart_type == "八字" and person_name:
        name_digest = format_name_analysis(person_name)
        if name_digest:
            digest_parts.append(
                "【姓名学确定性数据】报告「姓名分析」章节的康熙笔画、各字的偏旁五行/"
                "字义五行/音韵五行/综合五行、五格数理、三才配置必须严格引用下表，"
                "禁止自行猜测或重新计算：\n"
                + name_digest
            )

    if not digest_parts:
        return ""

    # 运限选中焦点（排盘界面中用户选中的大运/大限/流年/流月/流日/流时）
    # 报告第四部分必须围绕选中焦点展开分析，而非自动使用当前时间
    # 八字使用 daYun，紫微斗数使用 daXian——字段名不同但含义相同
    sf = data.get("selectedFocus") or {}
    if isinstance(sf, dict) and sf:
        # 大运/大限（兼用八字 daYun 和紫微 daXian）
        ds = sf.get("daYun") or sf.get("daXian")
        if ds:
            age_range = f"{ds.get('startAge', '')}-{ds.get('endAge', '')}岁"
            if ds.get("startYear"):
                age_range += f"（{ds.get('startYear', '')}-{ds.get('endYear', '')}年）"
            gz = ds.get("ganZhi") or f"{ds.get('gan', '')}{ds.get('zhi', '')}"
            extra = ""
            if ds.get("zhuXing"): extra += f" 主星[{ds['zhuXing']}]"
            if ds.get("fuXing"): extra += f" 辅星[{ds['fuXing']}]"
            if ds.get("gongName"): extra += f" 宫位{ds['gongName']}"
            if ds.get("wuXing"): extra += f" 五行{ds['wuXing']}"
            digest_parts.append(
                f"【选中大运/大限】{age_range} {gz}{extra}"
            )
        if sf.get("liuNian"):
            ln = sf["liuNian"]
            gz = ln.get("ganZhi") or f"{ln.get('gan', '')}{ln.get('zhi', '')}"
            extra = ""
            if ln.get("zhuXing"): extra += f" 主星[{ln['zhuXing']}]"
            if ln.get("fuXing"): extra += f" 辅星[{ln['fuXing']}]"
            if ln.get("gongName"): extra += f" 宫位{ln['gongName']}"
            if ln.get("wuXing"): extra += f" 五行{ln['wuXing']}"
            digest_parts.append(
                f"【选中流年】{ln.get('year', '')}年 {gz}{extra}"
            )
        if sf.get("liuYue"):
            ly = sf["liuYue"]
            gz = ly.get("ganZhi") or f"{ly.get('gan', '')}{ly.get('zhi', '')}"
            extra = ""
            if ly.get("zhuXing"): extra += f" 主星[{ly['zhuXing']}]"
            if ly.get("fuXing"): extra += f" 辅星[{ly['fuXing']}]"
            if ly.get("gongName"): extra += f" 宫位{ly['gongName']}"
            if ly.get("wuXing"): extra += f" 五行{ly['wuXing']}"
            digest_parts.append(
                f"【选中流月】{ly.get('month', '')}月 {gz}{extra}"
            )
        if sf.get("liuRi"):
            lr = sf["liuRi"]
            gz = lr.get("ganZhi") or f"{lr.get('gan', '')}{lr.get('zhi', '')}"
            extra = ""
            if lr.get("zhuXing"): extra += f" 主星[{lr['zhuXing']}]"
            if lr.get("fuXing"): extra += f" 辅星[{lr['fuXing']}]"
            if lr.get("gongName"): extra += f" 宫位{lr['gongName']}"
            if lr.get("wuXing"): extra += f" 五行{lr['wuXing']}"
            digest_parts.append(
                f"【选中流日】{lr.get('day', '')}日 {gz}{extra}"
            )
        if sf.get("liuShi"):
            ls = sf["liuShi"]
            gz = ls.get("ganZhi") or f"{ls.get('gan', '')}{ls.get('zhi', '')}"
            extra = ""
            if ls.get("zhuXing"): extra += f" 主星[{ls['zhuXing']}]"
            if ls.get("fuXing"): extra += f" 辅星[{ls['fuXing']}]"
            if ls.get("gongName"): extra += f" 宫位{ls['gongName']}"
            if ls.get("wuXing"): extra += f" 五行{ls['wuXing']}"
            digest_parts.append(
                f"【选中流时】{ls.get('zhi', '')}时 {gz}{extra}"
            )
        if any(
            digest_parts[-i].startswith("【选中")
            for i in range(1, min(6, len(digest_parts) + 1))
        ):
            digest_parts.append(
                "【运限焦点指令】报告第四部分必须严格围绕上述【选中XXX】进行分析，"
                "不可使用当前时间的大运/大限/流年/流月/流日/流时。"
                "若某个层级无选中焦点，则该层级使用当前时间对应的项。"
            )

    return "【共享基础信息摘要（所有章节统一使用，无需自行重新解析）】\n" + "\n".join(digest_parts)


# ── 策略4：加权字数分配 ──

# 章节权重映射（关键词 → 权重）
_CHAPTER_WEIGHT_MAP: list[tuple[str, float]] = [
    ("命局", 1.5), ("基础", 1.5), ("格局", 1.5), ("用神", 1.5),
    ("十神", 1.3), ("干支", 1.3), ("五行", 1.3),
    ("大运", 1.3), ("流年", 1.3), ("运势", 1.3),
    ("性格", 1.2), ("婚姻", 1.2), ("事业", 1.2), ("财运", 1.2), ("感情", 1.2),
    ("健康", 1.0), ("子女", 1.0), ("六亲", 1.0),
    ("神煞", 0.8), ("空亡", 0.8), ("墓库", 0.8), ("纳音", 0.8),
    ("综合", 1.0), ("总结", 1.0), ("建议", 1.0), ("论断", 1.0),
]


def _calculate_chapter_weights(outline: list[dict]) -> list[float]:
    """根据章节标题关键词计算权重，返回与顶层章节对应的权重列表。"""
    weights: list[float] = []
    for node in outline:
        title = node.get("title", "")
        weight = 1.0  # 默认权重
        for keyword, w in _CHAPTER_WEIGHT_MAP:
            if keyword in title:
                weight = w
                break
        weights.append(weight)
    return weights


def _allocate_word_count(
    total_min: int, total_max: int, weights: list[float]
) -> list[tuple[int, int]]:
    """按权重比例分配各章节字数范围，返回 [(min, max), ...]。"""
    if not weights:
        return [(total_min, total_max)]

    total_weight = sum(weights)
    result: list[tuple[int, int]] = []
    for w in weights:
        ratio = w / total_weight
        sec_min = int(total_min * ratio)
        sec_max = int(total_max * ratio)
        result.append((sec_min, sec_max))
    return result


# ── 策略5：SKILL.md 选择性注入 ──

# SKILL.md 中始终保留的段落关键词
_SKILL_ALWAYS_KEEP = ["跨模型一致性", "角色定位", "数据使用规则", "禁止条款", "强制禁止"]
# SKILL.md 中不注入的段落关键词
_SKILL_NEVER_INJECT = ["参考文件索引"]
# 首章额外注入的段落
_SKILL_FIRST_SECTION_EXTRA = ["工作模式"]


def _select_skill_sections(
    skill_prompt: str, section_title: str, is_first_section: bool = False
) -> str:
    """根据当前章节标题，选择性注入 SKILL.md 的相关段落。

    策略：
    - 始终保留：跨模型一致性、角色定位、数据使用规则、禁止条款
    - 首章额外保留：工作模式
    - 按章节标题关键词匹配相关段落
    - 不注入：参考文件索引
    """
    import re as _re

    if not skill_prompt:
        return ""

    # 按 ## 标题切分段落
    parts = _re.split(r'(?=^## )', skill_prompt, flags=_re.MULTILINE)
    if len(parts) <= 1:
        return skill_prompt  # 无法切分，返回全文

    kept_parts: list[str] = []
    # 保留 frontmatter（--- 开头的 YAML 头）
    if parts[0].strip().startswith("---"):
        # 跳过 frontmatter，不注入到 skill_prompt
        pass

    for part in parts:
        part_stripped = part.strip()
        if not part_stripped:
            continue

        # 提取段落标题
        title_match = _re.match(r'^##\s+(.+)', part_stripped)
        section_heading = title_match.group(1).strip() if title_match else part_stripped[:30]

        # 检查是否在不注入列表中
        if any(kw in section_heading for kw in _SKILL_NEVER_INJECT):
            continue

        # 检查是否在始终保留列表中
        should_keep = any(kw in section_heading for kw in _SKILL_ALWAYS_KEEP)

        # 首章额外保留
        if is_first_section and any(kw in section_heading for kw in _SKILL_FIRST_SECTION_EXTRA):
            should_keep = True

        # 按章节标题关键词匹配
        if not should_keep:
            for kw, _ in _CHAPTER_WEIGHT_MAP:
                if kw in section_title and kw in section_heading:
                    should_keep = True
                    break

        if should_keep:
            kept_parts.append(part_stripped)

    if not kept_parts:
        # 兜底：返回全文（避免完全没有 skill 指导）
        return skill_prompt

    return "\n\n".join(kept_parts)


# ── 策略6：压缩前序上下文 ──


def _compress_previous_content(content: str, max_length: int = 400) -> str:
    """从前序章节内容中提取关键信息，生成结构化摘要。

    提取策略：
    1. 所有 ## / ### 标题（章节结构）
    2. 所有 **加粗** 文本（关键结论）
    3. 表格数据行（确定性数据）
    拼接为紧凑摘要，信息密度远高于原始文本末尾。
    """
    import re as _re

    if not content or len(content) <= max_length:
        return content or ""

    elements: list[str] = []

    # 1. 提取标题（章节结构概览）
    headings = _re.findall(r'^(#{2,3}\s+.+)$', content, _re.MULTILINE)
    if headings:
        elements.append("前序章节结构：" + " → ".join(
            _re.sub(r'^#{2,3}\s+', '', h) for h in headings[:8]
        ))

    # 2. 提取加粗文本（关键结论）
    bold_texts = _re.findall(r'\*\*(.+?)\*\*', content)
    # 过滤掉标题中已有的、过短的
    bold_conclusions = [b for b in bold_texts if len(b) >= 6 and not b.startswith("#")]
    if bold_conclusions:
        # 取最后 5 个结论（最新的）
        elements.append("关键结论：" + "；".join(bold_conclusions[-5:]))

    # 3. 提取表格数据行（确定性数据）
    table_rows = [
        line.strip() for line in content.split("\n")
        if line.strip().startswith("|") and "---" not in line
    ]
    if table_rows:
        # 取表格头 + 最后 2 行数据
        compact_table = table_rows[0]
        if len(table_rows) > 1:
            compact_table += "\n" + "\n".join(table_rows[-2:])
        elements.append(f"数据表：\n{compact_table}")

    summary = "\n".join(elements)
    if not summary:
        # 兜底：取末尾 max_length 字符
        return content[-max_length:]

    # 如果摘要仍然过长，截断
    if len(summary) > max_length:
        summary = summary[:max_length] + "..."

    return summary


def _render_report_header(context_data: str) -> str:
    """从排盘上下文 JSON 提取基础信息，渲染报告头"报告基础信息"表。

    确定性数据由后端直接渲染，不依赖 LLM 生成（分章节生成流程只产出
    `## 第X部分` 起的章节内容，模板开头的报告基础信息表结构性缺失）。
    数据缺失时返回空串。
    """
    import re as _re
    import json as _json
    from datetime import date

    if not context_data:
        return ""

    json_match = _re.search(r'```json\s*(.*?)\s*```', context_data, _re.DOTALL)
    json_str = json_match.group(1) if json_match else context_data
    try:
        data = _json.loads(json_str)
    except (_json.JSONDecodeError, TypeError):
        return ""

    basic = data.get("basicInfo") or {}
    chart_type = data.get("chartType", "")

    # 黄历择吉：personInfo 在根级别，不在 basicInfo 中
    is_huangli = chart_type == "黄历择吉"
    if is_huangli:
        person = data.get("personInfo") or {}
        if not person.get("name"):
            return ""
    else:
        # 放宽判空：只要有 basicInfo（哪怕 name 为空）或 chartType 就渲染，
        # 避免因 name 缺失导致整张「报告基础信息」表丢失。
        if not basic and not chart_type:
            return ""

    if is_huangli:
        person = data.get("personInfo") or {}
        query = data.get("queryInfo") or {}
        rows: list[tuple[str, str]] = [
            ("事主姓名", str(person.get("name", ""))),
            ("性别", str(person.get("gender", ""))),
        ]
        if person.get("birthDateTime"):
            rows.append(("公历出生", str(person["birthDateTime"]).replace("T", " ")))
        if person.get("birthplace"):
            rows.append(("出生地点", str(person["birthplace"])))
        if query.get("activity"):
            rows.append(("择吉事项", str(query["activity"])))
        if query.get("queryTime"):
            rows.append(("择吉时间", str(query["queryTime"])))
        if query.get("selectedDate"):
            rows.append(("选定日期", str(query["selectedDate"])))
        rows.append(("批断日期", date.today().strftime("%Y年%m月%d日")))
        rows.append(("生成方式", "AI智能分析"))
    else:
        rows: list[tuple[str, str]] = [
            ("命主姓名", str(basic.get("name", ""))),
            ("性别", str(basic.get("genderLabel") or basic.get("gender", ""))),
            ("公历出生", str(basic.get("solarDate", ""))),
        ]
        if basic.get("trueSolarTime"):
            rows.append(("真太阳时", str(basic["trueSolarTime"])))
        if basic.get("lunarDate"):
            rows.append(("农历出生", str(basic["lunarDate"])))
        if basic.get("birthplace"):
            rows.append(("出生地点", str(basic["birthplace"])))
        # 命宫 / 胎元（八字特有字段，存在才输出）
        if chart_type == "八字":
            if data.get("mingGong"):
                rows.append(("命宫", str(data["mingGong"])))
            if data.get("taiYuan"):
                rows.append(("胎元", str(data["taiYuan"])))
        rows.append(("批断日期", date.today().strftime("%Y年%m月%d日")))
        rows.append(("生成方式", "AI智能分析"))

    lines = ["### 报告基础信息", "", "| 项目 | 内容 |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in rows if v]
    return "\n".join(lines)


def _build_section_instruction(
    section_title: str,
    children: list[dict],
    previous_content: str,
    base_instruction: str,
    sec_idx: int,
    total_sections: int,
    section_min_words: int | None = None,
    section_max_words: int | None = None,
    section_template: str = "",
    base_info_digest: str = "",
) -> str:
    """构建单个章节的生成指令

    参数:
        section_title: 当前章节标题
        children: 子章节列表
        previous_content: 已生成的前序章节内容（作为上下文，已压缩）
        base_instruction: 基础指令模板
        sec_idx: 当前章节索引（0-based）
        total_sections: 总章节数
        section_min_words: 当前章节最低字数（汉字数）
        section_max_words: 当前章节最高字数（汉字数）
        section_template: 当前章节对应的模板片段（从全文中切片得到）。
            如果提供，则注入章节级模板而非 base_instruction 中的全文模板。
        base_info_digest: 共享基础信息摘要（策略3），确保各章节使用统一基础数据。
    """
    # 生成子章节结构
    child_md = _render_outline_to_markdown(children) if children else ""

    instruction = f"""{base_instruction}

## 当前任务：只生成第 {sec_idx + 1}/{total_sections} 章

**请只输出以下章节的内容，不要输出其他章节：**

以 `## {section_title}` 作为本章输出的第一行（二级标题），然后输出各子章节内容。"""

    if child_md:
        instruction += f"""
{child_md}"""

    # 注入共享基础信息摘要（策略3）
    if base_info_digest:
        instruction += f"""

## 共享基础信息（所有章节统一使用，无需自行重新解析）

{base_info_digest}"""

    # 注入当前章节的模板片段（替代全文模板）
    if section_template:
        instruction += f"""

## 当前章节格式模板

以下为本章节的格式模板片段，请严格遵循其表格结构、占位符位置：

{section_template}"""

    if previous_content:
        # 前序章节内容作为上下文，确保连贯性（策略6：使用压缩摘要）
        instruction += f"""

## 前序章节摘要（供参考，确保上下文连贯）

> 以下是前序章节的关键信息摘要，请确保当前章节与前序内容逻辑连贯、不重复、不矛盾：
>
> {previous_content}"""

    # 章节级字数要求（上限为硬约束，防止单章节过长触发 max_tokens 截断）
    if section_min_words is not None and section_max_words is not None:
        # 单章节硬上限：防止 LLM 输出过长触发 max_tokens=32768 截断
        # （中文 1 字约 1-1.5 token，3000 字约 4500 token，远低于上限）
        hard_cap = min(section_max_words, 3000)
        instruction += f"""

## 本章篇幅要求（上限为硬性约束）

**目标篇幅：约 {section_min_words}-{section_max_words} 字（汉字）**

- **硬性上限 {hard_cap} 字：宁可内容略少，绝不可超过，超过会被系统截断导致内容残缺**
- 生成前先在内部规划本章各小节的篇幅，再开始输出
- 内容不足时加深分析深度（补充数据论证、展开机理解释）
- 内容超出时精炼表述、合并同类项、删除冗余修饰
- 表格内容（如大运表、流年表）每行务必精简，只保留关键字段"""

    instruction += f"""

**输出要求：**
- 必须以 `## {section_title}` 开头（二级标题），不要输出任何前言、问候语
- 不要输出后面的章节，只输出当前这一个章节
- 确保内容完整，包含所有子章节，且总字数不超过上述硬性上限
- **禁止省略或简写章节内容**：严禁用「（略）」「（从略）」「（详见前文）」「（此处省略）」等占位表述跳过子章节，每个子章节都必须完整展开实际分析内容；若某子章节数据不足，也须基于现有数据给出完整论断，而非省略
- 禁止使用「辰未相破」（相破仅有6组：子酉/丑辰/寅亥/卯午/巳申/未戌）
- 身强与身弱互斥，正官与七杀格局互斥，用神与忌神不可相同
- 十二长生以「月令」为准：日主十二长生由「日干 + 月支」查十二长生表确定，与日支无关，禁止用日支地支自身的十二长生（如辰=墓）当作日主状态；同一日主在各月令的状态必须全局一致，禁止不同章节出现矛盾（如同时写「衰」「长生」「冠带」）
- 十二长生查表规则（阳干顺行、阴干逆行，火土同长生）：丙火/戊土「长生寅、沐浴卯、冠带辰、临官巳、帝旺午、衰未、病申、死酉、墓戌、绝亥、胎子、养丑」；丁火/己土「长生酉…衰辰…」；甲木「长生亥…衰辰…」；庚金「长生巳…衰戌…」；壬水「长生申…衰丑…」；阴干反向。日主十二长生必须严格按此表取值，禁止凭印象乱写
- 大运/流年公历年份必须严格引用排盘数据大运表，禁止自行推算
- 合婚/生肖/地支关系不自相矛盾：同一地支不能既列入「宜三合/六合」又列入「忌相冲/相刑/相害」（如「亥」既是六合又相害会自相矛盾）；六合、三合、相冲、相刑、相害、相破是独立且固定的关系，互不冲突需单独表述清楚
- 大运十神标注以「大运天干对日主」为准（如「己卯」大运，天干己土对丙火日主为伤官，故标「伤官」），地支与大运地支会局、引动等属于另一层分析，不得混写为大运十神"""
    return instruction


def _build_section_fix(section_title: str, errors: list) -> str:
    """构建章节修复指令"""
    error_lines = "\n".join(
        f"- [{e.severity}] {e.message}" for e in errors[:5]
    )
    return f"""

## 修复指令：请修正「{section_title}」章节

上一版本存在以下问题：
{error_lines}

请重新生成该章节，修正上述问题。必须以 `## {section_title}` 开头（二级标题），不要输出解释。"""


def _build_full_compress_instruction(
    current_report: str, target_min: int, target_max: int, current_count: int
) -> str:
    """构建「全文压缩」指令：当报告字数严重超出上限时，让 LLM 精炼压缩到目标范围。

    压缩策略：保留全部章节结构、表格、核心结论与数据，仅精炼正文表述、
    合并冗余内容、删除重复修饰，不删减任何章节或关键信息点。
    """
    return f"""你已生成了一份完整报告，但当前字数 {current_count} 字，严重超过模板要求的 {target_min}-{target_max} 字上限。

请对以下完整报告进行**压缩精炼**，输出压缩后的完整报告（从第一个 # 标题开始，不要输出任何解释）：

## 压缩要求（必须严格遵守）

1. **总字数目标**：压缩后总字数必须控制在 **{target_max} 字以内**（汉字计数，宁可略少于上限，不可超过）。
2. **保留结构**：所有章节标题、小节标题、表格（含表头与数据行）必须完整保留，不得删除任何章节或表格。
3. **精炼正文**：压缩的核心手段是「精炼表述」而非「删减内容」——
   - 合并重复、啰嗦的句子，删除冗余修饰词和套话
   - 将长段落提炼为要点式表述，保留数据、结论和因果逻辑
   - 删除同一观点的重复论证，只保留最有力的论述
   - 保留所有具体的干支、五行、十神、大运流年等命理数据（这些不可删）
4. **保留关键信息**：用神/喜神/忌神、格局、身强身弱、各领域结论、大运走势等核心判断必须全部保留。
5. **格式一致**：保持 Markdown 结构、标题层级、表格格式与原报告一致。

以下是待压缩的完整报告：

---

{current_report}

---

请输出压缩后的完整报告，直接从第一个 # 标题开始。"""


def _build_generation_instruction(
    skill_name: str,
    skill_id: str,
    outline: list[dict] | None = None,
    template_body: str = "",
    context_data: str = "",
    min_words: int | None = None,
    max_words: int | None = None,
    inject_full_template: bool = True,
) -> str:
    """构建报告生成的完整指令，由 Skill 自行决定报告内容和结构

    参数:
        skill_name: Skill 展示名
        skill_id: Skill ID（已弃用，保留兼容）
        outline: 用户自定义的报告目录结构。必填，不能为空。
        template_body: 报告模板完整正文（含表格、占位符等）。必填，不能为空。
        context_data: 排盘上下文数据（用于检测用户选中的分析焦点）。
        min_words: 报告最低字数要求（汉字数）。
        max_words: 报告最高字数要求（汉字数）。
        inject_full_template: 是否在 base_instruction 中注入完整模板正文。
            True（默认）：兼容非流式生成（generate_report）
            False：流式分章节生成时使用，模板片段由 _build_section_instruction 注入
    """
    base_instruction = f"""请严格按照系统提示中的「{skill_name}」技能指南，基于提供的排盘数据，一次性自动完成深度解盘分析报告。

**禁止输出任何前言、问候语、确认语（如"好的""收到""我将严格遵循..."等），直接从报告的第一个 # 标题开始输出。**"""

    # 字数要求（注入到用户消息，确保 LLM 明确感知）
    if min_words is not None and max_words is not None:
        # 统计顶层章节数量，计算分章节字数分配
        top_chapters = [n for n in (outline or []) if n.get("title")]
        chapter_count = len(top_chapters)
        if chapter_count > 0:
            per_chapter_min = min_words // chapter_count
            per_chapter_max = max_words // chapter_count
            chapter_list = "\n".join(
                f"  - {n['title']}：约 {per_chapter_min}-{per_chapter_max} 字"
                for n in top_chapters
            )
        else:
            chapter_list = ""

        base_instruction += f"""

## 篇幅要求

本次报告的目标篇幅为 **{min_words}-{max_words} 字**（按汉字计数）。

### 总量要求（上限为硬性约束）
- 报告总字数目标为 {min_words}-{max_words} 字，生成前请先规划各章节篇幅
- **上限 {max_words} 字是硬性上限，必须严格遵守，宁可略少于上限，绝不可超过**
- 字数不足可略低于 {min_words} 字，但**绝对不允许超过 {max_words} 字**

### 分章节字数分配参考"""

        if chapter_list:
            base_instruction += f"""
{chapter_list}

以上为参考分配，可根据章节内容权重适当调整，但**各章节之和不得超过 {max_words} 字总量上限**。"""
        else:
            base_instruction += "\n请根据章节数量合理分配各部分篇幅。"

        base_instruction += f"""

### 篇幅控制策略
- **内容不足时**：加深每个章节的分析深度——补充数据论证、展开机理解释、增加实例解读、强化因果关系推演
- **内容超出时（重点）**：这是必须避免的情况。生成前先规划篇幅，写作时精炼表述、合并同类项、删除冗余修饰和套话，**控制总量不超过 {max_words} 字**
- 优先保证不超过上限，再追求信息密度和专业深度"""

    # 检测用户选中的分析焦点，注入重点分析要求
    has_focus = any(tag in context_data for tag in [
        "【用户选中的分析焦点——必须重点深入分析】",
        "【用户选中的分析焦点】",
        "用户选中的分析焦点",
    ])
    if has_focus:
        base_instruction += """

## 🔥 用户选中分析焦点——重点分析规则（优先级最高）

当上下文数据中出现「【用户选中的分析焦点】」时，必须严格执行以下规则：

1. **篇幅占比优先**：对用户选中的每个时间维度（如大运/大限、流年、流月、流日、流时）进行深度分析，总篇幅不少于整份报告的 25%
2. **深度要求**：选中的每个维度需展开 300 字以上的详细论述，涵盖：
   - 干支/星曜/宫位与本命盘的生克冲合、四化互动
   - 吉凶判断与强弱分析
   - 具体事件预测与建议
   - 关键时机、注意事项、规避风险
3. **多维度联动**：若同时选中多个维度（如大运+流年+流月），必须分析各维度之间的连锁互动、叠加效应、合力结果
4. **视觉标识**：在每个焦点对应的章节标题中使用「★」符号标注，使其在视觉上清晰可辨，例如：
   - `## 第四部分 ★ 当前大运详解（甲子大运 2020-2029）`
   - `### 4.2 ★ 2026 丙午流年重点分析`
5. **实用性强化**：重点分析章节必须包含可执行的行动建议、择吉避凶方案、时间节点安排，不能仅停留在理论分析
6. **章节位置**：焦点分析可放置在对应模块下，但需使用★明确标注；若有合适位置，可在报告末尾追加「★ 焦点总结与行动方案」专章汇总所有选中维度的结论和建议

以上焦点分析规则的优先级高于默认技能结构，确保用户关心的时间段得到最详尽的解读。"""

    # 报告目录结构（必填）
    outline_md = _render_outline_to_markdown(outline) if outline else ""
    if not outline_md:
        outline_md = "（未提供目录结构，请按照技能默认结构生成）"

    base_instruction += f"""

## 报告目录结构（必须严格按此结构生成）

请严格按照以下目录结构组织报告章节。可在每个章节下自由展开内容，但顶层章节标题、顺序、嵌套层级必须与此结构完全一致，不得增减顶层章节，不得修改章节标题：

{outline_md}"""

    # 格式参考模板
    if not template_body:
        template_body = "（未提供格式模板，请按照标准报告格式生成）"

    if inject_full_template:
        base_instruction += f"""

## 格式参考模板（必须严格按此模板的表格结构、章节层级、占位符位置生成）

以下为报告格式模板，请严格遵循其表格结构、章节标题、占位符位置。将占位符（____、____________等）替换为基于排盘数据的实际分析内容。表格列结构、章节顺序必须与模板完全一致，不得修改：

{template_body}"""
    else:
        # 流式分章节模式：只注入模板说明，不注入全文
        base_instruction += """

## 格式说明

本报告采用分章节流式生成。每个章节的格式模板片段将在生成该章节时单独注入。
请严格按照报告目录结构组织内容，表格格式参考各章节注入的模板片段。"""

    # 排盘上下文数据（作为唯一分析数据源）
    if context_data:
        base_instruction += f"""

## 排盘数据（分析的唯一数据源）

> **重要提示**：排盘数据中包含 `## 排盘 JSON 数据` 章节。该章节以 JSON 格式提供了完整的结构化排盘信息，**所有定量分析（五行计数、十神关系、星曜分布、格局判断等）必须严格基于 JSON 数据中的字段值进行计算**。文本描述部分为 JSON 数据的可读性辅助说明，定量信息以 JSON 为准。

以下为本次分析的排盘数据，所有分析内容必须严格基于此数据，不得引入任何外部信息：

{context_data}"""

    # 末尾字数提醒（最后防线，确保 LLM 在生成前再次确认字数目标）
    if min_words is not None and max_words is not None:
        base_instruction += f"""

---

## 最终提醒（生成前必须确认）

请再次确认：本次报告总字数目标为 **{min_words}-{max_words} 字**（汉字计数）。
- 生成前请先在内部规划各章节的大致篇幅，确保总量达标后再开始输出
- 生成过程中请持续关注各章节展开深度，避免内容过于简略导致字数不足
- **上限 {max_words} 字是硬性约束：宁可内容略少，绝不可超过 {max_words} 字**
- 直接从第一个 # 标题开始输出，不要输出任何前言或确认语"""

    return base_instruction


def _validate_report_completeness(
    report_content: str,
    skill_id: str = "",
    min_words: int | None = None,
    max_words: int | None = None,
) -> dict:
    """
    验证报告内容完整性。

    参数:
        report_content: 报告内容
        skill_id: Skill ID（已弃用，保留兼容）
        min_words: 报告最低字数要求（None 时默认 10000）
        max_words: 报告最高字数要求（可选）

    返回:
        {
            "word_count": int,       # 中文字数（仅汉字）
            "word_count_reached": bool,
            "min_words": int,        # 实际使用的最低字数阈值
            "max_words": int|None,   # 最高字数阈值
        }
    """
    import re as _re

    # 统计中文字数（仅汉字，不含标点符号和空格）
    chinese_chars = _re.findall(r'[\u4e00-\u9fff]', report_content)
    word_count = len(chinese_chars)

    effective_min = min_words if min_words is not None else 10000
    word_count_reached = word_count >= effective_min

    return {
        "word_count": word_count,
        "word_count_reached": word_count_reached,
        "min_words": effective_min,
        "max_words": max_words,
    }


# ── 请求/响应模型 ──

class GenerateReportRequest(BaseModel):
    chart_type: str = Field(..., pattern="^(八字|紫微|麻衣神相|六爻|梅花易数|黄历择吉)$", description="排盘类型")
    chart_name: str = Field(default="", max_length=64, description="排盘对象姓名")
    skill_id: str = Field(..., min_length=1, max_length=64, description="使用的Skill ID")
    context_data: str = Field(..., min_length=1, description="排盘上下文数据")
    model_mode: str = Field(default="think", pattern="^(fast|think)$", description="模型模式")
    outline: Optional[list[dict]] = Field(
        default=None,
        description="用户自定义的报告目录结构。None/空数组表示使用 Skill 默认结构。",
    )
    template_id: Optional[str] = Field(
        default=None,
        description="报告模板ID。传入则加载模板正文作为格式参考注入生成指令。",
    )


class GenerateReportResponse(BaseModel):
    success: bool = True
    report_content: str = Field(default="", description="生成的报告内容（Markdown）")
    skill_name: str = Field(default="", description="使用的Skill名称")


class SaveReportRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=128, description="报告标题")
    chart_type: str = Field(..., pattern="^(八字|紫微|麻衣神相|六爻|梅花易数|黄历择吉)$", description="排盘类型")
    chart_name: Optional[str] = Field(None, max_length=64, description="排盘对象姓名")
    skill_name: Optional[str] = Field(None, max_length=64, description="使用的Skill名称")
    report_format: str = Field(default="html", pattern="^(html|pdf|word)$", description="报告格式")
    report_content: str = Field(..., min_length=1, description="报告内容")
    archive_id: Optional[int] = Field(None, description="关联的排盘档案ID（可选，未提供时根据 chart_name + birth_datetime 精确匹配）")
    birth_datetime: Optional[str] = Field(None, description="出生时间（用于精确匹配档案，避免同名档案匹配错误）")


class ReportResponse(BaseModel):
    id: int
    user_id: int
    archive_id: Optional[int] = None
    title: str
    chart_type: str
    chart_name: Optional[str]
    skill_name: Optional[str]
    report_format: str
    report_content: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: BaziReport) -> "ReportResponse":
        return cls(
            id=obj.id,
            user_id=obj.user_id,
            archive_id=getattr(obj, "archive_id", None),
            title=obj.title,
            chart_type=obj.chart_type,
            chart_name=obj.chart_name,
            skill_name=obj.skill_name,
            report_format=obj.report_format,
            report_content=obj.report_content or "",
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class ReportListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ReportResponse]


class UpdateReportRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=128, description="报告标题")
    report_content: Optional[str] = Field(None, min_length=1, description="报告内容")


class MessageResponse(BaseModel):
    success: bool = True
    message: str


# ── Skill 列表 ──

class SkillInfo(BaseModel):
    name: str
    display_name: str
    description: str
    icon: str
    context_requires: Optional[str] = None


# ── Skill Outline ──

class OutlineNodeModel(BaseModel):
    title: str
    children: Optional[list["OutlineNodeModel"]] = None


OutlineNodeModel.model_rebuild()


class SkillOutlineResponse(BaseModel):
    skill_id: str
    supports_outline: bool
    outline: list[OutlineNodeModel] = []


@router.get("/skills", response_model=list[SkillInfo])
async def list_skills():
    """获取所有可用的 Skill 列表"""
    sm = get_skill_manager()
    skills = sm.skills
    return [
        SkillInfo(
            name=s.name,
            display_name=s.display_name,
            description=s.description,
            icon=s.icon,
            context_requires=s.context_requires,
        )
        for s in skills
    ]


@router.get("/skills/{skill_id}/outline", response_model=SkillOutlineResponse)
async def get_skill_outline(skill_id: str):
    """获取指定 Skill 的默认报告目录结构

    返回字段：
    - supports_outline: 是否支持 outline 编辑（仅报告型 Skill 为 true）
    - outline: 默认目录树（supports_outline=false 时为空数组）
    """
    sm = get_skill_manager()
    skill = sm.get(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"未找到 Skill: {skill_id}")

    # 递归构建响应模型
    def _build_node(node: dict) -> OutlineNodeModel:
        children_raw = node.get("children") or []
        return OutlineNodeModel(
            title=node.get("title", ""),
            children=[_build_node(c) for c in children_raw] if children_raw else None,
        )

    return SkillOutlineResponse(
        skill_id=skill.name,
        supports_outline=skill.supports_outline,
        outline=[_build_node(n) for n in skill.outline],
    )


# ── 报告模板管理 ──

import os
import time
from pathlib import Path
import yaml

# 模板根目录（项目根目录下的 .rpttpl）
_TEMPLATE_DIR = Path(__file__).resolve().parents[4] / ".rpttpl"

# 模板缓存（带 TTL，避免频繁扫描文件系统）
_template_cache: dict = {"data": None, "mtime": 0, "ts": 0}
_TEMPLATE_CACHE_TTL = 5  # 秒


class TemplateInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    category: str = ""  # 模板所属分类目录名: bazi/ziwei/liuyao/meihua/mayi/huangli


class TemplateDetail(BaseModel):
    id: str
    name: str
    description: str = ""
    category: str = ""
    outline: list[OutlineNodeModel] = []
    body: str = ""
    min_words: Optional[int] = None
    max_words: Optional[int] = None


def _parse_word_count_from_description(description: str) -> tuple[int | None, int | None]:
    """从模板描述文本中解析字数范围，如 '3000-5000字' → (3000, 5000)"""
    if not description:
        return None, None
    import re as _re
    m = _re.search(r'(\d+)\s*[-~]\s*(\d+)\s*字', description)
    if m:
        return int(m.group(1)), int(m.group(2))
    # 兜底：单个数字 + '字'
    m = _re.search(r'(\d+)\s*字', description)
    if m:
        val = int(m.group(1))
        return val, val
    return None, None


def _parse_template_file(file_path: Path) -> dict | None:
    """解析单个模板文件，返回 {id, name, description, outline, body, min_words, max_words} 或 None"""
    try:
        # utf-8-sig 自动剥离可能存在的 BOM，避免 BOM 导致 startswith("---") 失败
        content = file_path.read_text(encoding="utf-8-sig")
    except Exception as e:
        logger.warning("[template] 读取模板文件失败 %s: %s", file_path, e)
        return None

    # 解析 YAML frontmatter
    frontmatter: dict = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                frontmatter = yaml.safe_load(parts[1]) or {}
            except yaml.YAMLError as e:
                logger.warning("[template] YAML 解析失败 %s: %s", file_path, e)
                return None
            body = parts[2]

    category = file_path.parent.name  # 父目录名作为分类: bazi/ziwei/liuyao/...
    template_id = f"{category}/{file_path.stem}"  # 类别/文件名，确保跨目录唯一
    name = frontmatter.get("name") or template_id
    description = frontmatter.get("description") or ""
    outline_raw = frontmatter.get("outline") or []

    # 复用 skill base 的规范化逻辑
    try:
        from ...core.skills.base import _normalize_outline
        normalized = _normalize_outline(outline_raw)
    except Exception:
        normalized = outline_raw if isinstance(outline_raw, list) else []

    # 解析字数范围：优先使用 frontmatter 显式字段，兜底从 description 解析
    min_words = frontmatter.get("min_words")
    max_words = frontmatter.get("max_words")
    if min_words is None or max_words is None:
        desc_min, desc_max = _parse_word_count_from_description(str(description))
        if min_words is None:
            min_words = desc_min
        if max_words is None:
            max_words = desc_max

    return {
        "id": template_id,
        "name": str(name),
        "description": str(description),
        "category": str(category),
        "outline": normalized,
        "body": body.strip(),
        "min_words": min_words,
        "max_words": max_words,
    }


def _split_template_by_sections(body: str, outline: list[dict]) -> dict[str, str]:
    """将模板正文按顶层章节标题切片，返回 {章节标题: 模板片段}

    策略：按 ## 标题行分割 body，将每个片段模糊匹配到 outline 节点。
    """
    import re as _re

    if not body or not outline:
        return {}

    top_titles = [node.get("title", "") for node in outline if node.get("title")]
    if not top_titles:
        return {}

    parts = _re.split(r'(?=^## )', body, flags=_re.MULTILINE)

    sections_map: dict[str, str] = {}
    last_matched_title: str | None = None

    for part in parts:
        part_stripped = part.strip()
        if not part_stripped:
            continue

        title_match = _re.match(r'^## (.+)', part_stripped)
        if title_match:
            raw_title = title_match.group(1).strip()
            matched_title = None
            for t in top_titles:
                if t in raw_title or raw_title in t:
                    matched_title = t
                    break
            if matched_title:
                last_matched_title = matched_title
                sections_map[matched_title] = part_stripped
            elif last_matched_title:
                sections_map[last_matched_title] += "\n\n" + part_stripped
        else:
            if top_titles:
                first_title = top_titles[0]
                if first_title not in sections_map:
                    sections_map[first_title] = part_stripped
                else:
                    sections_map[first_title] = part_stripped + "\n\n" + sections_map[first_title]

    return sections_map


def _load_all_templates() -> list[dict]:
    """加载 .rpttpl 目录下所有 .md 模板文件（带缓存）"""
    now = time.time()

    # 检查目录修改时间，决定是否使用缓存
    try:
        dir_mtime = _TEMPLATE_DIR.stat().st_mtime if _TEMPLATE_DIR.exists() else 0
    except Exception:
        dir_mtime = 0

    if (
        _template_cache["data"] is not None
        and now - _template_cache["ts"] < _TEMPLATE_CACHE_TTL
        and dir_mtime == _template_cache["mtime"]
    ):
        return _template_cache["data"]

    templates: list[dict] = []

    if _TEMPLATE_DIR.exists():
        for md_file in sorted(_TEMPLATE_DIR.glob("**/*.md")):
            parsed = _parse_template_file(md_file)
            if parsed:
                templates.append(parsed)

    # 确保至少有一个默认模板（目录为空时提供内置默认）
    if not templates:
        templates.append({
            "id": "default",
            "name": "通用解盘模板",
            "description": "涵盖命局基础、十神、大运、流年等核心维度的通用解盘报告模板",
            "category": "",
            "outline": [
                {"title": "命局基础分析", "children": [
                    {"title": "过三关", "children": [
                        {"title": "分清日元强弱"},
                        {"title": "取喜用与忌凶之神"},
                        {"title": "断格局，分析性格和一生追求"},
                    ]},
                    {"title": "四大平衡", "children": [
                        {"title": "阴阳平衡"},
                        {"title": "五行平衡"},
                        {"title": "强弱平衡"},
                        {"title": "燥湿平衡"},
                    ]},
                ]},
                {"title": "十神深度分析"},
                {"title": "干支关系总论"},
                {"title": "空亡与墓库"},
                {"title": "神煞与贵人"},
                {"title": "性格分析"},
                {"title": "婚姻感情"},
                {"title": "事业财运"},
                {"title": "健康与子女"},
                {"title": "大运分析"},
                {"title": "流年/流月/流日/流时"},
                {"title": "综合论断与建议"},
            ],
            "body": "",
        })

    _template_cache["data"] = templates
    _template_cache["mtime"] = dir_mtime
    _template_cache["ts"] = now

    return templates


@router.get("/templates", response_model=list[TemplateInfo])
async def list_templates():
    """获取所有可用的报告模板列表

    扫描 .rpttpl 目录下的 .md 文件，解析 frontmatter 生成模板列表。
    支持 5 秒缓存 + 目录修改时间检测，确保实时性与性能。
    """
    templates = _load_all_templates()
    return [
        TemplateInfo(
            id=t["id"],
            name=t["name"],
            description=t["description"],
            category=t.get("category", ""),
        )
        for t in templates
    ]


@router.get("/templates/{template_id:path}", response_model=TemplateDetail)
async def get_template_detail(template_id: str):
    """获取指定模板的详细信息（含目录结构）

    注意：template_id 形如 "bazi/02.高级版・人生趋势全解报告"，包含 "/"。
    使用 :path 转换器以兼容路径中的斜杠（前端用 encodeURIComponent 编码 "/"，
    uvicorn 会将 %2F 解码回 "/"，普通单段路由 {template_id} 无法匹配）。
    """
    templates = _load_all_templates()
    for t in templates:
        if t["id"] == template_id:
            def _build_node(node: dict) -> OutlineNodeModel:
                children_raw = node.get("children") or []
                return OutlineNodeModel(
                    title=node.get("title", ""),
                    children=[_build_node(c) for c in children_raw] if children_raw else None,
                )
            return TemplateDetail(
                id=t["id"],
                name=t["name"],
                description=t["description"],
                category=t.get("category", ""),
                outline=[_build_node(n) for n in t["outline"]],
                body=t.get("body", ""),
                min_words=t.get("min_words"),
                max_words=t.get("max_words"),
            )
    raise HTTPException(status_code=404, detail=f"未找到模板: {template_id}")


# ── API 路由 ──

def _load_template_meta(template_id: str | None, outline: list[dict] | None = None) -> dict:
    """根据 template_id 加载模板完整元数据。

    返回 {"body": str, "min_words": int|None, "max_words": int|None, "section_bodies": dict}。
    当传入 outline 时，预切割模板正文为章节级片段（section_bodies），
    供分章节流式生成时按需注入，避免全量模板正文重复消耗 token。
    """
    if not template_id:
        return {"body": "", "min_words": None, "max_words": None, "section_bodies": {}}
    templates = _load_all_templates()
    for t in templates:
        if t["id"] == template_id:
            body = t.get("body", "")
            section_bodies: dict[str, str] = {}
            if outline and body:
                section_bodies = _split_template_by_sections(body, outline)
            return {
                "body": body,
                "min_words": t.get("min_words"),
                "max_words": t.get("max_words"),
                "section_bodies": section_bodies,
            }
    logger.warning("[template] 未找到模板ID: %s，将不注入模板正文", template_id)
    return {"body": "", "min_words": None, "max_words": None, "section_bodies": {}}


def _load_template_body(template_id: str | None) -> str:
    """根据 template_id 加载模板正文（body）。未找到或未指定时返回空字符串。"""
    if not template_id:
        return ""
    templates = _load_all_templates()
    for t in templates:
        if t["id"] == template_id:
            return t.get("body", "")
    logger.warning("[template] 未找到模板ID: %s，将不注入模板正文", template_id)
    return ""


async def _check_model_mode_permission(
    model_mode: str,
    authorization: Optional[str] = None,
    db: AsyncSession | None = None,
):
    """检查模型模式权限：仅管理员可使用 think 模式"""
    if model_mode != "think":
        return  # fast 模式无需鉴权

    if not authorization:
        raise HTTPException(status_code=401, detail="深度思考模式需要登录")

    user_id = resolve_user_id_from_auth_header(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="认证令牌无效")

    if db is None:
        raise HTTPException(status_code=500, detail="数据库连接不可用")

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="仅管理员可使用深度思考模式")


@router.post("/generate", response_model=GenerateReportResponse)
async def generate_report(
    req: GenerateReportRequest,
    authorization: Optional[str] = Header(None, description="Bearer token"),
    db: AsyncSession = Depends(get_db),
):
    """
    生成解盘报告。

    使用 Agent Harness 调用 LLM，基于排盘上下文数据和选定的 Skill 生成完整报告。
    返回 Markdown 格式的报告内容。
    """
    # 检查模型模式权限：仅管理员可使用 think
    await _check_model_mode_permission(req.model_mode, authorization, db)

    # 加载 Skill prompt
    sm = get_skill_manager()
    skill = sm.get(req.skill_id)
    if not skill:
        raise HTTPException(status_code=400, detail=f"未找到 Skill: {req.skill_id}")

    skill_prompt = skill.prompt
    skill_name = skill.display_name

    # 加载模板元数据（正文 + 字数要求）
    template_meta = _load_template_meta(req.template_id)
    template_body = template_meta["body"]
    tpl_min_words = template_meta["min_words"]
    tpl_max_words = template_meta["max_words"]

    # 构建生成报告的指令（共享函数，确保 Phase 列表一致性）
    # 用户自定义 outline 渲染到指令文本（同时通过 harness 参数注入 system prompt，双保险）
    user_outline = req.outline if req.outline else None
    generation_instruction = _build_generation_instruction(
        skill_name, req.skill_id, user_outline, template_body, req.context_data,
        min_words=tpl_min_words, max_words=tpl_max_words,
    )

    # 注入共享基础信息摘要（姓名学、大运年份表等确定性数据），
    # 与流式端点保持一致，确保非流式生成也能引用姓名学/大运等确定性数据。
    base_info_digest = _extract_base_info_digest(req.context_data)
    if base_info_digest:
        generation_instruction += (
            "\n\n## 共享基础信息摘要（必须严格引用的确定性数据）\n\n"
            + base_info_digest
        )

    # 使用 Agent Harness 生成报告
    try:
        from ...core.agent.harness import get_agent_harness

        harness = get_agent_harness()
        if not harness:
            raise HTTPException(status_code=503, detail="Agent 服务未就绪")

        # 从 DB 加载当前生效的报告系统提示词（管理员修改后立即生效）
        report_system_prompt = await load_report_system_prompt()

        result = await harness.run(
            user_input=generation_instruction,
            session_id=None,
            user_id=None,
            skill_prompt=skill_prompt,
            context_data=req.context_data,
            skill_name=skill_name,
            model_mode=req.model_mode or "think",
            skip_tools=True,
            outline=user_outline,
            base_system_prompt=report_system_prompt,
            persist_history=False,
        )

        report_content = result.get("response", "")
        if not report_content:
            raise HTTPException(status_code=500, detail="报告生成失败，LLM 未返回有效内容")

        # 非流式路径同样需要后端确定性渲染的「报告基础信息」表，
        # 与流式路径保持一致（LLM 生成的正文不含该表）。
        report_header = _render_report_header(req.context_data)
        if report_header and report_header not in report_content:
            report_content = report_header + "\n\n" + report_content

        # 验证报告完整性（使用模板字数要求）
        validation = _validate_report_completeness(
            report_content, min_words=tpl_min_words, max_words=tpl_max_words,
        )
        logger.info(
            "报告生成成功: chart_type=%s skill=%s content_length=%d "
            "word_count=%d word_target_reached=%s min_words=%s max_words=%s",
            req.chart_type, req.skill_id, len(report_content),
            validation["word_count"],
            validation["word_count_reached"],
            validation["min_words"],
            validation["max_words"],
        )

        return GenerateReportResponse(
            success=True,
            report_content=report_content,
            skill_name=skill_name,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("报告生成失败: %s", e)
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@router.post("/generate/stream")
async def generate_report_stream(
    req: GenerateReportRequest,
    raw: Request,
    authorization: Optional[str] = Header(None, description="Bearer token"),
    db: AsyncSession = Depends(get_db),
):
    """
    流式生成解盘报告（SSE）。

    使用 Agent Harness 的 stream() 方法，通过 SSE 实时推送报告内容。
    客户端可随时断开连接以停止生成。
    """
    # 检查模型模式权限：仅管理员可使用 think
    await _check_model_mode_permission(req.model_mode, authorization, db)

    # 加载 Skill prompt
    sm = get_skill_manager()
    skill = sm.get(req.skill_id)
    if not skill:
        raise HTTPException(status_code=400, detail=f"未找到 Skill: {req.skill_id}")

    skill_prompt = skill.prompt
    skill_name = skill.display_name

    # 用户自定义 outline
    user_outline = req.outline if req.outline else None

    # 加载模板元数据（正文 + 字数要求 + 章节级模板片段）
    template_meta = _load_template_meta(req.template_id, outline=user_outline)
    template_body = template_meta["body"]
    tpl_min_words = template_meta["min_words"]
    tpl_max_words = template_meta["max_words"]
    template_sections: dict[str, str] = template_meta.get("section_bodies", {})

    # 构建生成报告的指令（流式模式：不注入完整模板正文，模板片段由章节级指令注入）
    generation_instruction = _build_generation_instruction(
        skill_name, req.skill_id, user_outline, template_body, req.context_data,
        min_words=tpl_min_words, max_words=tpl_max_words,
        inject_full_template=False,
    )

    # 使用 Agent Harness 流式生成报告
    try:
        from ...core.agent.harness import get_agent_harness

        harness = get_agent_harness()
        if not harness:
            raise HTTPException(status_code=503, detail="Agent 服务未就绪")

        # 从 DB 加载当前生效的报告系统提示词（管理员修改后立即生效）
        report_system_prompt = await load_report_system_prompt()

        async def event_generator():
            final_response = ""
            try:
                # 发送 skill 激活事件
                yield {
                    "event": "skill_activated",
                    "data": json.dumps({"skill_id": skill_name}),
                }

                # 构建完整 System Prompt 并发送给前端（供"复制提示词"功能使用）
                full_system_prompt = _assemble_full_system_prompt(
                    skill_prompt, user_outline, base_prompt=report_system_prompt
                )
                yield {
                    "event": "prompt",
                    "data": json.dumps({
                        "system_prompt": full_system_prompt,
                        "user_message": generation_instruction,
                    }),
                }

                # ── 分章节生成 + 即时验证 ──
                # 策略：按大纲顶层章节逐个生成，每个章节生成后立即验证，
                # 失败时仅重新生成该章节（非全文），大幅减少 token 消耗和等待时间
                from ...services.report_validator import (
                    validate_report, build_fix_instruction, MAX_VALIDATION_LOOPS,
                    _FORBIDDEN_CONTENT_PATTERNS, get_forbidden_patterns, _extract_chart_type,
                )

                MAX_SECTION_RETRIES = 0  # 禁止章节级重试——通过提示词优化保证一次生成正确，避免浪费 token

                # 提取顶层章节列表
                top_sections: list[dict] = []
                if user_outline:
                    for node in user_outline:
                        if node.get("title"):
                            top_sections.append(node)

                if not top_sections:
                    # 无大纲时退化为单次生成+验证
                    top_sections = [{"title": "完整报告", "children": []}]

                # 策略3：提取共享基础信息摘要（所有章节统一使用）
                base_info_digest = _extract_base_info_digest(req.context_data)
                if base_info_digest:
                    logger.info("[report] 共享基础信息摘要已提取，长度=%d", len(base_info_digest))

                # 策略4：按章节权重分配字数
                chapter_weights = _calculate_chapter_weights(top_sections)
                word_allocations: list[tuple[int, int]] | None = None
                if tpl_min_words is not None and tpl_max_words is not None:
                    word_allocations = _allocate_word_count(
                        tpl_min_words, tpl_max_words, chapter_weights
                    )
                    logger.info(
                        "[report] 加权字数分配: weights=%s allocations=%s",
                        chapter_weights, word_allocations,
                    )

                # 章节级进度
                section_results: list[dict] = []  # [{title, content, passed, errors, retries}]
                previous_content = ""  # 已生成章节的累积内容（已压缩），作为后续章节上下文

                for sec_idx, section in enumerate(top_sections):
                    section_title = section.get("title", f"章节{sec_idx + 1}")
                    children = section.get("children", [])
                    section_content = ""
                    section_passed = False
                    section_retries = 0
                    section_validation = None  # 初始化

                    # 构建章节级指令
                    section_outline = [section]
                    # 策略4：使用加权字数分配（替代简单均分）
                    section_min = None
                    section_max = None
                    if word_allocations and sec_idx < len(word_allocations):
                        section_min, section_max = word_allocations[sec_idx]
                    logger.info(
                        "[report] 章节生成 sec_idx=%d/%d title=%s tpl_min=%s tpl_max=%s section_min=%s section_max=%s weight=%.1f top_sections=%d",
                        sec_idx, len(top_sections), section_title, tpl_min_words, tpl_max_words,
                        section_min, section_max, chapter_weights[sec_idx] if sec_idx < len(chapter_weights) else 1.0, len(top_sections),
                    )
                    # 从模板映射中取出当前章节的模板片段
                    section_template = template_sections.get(section_title, "")
                    # 策略6：压缩前序上下文（替代原始末尾截取）
                    compressed_prev = _compress_previous_content(previous_content) if previous_content else ""
                    section_instruction = _build_section_instruction(
                        section_title, children, compressed_prev,
                        generation_instruction, sec_idx, len(top_sections),
                        section_min_words=section_min,
                        section_max_words=section_max,
                        section_template=section_template,
                        base_info_digest=base_info_digest,
                    )

                    # 发送章节开始事件
                    yield {
                        "event": "section_start",
                        "data": json.dumps({
                            "index": sec_idx,
                            "total": len(top_sections),
                            "title": section_title,
                        }),
                    }

                    for retry in range(MAX_SECTION_RETRIES + 1):
                        section_content = ""
                        finish_reason = None
                        current_section_instruction = section_instruction
                        if retry > 0 and section_validation:
                            # 构建修复指令：包含所有 critical 错误 + 匹配当前章节的错误
                            section_errors = [
                                e for e in section_validation.errors
                                if e.severity == "critical" or section_title in (e.location or "")
                            ]
                            if section_errors:
                                fix = _build_section_fix(section_title, section_errors)
                                current_section_instruction = section_instruction + fix

                            yield {
                                "event": "section_regenerate",
                                "data": json.dumps({
                                    "index": sec_idx,
                                    "title": section_title,
                                    "retry": retry,
                                }),
                            }

                        # 策略5：选择性注入 SKILL.md 相关段落（替代全文注入）
                        section_skill_prompt = _select_skill_sections(
                            skill_prompt, section_title, is_first_section=(sec_idx == 0)
                        )

                        # 流式生成当前章节
                        async for chunk in harness.stream(
                            user_input=current_section_instruction,
                            session_id=None,
                            user_id=None,
                            skill_prompt=section_skill_prompt,
                            context_data=req.context_data,
                            skill_name=skill_name,
                            model_mode=req.model_mode or "think",
                            skip_tools=True,
                            outline=section_outline,
                            base_system_prompt=report_system_prompt,
                            persist_history=False,
                        ):
                            if await raw.is_disconnected():
                                logger.info("报告生成: 客户端已断开连接，停止推送")
                                break

                            if chunk["event"] == "response":
                                data = json.loads(chunk["data"])
                                section_content = data.get("content", "")

                            if chunk["event"] == "done":
                                done_data = json.loads(chunk["data"])
                                finish_reason = done_data.get("finish_reason")
                                continue

                            # 所有 content/thinking 事件都转发给前端
                            yield {
                                "event": chunk["event"],
                                "data": chunk["data"],
                            }
                            await asyncio.sleep(0)

                        if not section_content:
                            break

                        # ── 截断检测：finish_reason == "length" 表示被 max_tokens 截断，
                        #    章节内容残缺，必须内联重生成一次（用更短的字数约束）──
                        if finish_reason == "length":
                            logger.warning(
                                "[report] 章节「%s」被 max_tokens 截断（finish_reason=length），"
                                "触发缩短重生成",
                                section_title,
                            )
                            yield {
                                "event": "section_regenerate",
                                "data": json.dumps({
                                    "index": sec_idx,
                                    "title": section_title,
                                    "retry": retry + 1,
                                    "reason": "max_tokens_truncated",
                                }),
                            }
                            # 缩短目标字数（减半），并附加「精简」指令强制缩短
                            _trunc_section_max = max(int(section_max * 0.5), 300) if section_max else None
                            _trunc_section_min = min(section_min or 0, _trunc_section_max) if _trunc_section_max else section_min
                            _trunc_instruction = (
                                section_instruction
                                + f"\n\n## 修正指令（必须遵守）\n\n"
                                f"上一版因内容过长被系统截断（不完整）。\n"
                                f"请重新生成「{section_title}」章节，**总字数控制在 {_trunc_section_max} 字以内**，"
                                f"大幅精简内容，只保留核心要点和关键数据，确保章节完整结束。"
                            )
                            section_content = ""
                            finish_reason = None
                            async for chunk in harness.stream(
                                user_input=_trunc_instruction,
                                session_id=None,
                                user_id=None,
                                skill_prompt=section_skill_prompt,
                                context_data=req.context_data,
                                skill_name=skill_name,
                                model_mode=req.model_mode or "think",
                                skip_tools=True,
                                outline=section_outline,
                                base_system_prompt=report_system_prompt,
                                persist_history=False,
                            ):
                                if await raw.is_disconnected():
                                    break
                                if chunk["event"] == "response":
                                    data = json.loads(chunk["data"])
                                    section_content = data.get("content", "")
                                if chunk["event"] == "done":
                                    done_data = json.loads(chunk["data"])
                                    finish_reason = done_data.get("finish_reason")
                                    continue
                                yield {
                                    "event": chunk["event"],
                                    "data": chunk["data"],
                                }
                                await asyncio.sleep(0)
                            if _trunc_section_max:
                                section_max = _trunc_section_max
                                section_min = _trunc_section_min

                        # 即时验证当前章节（is_section=True：字数问题降级为 MAJOR）
                        section_validation = validate_report(
                            report_content=section_content,
                            outline=section_outline,
                            context_data=req.context_data,
                            loop_index=retry,
                            min_words=section_min,
                            max_words=section_max,
                            is_section=True,
                        )

                        # 章节级验证：仅展示结果，不触发重试（MAX_SECTION_RETRIES=0）
                        has_critical = any(
                            e.severity == "critical" for e in section_validation.errors
                        )
                        section_passed = not has_critical

                        section_retries = retry

                        if section_passed:
                            break

                        # 短暂间隔后重试（0.5s，仅用于 UI 过渡）
                        await asyncio.sleep(0.5)

                    # 确保章节内容以 ## {section_title} 开头，去除可能重复的标题
                    stripped = section_content.lstrip()
                    # 去除开头重复的章节标题（LLM可能生成了多次相同标题）
                    title_prefix = f"## {section_title}"
                    while stripped.startswith(title_prefix):
                        rest = stripped[len(title_prefix):].lstrip()
                        if rest.startswith(title_prefix):
                            stripped = rest
                        else:
                            break

                    # ── 串章检测：若开头是「## 其他标题」（非预期章节标题），
                    #    说明 LLM 串章（生成了别的章节内容），必须重生成而非强行替换标题，
                    #    否则会出现「第一部分标题下挂着 8.1 体质内容」的错位。 ──
                    serialized_wrong_section = False
                    if not stripped.startswith(f"## {section_title}"):
                        # 匹配「## xxx」开头的标题行
                        head_match = re.match(r'^##\s+([^\n]+)\s*\n', stripped)
                        if head_match and not stripped.startswith(section_title) \
                                and not stripped.startswith(f"# {section_title}") \
                                and not stripped.startswith(f"### {section_title}"):
                            # 开头是「## 其他标题」，判定为串章
                            serialized_wrong_section = True

                    if serialized_wrong_section:
                        # 串章：LLM 生成了错误的章节内容。做一次针对性的重生成，
                        # 明确要求只输出预期章节，纠正串章。
                        logger.warning(
                            "[report] 章节串章检测：期望「%s」但生成了「%s」，触发重生成",
                            section_title, head_match.group(1).strip() if head_match else "未知",
                        )
                        yield {
                            "event": "section_regenerate",
                            "data": json.dumps({
                                "index": sec_idx,
                                "title": section_title,
                                "retry": retry + 1,
                                "reason": "serialized_wrong_section",
                            }),
                        }
                        anti_serialize_fix = (
                            f"\n\n## 修复指令（必须遵守）\n\n"
                            f"你上一版输出错误：本应只输出「{section_title}」章节，"
                            f"却输出了其他章节（如「{head_match.group(1).strip() if head_match else ''}」）的内容。\n\n"
                            f"请重新生成，**只输出「{section_title}」这一个章节**，"
                            f"第一行必须是 `## {section_title}`，严格按本章节模板结构输出，"
                            f"不要输出任何其他章节的标题或内容。"
                        )
                        section_content = ""
                        async for chunk in harness.stream(
                            user_input=section_instruction + anti_serialize_fix,
                            session_id=None,
                            user_id=None,
                            skill_prompt=section_skill_prompt,
                            context_data=req.context_data,
                            skill_name=skill_name,
                            model_mode=req.model_mode or "think",
                            skip_tools=True,
                            outline=section_outline,
                            base_system_prompt=report_system_prompt,
                            persist_history=False,
                        ):
                            if await raw.is_disconnected():
                                break
                            if chunk["event"] == "response":
                                data = json.loads(chunk["data"])
                                section_content = data.get("content", "")
                            if chunk["event"] == "done":
                                continue
                            yield {
                                "event": chunk["event"],
                                "data": chunk["data"],
                            }
                            await asyncio.sleep(0)

                        # 重生成后重新规范化标题（复用同样的去重/规范化逻辑）
                        if section_content:
                            stripped = section_content.lstrip()
                            while stripped.startswith(title_prefix):
                                rest = stripped[len(title_prefix):].lstrip()
                                if rest.startswith(title_prefix):
                                    stripped = rest
                                else:
                                    break
                            if not stripped.startswith(f"## {section_title}"):
                                if stripped.startswith(section_title):
                                    stripped = stripped[len(section_title):].lstrip()
                                elif stripped.startswith(f"# {section_title}"):
                                    stripped = stripped[len(f"# {section_title}"):].lstrip()
                                elif stripped.startswith(f"### {section_title}"):
                                    stripped = stripped[len(f"### {section_title}"):].lstrip()
                                elif stripped.startswith("## "):
                                    stripped = re.sub(r'^##\s+[^\n]*\n+', '', stripped)
                                section_content = f"## {section_title}\n\n{stripped}"
                            section_content = re.sub(r'\n*##\s+[^\n]*\s*$', '', section_content.rstrip())
                            section_validation = validate_report(
                                report_content=section_content,
                                outline=section_outline,
                                context_data=req.context_data,
                                min_words=section_min,
                                max_words=section_max,
                                is_section=True,
                            )
                            section_passed = not any(
                                e.severity == "critical" for e in section_validation.errors
                            )
                    else:
                        if not stripped.startswith(f"## {section_title}"):
                            if stripped.startswith(section_title):
                                stripped = stripped[len(section_title):].lstrip()
                            elif stripped.startswith(f"# {section_title}"):
                                stripped = stripped[len(f"# {section_title}"):].lstrip()
                            elif stripped.startswith(f"### {section_title}"):
                                stripped = stripped[len(f"### {section_title}"):].lstrip()
                            elif stripped.startswith("## "):
                                stripped = re.sub(r'^##\s+[^\n]*\n+', '', stripped)
                            section_content = f"## {section_title}\n\n{stripped}"

                    # 去除末尾可能多余的 ## 标题（LLM可能预生成了下一章节的标题）
                    section_content = re.sub(r'\n*##\s+[^\n]*\s*$', '', section_content.rstrip())

                    # 发送章节验证结果（附带规范后的章节内容，供前端替换流式累积的原始输出，
                    # 确保 LLM 输出中的粘连/残缺标题不进入最终报告）
                    yield {
                        "event": "section_validated",
                        "data": json.dumps({
                            "index": sec_idx,
                            "total": len(top_sections),
                            "title": section_title,
                            "passed": section_passed,
                            "retries": section_retries,
                            "scores": section_validation.scores if section_validation else {},
                            "word_count": section_validation.word_count if section_validation else 0,
                            "content": section_content,
                            "errors": [{"message": e.message, "severity": e.severity}
                                       for e in (section_validation.errors if section_validation else [])
                                       if e.severity in ("critical", "major")],
                        }),
                    }

                    section_results.append({
                        "title": section_title,
                        "content": section_content,
                        "passed": section_passed,
                        "retries": section_retries,
                        "word_count": section_validation.word_count if section_validation and section_content else 0,
                    })

                    # 累积已生成内容作为后续章节上下文
                    if section_content:
                        previous_content += f"\n\n{section_content}"

                    # 章节间短暂间隔（0.5s，仅用于 UI 过渡）
                    await asyncio.sleep(0.5)

                # ── 全文验证安全网 ──
                # 章节全部生成后，对完整报告做一次验证
                # 发现 CRITICAL 错误（如辰未相破）时，定向重生成受影响章节（最多 1 轮）
                FULL_REPORT_MAX_FIX = 1
                full_validation = None  # 初始化，确保循环外可访问
                compressed_final = None  # 字数超标压缩后的整篇报告（非 None 时最终组装优先使用）
                for fix_round in range(FULL_REPORT_MAX_FIX + 1):
                    final_response = "\n\n".join(
                        sr["content"] for sr in section_results if sr["content"]
                    )
                    full_validation = validate_report(
                        report_content=final_response,
                        outline=user_outline or [],
                        context_data=req.context_data,
                        min_words=tpl_min_words,
                        max_words=tpl_max_words,
                        is_section=False,
                    )
                    logger.info(
                        "[report] 全文验证 fix_round=%d passed=%s word_count=%d errors=%d (critical=%d major=%d)",
                        fix_round, full_validation.passed, full_validation.word_count,
                        len(full_validation.errors),
                        sum(1 for e in full_validation.errors if e.severity == "critical"),
                        sum(1 for e in full_validation.errors if e.severity == "major"),
                    )
                    if full_validation.passed or fix_round >= FULL_REPORT_MAX_FIX:
                        break

                    critical_errors = [e for e in full_validation.errors if e.severity == "critical"]

                    # ── 字数超标处理（全文级）：当报告字数严重超出模板上限时，
                    #    对整个报告做一次「压缩精炼」，而不是定向重生成单个章节 ──
                    overflow_errors = [
                        e for e in critical_errors
                        if e.dimension == "content_completeness" and "超出最高限制" in e.message
                    ]
                    if overflow_errors and tpl_max_words:
                        logger.info(
                            "[report] 检测到字数超标（%d 字 > 上限 %d 字），触发全文压缩",
                            full_validation.word_count, tpl_max_words,
                        )
                        yield {
                            "event": "thinking",
                            "data": json.dumps({
                                "step": f"报告字数超出上限，正在进行全文压缩至 {tpl_max_words} 字以内…",
                            }),
                        }
                        compress_instruction = _build_full_compress_instruction(
                            final_response, tpl_min_words or 0, tpl_max_words,
                            full_validation.word_count,
                        )
                        compressed = ""
                        async for chunk in harness.stream(
                            user_input=compress_instruction,
                            session_id=None,
                            user_id=None,
                            skill_prompt=skill_prompt,
                            context_data=req.context_data,
                            skill_name=skill_name,
                            model_mode=req.model_mode or "think",
                            skip_tools=True,
                            outline=user_outline or None,
                            base_system_prompt=report_system_prompt,
                            persist_history=False,
                        ):
                            if await raw.is_disconnected():
                                logger.info("报告生成: 客户端已断开连接，停止推送")
                                break
                            if chunk["event"] == "response":
                                data = json.loads(chunk["data"])
                                compressed = data.get("content", "")
                            if chunk["event"] == "done":
                                continue

                        if compressed.strip():
                            compressed_final = compressed.strip()
                            full_validation = validate_report(
                                report_content=compressed_final,
                                outline=user_outline or [],
                                context_data=req.context_data,
                                min_words=tpl_min_words,
                                max_words=tpl_max_words,
                                is_section=False,
                            )
                            logger.info(
                                "[report] 全文压缩完成 word_count=%d passed=%s",
                                full_validation.word_count, full_validation.passed,
                            )
                        # 压缩只做一轮，直接退出（全文内容已整体替换，定向修复无意义）
                        break

                    # 定向重生成包含 CRITICAL 错误的章节
                    affected_titles = []
                    _chart_type = _extract_chart_type(req.context_data)
                    _forbidden = get_forbidden_patterns(_chart_type)
                    for idx, sr in enumerate(section_results):
                        section_content = sr["content"]
                        section_title = sr["title"]
                        # 检查该章节是否触发禁止内容规则
                        needs_fix = False
                        fix_errors = []
                        for err in critical_errors:
                            for pat, _ in _forbidden:
                                if re.search(pat, section_content):
                                    needs_fix = True
                                    if err not in fix_errors:
                                        fix_errors.append(err)
                                    break
                        if not needs_fix:
                            continue

                        affected_titles.append(section_title)
                        logger.info("[report] 定向修复章节 idx=%d title=%s", idx, section_title)

                        # 重生成该章节
                        section = top_sections[idx]
                        children = section.get("children", [])
                        section_outline = [section]
                        s_min, s_max = (
                            word_allocations[idx]
                            if word_allocations and idx < len(word_allocations)
                            else (None, None)
                        )
                        section_template = template_sections.get(section_title, "")
                        compressed_prev = ""
                        if idx > 0:
                            prev_content = "\n\n".join(
                                section_results[j]["content"]
                                for j in range(idx) if section_results[j]["content"]
                            )
                            compressed_prev = _compress_previous_content(prev_content)

                        section_instruction = _build_section_instruction(
                            section_title, children, compressed_prev,
                            generation_instruction, idx, len(top_sections),
                            section_min_words=s_min,
                            section_max_words=s_max,
                            section_template=section_template,
                            base_info_digest=base_info_digest,
                        )
                        fix = _build_section_fix(section_title, fix_errors)
                        current_instruction = section_instruction + fix

                        # 发送状态提示（复用 thinking 事件）
                        yield {
                            "event": "thinking",
                            "data": json.dumps({
                                "step": f"正在修复「{section_title}」章节中的问题…",
                            }),
                        }

                        # 内部重生成（不流式，避免前端截断逻辑冲突）
                        new_content = ""
                        section_skill_prompt = _select_skill_sections(
                            skill_prompt, section_title, is_first_section=(idx == 0)
                        )
                        async for chunk in harness.stream(
                            user_input=current_instruction,
                            session_id=None,
                            user_id=None,
                            skill_prompt=section_skill_prompt,
                            context_data=req.context_data,
                            skill_name=skill_name,
                            model_mode=req.model_mode or "think",
                            skip_tools=True,
                            outline=section_outline,
                            base_system_prompt=report_system_prompt,
                            persist_history=False,
                        ):
                            if await raw.is_disconnected():
                                logger.info("报告生成: 客户端已断开连接，停止推送")
                                break
                            if chunk["event"] == "response":
                                data = json.loads(chunk["data"])
                                new_content = data.get("content", "")
                            if chunk["event"] == "done":
                                continue

                        if new_content:
                            # 确保修复后的内容也以 ## {section_title} 开头，去除可能重复的标题
                            stripped_nc = new_content.lstrip()
                            # 去除开头重复的章节标题
                            title_prefix_nc = f"## {section_title}"
                            while stripped_nc.startswith(title_prefix_nc):
                                rest_nc = stripped_nc[len(title_prefix_nc):].lstrip()
                                if rest_nc.startswith(title_prefix_nc):
                                    stripped_nc = rest_nc
                                else:
                                    break
                            if not stripped_nc.startswith(f"## {section_title}"):
                                if stripped_nc.startswith(section_title):
                                    stripped_nc = stripped_nc[len(section_title):].lstrip()
                                elif stripped_nc.startswith(f"# {section_title}"):
                                    stripped_nc = stripped_nc[len(f"# {section_title}"):].lstrip()
                                elif stripped_nc.startswith(f"### {section_title}"):
                                    stripped_nc = stripped_nc[len(f"### {section_title}"):].lstrip()
                                elif stripped_nc.startswith("## "):
                                    stripped_nc = re.sub(r'^##\s+[^\n]*\n+', '', stripped_nc)
                                new_content = f"## {section_title}\n\n{stripped_nc}"
                            # 去除末尾可能多余的 ## 标题（LLM可能预生成了下一章节的标题）
                            new_content = re.sub(r'\n*##\s+[^\n]*\s*$', '', new_content.rstrip())
                            section_results[idx]["content"] = new_content
                            section_val = validate_report(
                                report_content=new_content,
                                outline=section_outline,
                                context_data=req.context_data,
                                min_words=s_min,
                                max_words=s_max,
                                is_section=True,
                            )
                            section_results[idx]["passed"] = not any(
                                e.severity == "critical" for e in section_val.errors
                            )
                            section_results[idx]["word_count"] = section_val.word_count

                    if affected_titles:
                        logger.info("[report] 定向修复完成，修复章节: %s", ", ".join(affected_titles))
                    await asyncio.sleep(0.5)

                # 最终组装（开头插入后端确定性渲染的"报告基础信息"表，
                # 分章节流程只产出 ## 章节内容，头部基础信息表须由后端补充）
                report_header = _render_report_header(req.context_data)
                if compressed_final:
                    # 字数超标触发过全文压缩：直接使用压缩后的整篇报告，
                    # 并在开头补插报告基础信息表（压缩输入不含该表）
                    if report_header and report_header not in compressed_final:
                        final_response = report_header + "\n\n" + compressed_final
                    else:
                        final_response = compressed_final
                else:
                    parts = [sr["content"] for sr in section_results if sr["content"]]
                    if report_header:
                        parts.insert(0, report_header)
                    final_response = "\n\n".join(parts)

                # 整篇报告的字数统计（优先使用全文验证结果）
                total_word_count = (
                    full_validation.word_count if full_validation
                    else sum(sr.get("word_count", 0) for sr in section_results)
                )

                # 发送最终验证总览（综合章节级 + 全文级验证结果）
                all_passed = all(sr["passed"] for sr in section_results) and (
                    full_validation.passed if full_validation else True
                )
                yield {
                    "event": "validation_summary",
                    "data": json.dumps({
                        "all_passed": all_passed,
                        "total_sections": len(section_results),
                        "passed_sections": sum(1 for sr in section_results if sr["passed"]),
                        "failed_sections": sum(1 for sr in section_results if not sr["passed"]),
                        "total_word_count": total_word_count,
                        "full_report_passed": full_validation.passed if full_validation else True,
                        "sections": [
                            {"title": sr["title"], "passed": sr["passed"], "retries": sr["retries"]}
                            for sr in section_results
                        ],
                    }),
                }

                # 发送最终 done 事件
                yield {
                    "event": "done",
                    "data": json.dumps({
                        "content": final_response,
                        "validation_passed": all_passed,
                        "word_count": total_word_count,
                    }),
                }

            except Exception as e:
                tb = traceback.format_exc()
                logger.error("报告生成流式异常: %s\n%s", e, tb)
                yield {
                    "event": "error",
                    "data": json.dumps({"message": f"报告生成异常: {e}"}),
                }

        return EventSourceResponse(
            event_generator(),
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("报告生成失败: %s", e)
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@router.post("/", response_model=ReportResponse)
async def save_report(
    req: SaveReportRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """保存解盘报告到档案库

    验证逻辑：
    - 若 archive_id 已提供：验证档案归属当前用户
    - 否则：根据 chart_name 自动匹配档案
    - 匹配失败：返回 404 + code=ARCHIVE_NOT_FOUND，前端弹窗提示自动创建档案
    """
    archive_id = req.archive_id

    # 验证或自动匹配档案
    if archive_id is not None:
        # 显式提供 archive_id：验证档案归属当前用户
        result = await db.execute(
            select(BaziArchive).where(
                BaziArchive.id == archive_id,
                BaziArchive.user_id == user_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=404,
                detail={"code": "ARCHIVE_NOT_FOUND", "message": "关联档案不存在或无权访问"}
            )
    else:
        # 未提供 archive_id：根据 chart_name + birth_datetime 精确匹配档案
        if not req.chart_name:
            raise HTTPException(
                status_code=400,
                detail={"code": "MISSING_CHART_NAME", "message": "缺少 chart_name 无法匹配档案"}
            )

        # 优先按 name + birth_datetime 精确匹配（避免同名档案匹配错误）
        if req.birth_datetime:
            result = await db.execute(
                select(BaziArchive).where(
                    BaziArchive.user_id == user_id,
                    BaziArchive.name == req.chart_name,
                    BaziArchive.birth_datetime == req.birth_datetime,
                ).limit(1)
            )
            archive = result.scalar_one_or_none()
        else:
            archive = None

        # 精确匹配失败时，回退到仅按 name 匹配
        if not archive:
            result = await db.execute(
                select(BaziArchive).where(
                    BaziArchive.user_id == user_id,
                    BaziArchive.name == req.chart_name,
                ).limit(1)
            )
            archive = result.scalar_one_or_none()

        if not archive:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "ARCHIVE_NOT_FOUND",
                    "message": f"未找到命主「{req.chart_name}」的排盘档案，请先保存档案"
                }
            )
        archive_id = archive.id

    report = BaziReport(
        user_id=user_id,
        archive_id=archive_id,
        title=req.title,
        chart_type=req.chart_type,
        chart_name=req.chart_name,
        skill_name=req.skill_name,
        report_format=req.report_format,
        report_content=req.report_content,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    logger.info("用户 %d 保存解盘报告: %s (archive_id=%d)", user_id, req.title, archive_id)
    return ReportResponse.from_orm(report)


@router.get("/", response_model=ReportListResponse)
async def list_reports(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    keyword: Optional[str] = Query(None, description="搜索关键字"),
    chart_type: Optional[str] = Query(None, description="排盘类型筛选"),
    archive_id: Optional[int] = Query(None, description="档案ID筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """查询解盘报告列表"""
    query = select(BaziReport).where(BaziReport.user_id == user_id)

    if keyword:
        kw = f"%{keyword}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                BaziReport.title.ilike(kw),
                BaziReport.chart_name.ilike(kw),
            )
        )

    if chart_type:
        query = query.where(BaziReport.chart_type == chart_type)

    if archive_id is not None:
        query = query.where(BaziReport.archive_id == archive_id)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(BaziReport.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = [ReportResponse.from_orm(r) for r in result.scalars().all()]

    return ReportListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/{report_id}/pdf")
async def get_report_pdf(
    report_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    根据已保存的报告 ID 生成 PDF 文件。

    从数据库获取报告内容（Markdown）后，使用 fpdf2 渲染为 PDF 并返回。
    """
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.id == report_id,
            BaziReport.user_id == user_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")

    try:
        from ...core.pdf_generator import generate_pdf_from_markdown

        pdf_bytes = generate_pdf_from_markdown(
            markdown_content=report.report_content or "",
            title=report.title or "解盘报告",
            date_str=report.created_at.strftime("%Y-%m-%d") if report.created_at else "",
            chart_type=report.chart_type or "",
            chart_name=report.chart_name or "",
            skill_name=report.skill_name or "",
        )

        safe_title = (report.title or "解盘报告").replace("/", "_").replace("\\", "_").replace(" ", "_")
        encoded_filename = quote(f"{safe_title}.pdf")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    except Exception as e:
        logger.exception("PDF 生成失败: report_id=%d, error=%s", report_id, e)
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {str(e)}")


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取报告详情"""
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.id == report_id,
            BaziReport.user_id == user_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")
    return ReportResponse.from_orm(report)


@router.put("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: int,
    req: UpdateReportRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新报告"""
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.id == report_id,
            BaziReport.user_id == user_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")

    if req.title is not None:
        report.title = req.title
    if req.report_content is not None:
        report.report_content = req.report_content
    report.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(report)

    logger.info("用户 %d 更新报告: %s (id=%d)", user_id, report.title, report_id)
    return ReportResponse.from_orm(report)


@router.delete("/{report_id}", response_model=MessageResponse)
async def delete_report(
    report_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除报告"""
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.id == report_id,
            BaziReport.user_id == user_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="报告不存在")

    await db.execute(delete(BaziReport).where(BaziReport.id == report_id))
    await db.commit()

    logger.info("用户 %d 删除报告: %s (id=%d)", user_id, report.title, report_id)
    return MessageResponse(message="报告已删除")


class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, description="要删除的报告ID列表")


@router.post("/batch-delete", response_model=MessageResponse)
async def batch_delete_reports(
    req: BatchDeleteRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """批量删除报告"""
    result = await db.execute(
        delete(BaziReport).where(
            BaziReport.id.in_(req.ids),
            BaziReport.user_id == user_id,
        )
    )
    await db.commit()

    count = result.rowcount
    logger.info("用户 %d 批量删除报告: %d 条", user_id, count)
    return MessageResponse(message=f"已删除 {count} 条报告")


# ── PDF 生成 ──

class GeneratePdfRequest(BaseModel):
    """PDF 生成请求"""
    report_content: str = Field(..., min_length=1, description="报告内容（Markdown 格式）")
    title: str = Field(default="解盘报告", max_length=128, description="报告标题")
    date_str: str = Field(default="", description="生成日期")
    chart_type: str = Field(default="", description="排盘类型")
    chart_name: str = Field(default="", max_length=64, description="命主姓名")
    skill_name: str = Field(default="", max_length=64, description="解盘技能名称")


@router.post("/pdf/generate")
async def generate_pdf(req: GeneratePdfRequest):
    """
    从 Markdown 内容生成 PDF 文件。

    使用 fpdf2 库在服务端直接渲染 Markdown → PDF，
    不依赖任何 HTML 技术，生成真实文本 PDF（文字可选中、可搜索）。
    """
    try:
        from ...core.pdf_generator import generate_pdf_from_markdown

        pdf_bytes = generate_pdf_from_markdown(
            markdown_content=req.report_content,
            title=req.title,
            date_str=req.date_str,
            chart_type=req.chart_type,
            chart_name=req.chart_name,
            skill_name=req.skill_name,
        )

        # 生成安全的文件名（RFC 5987 编码支持中文）
        safe_title = req.title.replace("/", "_").replace("\\", "_").replace(" ", "_")
        encoded_filename = quote(f"{safe_title}.pdf")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    except Exception as e:
        logger.exception("PDF 生成失败: %s", e)
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {str(e)}")
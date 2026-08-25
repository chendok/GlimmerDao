"""报告自动验证服务

在报告生成完成后执行规则化验证（不调用 LLM，确保快速），
覆盖四个维度：内容完整性、格式规范性、数据准确性、逻辑一致性。
验证失败时构建修复指令供 LLM 重新生成。
"""

from __future__ import annotations

import re
import json
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class Severity(str, Enum):
    CRITICAL = "critical"   # 必须修复，否则报告不可用
    MAJOR = "major"         # 严重影响质量，应修复
    MINOR = "minor"         # 轻微问题，可忽略


class Dimension(str, Enum):
    COMPLETENESS = "content_completeness"
    FORMAT = "format_compliance"
    DATA_ACCURACY = "data_accuracy"
    LOGIC = "logical_consistency"


@dataclass
class ValidationError:
    dimension: str
    severity: str
    message: str
    location: str = ""  # 章节标题或行号


@dataclass
class ValidationResult:
    passed: bool
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    scores: dict[str, float] = field(default_factory=dict)
    word_count: int = 0
    word_count_in_range: bool = True
    chapters_found: list[str] = field(default_factory=list)
    chapters_missing: list[str] = field(default_factory=list)
    loop_index: int = 0  # 第几轮验证（0=首次）

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "errors": [
                {"dimension": e.dimension, "severity": e.severity, "message": e.message, "location": e.location}
                for e in self.errors
            ],
            "warnings": self.warnings,
            "scores": self.scores,
            "word_count": self.word_count,
            "word_count_in_range": self.word_count_in_range,
            "chapters_found": self.chapters_found,
            "chapters_missing": self.chapters_missing,
            "loop_index": self.loop_index,
        }


# ── 提取工具 ──

def _extract_headings(content: str) -> list[tuple[int, str]]:
    """提取 Markdown 标题，返回 [(层级, 标题文本), ...]"""
    headings = []
    for line in content.split("\n"):
        m = re.match(r'^(#{1,6})\s+(.+?)\s*$', line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            headings.append((level, title))
    return headings


def _extract_outline_titles(outline: list[dict]) -> list[str]:
    """递归提取 outline 中所有节点的标题"""
    titles = []
    for node in outline:
        if node.get("title"):
            titles.append(node["title"])
        children = node.get("children", [])
        if children:
            titles.extend(_extract_outline_titles(children))
    return titles


def _count_chinese_chars(text: str) -> int:
    """统计汉字数量"""
    return len(re.findall(r'[\u4e00-\u9fff]', text))


def _extract_key_data_from_context(context_data: str) -> list[str]:
    """从排盘数据 JSON 中提取关键数据点（干支、神煞等），用于交叉验证"""
    key_points: list[str] = []
    data = _parse_context_json(context_data)
    if not data:
        return key_points

    # 提取四柱干支
    for field_name in ["bazi", "sizhu", "four_pillars", "year_pillar", "month_pillar",
                       "day_pillar", "hour_pillar", "ganzhi", "天干", "地支"]:
        val = _dig_field(data, field_name)
        if val:
            if isinstance(val, str):
                key_points.append(val)
            elif isinstance(val, dict):
                for v in val.values():
                    if isinstance(v, str) and len(v) <= 20:
                        key_points.append(v)

    # 提取大运干支
    for field_name in ["dayun", "da_yun", "大运", "major_luck"]:
        val = _dig_field(data, field_name)
        if val and isinstance(val, list):
            for item in val[:5]:  # 只取前5步大运
                if isinstance(item, dict):
                    gz = item.get("ganzhi") or item.get("干支") or ""
                    if gz:
                        key_points.append(gz)
                elif isinstance(item, str):
                    key_points.append(item)

    # 提取命主姓名
    for field_name in ["name", "姓名", "username"]:
        val = _dig_field(data, field_name)
        if val and isinstance(val, str) and len(val) <= 20:
            key_points.append(val)

    return key_points


def _dig_field(data: dict, key: str):
    """递归查找字段（支持嵌套 dict）"""
    if not isinstance(data, dict):
        return None
    if key in data:
        return data[key]
    key_lower = key.lower()
    for k, v in data.items():
        if k.lower() == key_lower:
            return v
        if isinstance(v, dict):
            result = _dig_field(v, key)
            if result is not None:
                return result
    return None


def _parse_context_json(context_data: str):
    """解析排盘上下文数据为 dict。

    兼容两种格式：
    1. 纯 JSON 字符串
    2. 带 Markdown 包装（含 ```json ... ``` 代码块）
    """
    if not context_data:
        return None
    if isinstance(context_data, dict):
        return context_data
    s = context_data
    # 优先提取 ```json ... ``` 代码块（与 report.py 的 _render_report_header 一致）
    m = re.search(r'```json\s*(.*?)\s*```', s, re.DOTALL)
    if m:
        s = m.group(1)
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return None


def _extract_chart_type(context_data: str) -> str:
    """从排盘上下文 JSON 中提取 chartType（如「八字」「紫微斗数」），用于类型专属校验"""
    data = _parse_context_json(context_data)
    if not data:
        return ""
    return str(data.get("chartType") or data.get("chart_type") or "")


# ── 四维度验证 ──

def _check_completeness(
    report: str, outline_titles: list[str]
) -> tuple[list[ValidationError], list[str], list[str], float]:
    """维度1：内容完整性 — 检查 outline 中所有章节是否都出现在报告中"""
    errors: list[ValidationError] = []
    warnings: list[str] = []
    found: list[str] = []
    missing: list[str] = []

    headings = _extract_headings(report)
    heading_texts = [h[1] for h in headings]

    for title in outline_titles:
        # 精确匹配或模糊包含
        matched = any(title == ht or title in ht or ht in title for ht in heading_texts)
        if matched:
            found.append(title)
        else:
            missing.append(title)
            errors.append(ValidationError(
                dimension=Dimension.COMPLETENESS.value,
                severity=Severity.MAJOR.value,
                message=f"缺少必要章节：{title}",
                location=title,
            ))

    # 检查是否有空章节（标题后紧跟另一个标题，中间无实质内容）
    lines = report.split("\n")
    for i, line in enumerate(lines):
        if re.match(r'^#{1,6}\s+', line):
            # 检查下一个非空行是否也是标题
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and re.match(r'^#{1,6}\s+', lines[j]):
                title_text = re.sub(r'^#{1,6}\s+', '', line).strip()
                errors.append(ValidationError(
                    dimension=Dimension.COMPLETENESS.value,
                    severity=Severity.MINOR.value,
                    message=f"章节内容为空：{title_text}",
                    location=title_text,
                ))

    total = len(outline_titles) if outline_titles else 1
    score = len(found) / total
    return errors, warnings, found, missing, score


def _check_format(report: str) -> tuple[list[ValidationError], float]:
    """维度2：格式规范性 — 检查 Markdown 结构"""
    errors: list[ValidationError] = []
    lines = report.split("\n")

    # 检查是否以 # 标题开头
    if not report.strip().startswith("#"):
        errors.append(ValidationError(
            dimension=Dimension.FORMAT.value,
            severity=Severity.MAJOR.value,
            message="报告未以 Markdown 标题开头",
        ))

    # 检查标题层级是否跳跃（如 # 直接跳到 ###）
    prev_level = 0
    for line in lines:
        m = re.match(r'^(#{1,6})\s+', line)
        if m:
            level = len(m.group(1))
            if prev_level > 0 and level > prev_level + 1:
                title_text = re.sub(r'^#{1,6}\s+', '', line).strip()
                errors.append(ValidationError(
                    dimension=Dimension.FORMAT.value,
                    severity=Severity.MINOR.value,
                    message=f"标题层级跳跃：从 H{prev_level} 直接到 H{level}（{title_text}）",
                    location=title_text,
                ))
            prev_level = level

    # 检查表格格式（行内 | 数量是否一致）
    table_lines = [i for i, line in enumerate(lines) if line.strip().startswith("|")]
    if table_lines:
        pipe_counts = [lines[i].count("|") for i in table_lines]
        if len(set(pipe_counts)) > 1 and len(table_lines) > 2:
            errors.append(ValidationError(
                dimension=Dimension.FORMAT.value,
                severity=Severity.MINOR.value,
                message="Markdown 表格列数不一致",
            ))

    total_checks = 3
    passed = total_checks - sum(1 for e in errors if e.severity != Severity.MINOR.value)
    score = max(0.0, passed / total_checks)
    return errors, score


def _check_data_accuracy(report: str, context_data: str) -> tuple[list[ValidationError], float]:
    """维度3：数据准确性 — 从排盘数据中提取关键数据点，验证是否在报告中出现"""
    errors: list[ValidationError] = []
    key_points = _extract_key_data_from_context(context_data)

    if not key_points:
        return errors, 1.0  # 无法提取数据点时跳过

    missing_points: list[str] = []
    for point in key_points:
        # 跳过过短的数据点（如单字"甲"可能误匹配）
        if len(point) >= 2 and point not in report:
            missing_points.append(point)

    # 允许部分数据点缺失（报告中可能用不同表述），但超过 30% 缺失则报错
    missing_ratio = len(missing_points) / len(key_points) if key_points else 0
    if missing_ratio > 0.3:
        errors.append(ValidationError(
            dimension=Dimension.DATA_ACCURACY.value,
            severity=Severity.MAJOR.value,
            message=f"排盘数据中 {len(missing_points)}/{len(key_points)} 个关键数据点未在报告中出现"
                    f"（缺失率 {missing_ratio:.0%}），可能存在数据遗漏",
            location=", ".join(missing_points[:5]),
        ))
    elif missing_points:
        errors.append(ValidationError(
            dimension=Dimension.DATA_ACCURACY.value,
            severity=Severity.MINOR.value,
            message=f"{len(missing_points)} 个数据点未出现：{', '.join(missing_points[:3])}{'...' if len(missing_points) > 3 else ''}",
        ))

    score = 1.0 - missing_ratio
    return errors, score


def _check_dayun_years(report: str, context_data: str) -> tuple[list[ValidationError], float]:
    """维度3附加：大运年份准确性 — 从排盘数据提取各步大运的精确起止公历年份，
    比对报告中「某干支大运」对应的年份区间，检测 LLM 自行推算导致的年份错误。

    例如：丁丑大运真实为 2022-2031 年，报告误写「2021-2030年」即触发。
    """
    errors: list[ValidationError] = []
    data = _parse_context_json(context_data)
    if not data:
        return errors, 1.0

    dayun = data.get("daYun") or data.get("daXian") or data.get("daYunList")
    if not isinstance(dayun, list) or not dayun:
        return errors, 1.0

    # 从报告中提取「<干支>大运（<年>-<年>年）」或「<干支>大运（<年>-<年>）」模式
    # 兼容「丁丑大运（2021-2030年）」「丁丑（2022-2031年）」「丁丑大运 2021-2030」等写法
    found_errors = 0
    for dy in dayun:
        if not isinstance(dy, dict):
            continue
        gz = dy.get("ganZhi") or f"{dy.get('gan', '')}{dy.get('zhi', '')}"
        start_year = dy.get("startYear")
        end_year = dy.get("endYear")
        if not gz or not start_year or not end_year:
            continue

        # 在报告中查找该干支附近 0~12 字内的「XXXX-YYYY」年份区间
        # 例如「丁丑大运（2021-2030年）」「丁丑大运 2021-2030」
        pat = re.compile(
            re.escape(gz) + r"[^\d]{0,12}?(\d{4})\s*[-—~～至]\s*(\d{4})"
        )
        for m in pat.finditer(report):
            rep_start = int(m.group(1))
            rep_end = int(m.group(2))
            # 年份区间需与真实区间一致（允许 ±0，因为大运起止年份是确定性的）
            if rep_start != int(start_year) or rep_end != int(end_year):
                found_errors += 1
                errors.append(ValidationError(
                    dimension=Dimension.DATA_ACCURACY.value,
                    severity=Severity.CRITICAL.value,
                    message=(
                        f"大运年份错误：{gz}大运真实起止为 {start_year}-{end_year} 年，"
                        f"报告中写为 {rep_start}-{rep_end} 年。大运年份必须严格引用排盘数据，禁止自行推算"
                    ),
                ))
                break  # 每步大运只报一次，避免重复

    score = 1.0 if not errors else max(0.0, 1.0 - found_errors * 0.2)
    return errors, score


# 常见矛盾模式（同一报告中不应同时出现的互斥判断）
_CONTRADICTION_PATTERNS = [
    (r"身强", r"身弱", "命局旺衰判断矛盾：同时出现「身强」和「身弱」"),
    (r"用神为[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]", r"忌神为[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]", "用神与忌神可能冲突"),
    (r"格局为正官", r"格局为七杀", "格局判断矛盾：正官与七杀并存"),
    # 得令/失令 是互斥判断（同一命局对「得令」的结论必须唯一）
    # 肯定表述：得令前不是「不」字；否定表述：失令 或 不得令
    (r"(?<!不)得令", r"失令|不得令", "得令判断矛盾：同一命局既出现「得令」又出现「失令/不得令」，必须统一（壬水在申月为长生，属得令/得印生，不得与「失令」并列）"),
]

# 禁止内容模式（LLM 常见事实性错误，需强制检测并触发修复）
# 每条为 (正则, 修复提示)。全文验证时升级为 CRITICAL。
_FORBIDDEN_CONTENT_PATTERNS = [
    (r'辰.{0,6}未.{0,6}破|未.{0,6}辰.{0,6}破',
     '报告中出现「辰未相破」，辰未不是标准相破关系。相破仅6组：子酉/丑辰/寅亥/卯午/巳申/未戌。请移除所有辰未相破的描述'),
    # 地支关系错误：原局（本命）层面出现「丑」与「未」的冲/刑关系。
    # 原局四柱地支为寅、申、辰、午，既无「丑」也无「未」，故任何「原局丑未冲/三刑」均为凭空编造。
    # 注意：大运/流年层面（如「丁丑大运」遇「丁未流年」）的丑未冲是合理关系，不得误报。
    # 因此仅检测「原局/命局/本命/四柱/地支」等原局语境词附近的丑未冲刑，排除大运/流年语境。
    (r'(原局|命局|本命|四柱|地支|命盘).{0,12}(丑.{0,4}未|未.{0,4}丑).{0,6}(冲|刑)|(丑.{0,4}未|未.{0,4}丑).{0,6}(冲|刑).{0,12}(原局|命局|本命|四柱|地支)',
     '原局出现「丑未」冲刑关系（如丑未冲、丑未三刑）。原局四柱地支为寅、申、辰、午，既无「丑」也无「未」，任何原局层面的丑未冲刑都是凭空编造。请核对：若为原局地支关系，请改写为原局实际存在的组合；若为大运/流年层面（如丁丑大运遇未年）的合理冲，请明确标注「大运」或「流年」字样'),
    # 十二长生错误：壬水/癸水在申为「长生」，不是「临官」
    (r'壬水.{0,4}临官于申|癸水.{0,4}临官于申|壬.{0,4}临官于申|癸.{0,4}临官于申',
     '十二长生错误：壬水/癸水在申是「长生」，不是「临官」（壬水长生在申、临官在亥）。请修正十二长生定位'),
    # 得令/失令 矛盾：针对「日主/原局/命局」层面的得令判断，不得既出现「得令/当令」又出现「失令/不得令」。
    # 壬水生于申月，申为长生、金旺生水，属「得令/得印生」，结论必须唯一为「得令」。
    # 限定在「日主/身/原局/命局/月令」语境，避免误伤「某大运得令、某流年失令」这类不同时间维度的合理对比。
    # 等价词：得令=当令=得时；失令=不得令=失时。
    (r'(日主|壬水|癸水|身弱|身强|原局|命局|月令).{0,40}(得令|当令).{0,40}(失令|不得令)|(日主|壬水|癸水|身弱|身强|原局|命局|月令).{0,40}(失令|不得令).{0,40}(得令|当令)',
     '得令判断矛盾：对日主/原局/命局的得令判断既出现「得令/当令」又出现「失令/不得令」，必须统一。日主壬水生于申月（长生、金旺生水），属「得令/得印生」，不得与「失令」并列，请删除所有对原局日主的「失令/不得令」错误表述'),
    # 十二长生误用日柱：日主的十二长生必须以「月令」为准（壬水申月=长生），
    # 不得把「日柱地支」所处的十二长生（如日柱辰=墓）当作日主的十二长生状态。
    (r'(日主|壬水|癸水).{0,6}十二长生(为|状态为|是).{0,6}(墓|绝|胎|养|衰|病|死)',
     '十二长生误用：日主十二长生必须以「月令」为准。壬水生于申月，十二长生为「长生」，不得把日柱地支（辰=墓）当作日主的十二长生状态。请将日主十二长生统一为「长生」，日柱的「墓」仅属于日柱地支自身、不得当作日主状态'),
    # 半合中神错误：三合局中神必为「子午卯酉」（生旺墓三字中「旺」为中神），
    # 墓库（辰戌丑未）永不为中神。仅检测「中神/缺中神」后紧跟墓库的错误表述。
    # 例如「午寅半合火局（缺中神戌）」错误——寅午戌火局中神是午（旺），不是戌（墓库）。
    (r'(缺中神|中神为|中神是|中神系|中神：|中神:)\s*[（(]?\s*(辰|戌|丑|未)',
     '半合中神错误：三合局的中神必为「子午卯酉」（旺位），墓库「辰戌丑未」永远不是中神。报告将墓库误写为中神（如「午寅半合缺中神戌」，寅午戌火局中神应为「午」），请修正中神标注：半合是否成立以是否含「子午卯酉」中神为准'),
]

# 八字报告禁止出现的概念（紫微斗数专用，混入八字属概念错误）
# 仅当 chart_type 为八字时启用
_BAZI_FORBIDDEN_CONCEPTS = [
    (r'身宫', '八字报告出现「身宫」，这是紫微斗数概念，八字排盘只有「命宫」「胎元」，请删除所有身宫相关描述'),
]


def get_forbidden_patterns(chart_type: str = "") -> list[tuple[str, str]]:
    """返回当前排盘类型下所有应检测的「禁止内容」规则（供验证与定向修复共用）

    chart_type 为空时仅返回通用禁止规则；为八字时追加八字专属禁止概念。
    """
    patterns = list(_FORBIDDEN_CONTENT_PATTERNS)
    if chart_type in ("八字", "四柱八字", "bazi"):
        patterns.extend(_BAZI_FORBIDDEN_CONCEPTS)
    return patterns


def _check_logic(report: str, is_full_report: bool = False, chart_type: str = "") -> tuple[list[ValidationError], float]:
    """维度4：逻辑一致性 — 检查常见矛盾模式和禁止内容

    参数:
        is_full_report: True 时禁止内容升级为 CRITICAL（事实性错误必须修正）
        chart_type: 排盘类型（如「八字」「紫微斗数」），用于区分仅特定类型禁用的概念
    """
    errors: list[ValidationError] = []

    for pat_a, pat_b, msg in _CONTRADICTION_PATTERNS:
        matches_a = re.findall(pat_a, report)
        matches_b = re.findall(pat_b, report)
        if matches_a and matches_b:
            # 进一步检查：是否在同一章节中出现
            errors.append(ValidationError(
                dimension=Dimension.LOGIC.value,
                severity=Severity.MAJOR.value,
                message=msg,
            ))

    # 检查禁止内容（LLM 常见错误模式）——全文验证时为 CRITICAL，触发定向修复
    forbidden_severity = Severity.CRITICAL.value if is_full_report else Severity.MAJOR.value
    for pattern, msg in get_forbidden_patterns(chart_type):
        if re.search(pattern, report):
            errors.append(ValidationError(
                dimension=Dimension.LOGIC.value,
                severity=forbidden_severity,
                message=msg,
            ))

    score = max(0.0, 1.0 - len(errors) * 0.5)
    return errors, score


# ── 主入口 ──

def validate_report(
    report_content: str,
    outline: list[dict] | None = None,
    context_data: str = "",
    min_words: int | None = None,
    max_words: int | None = None,
    loop_index: int = 0,
    is_section: bool = False,
) -> ValidationResult:
    """执行完整验证流程，返回 ValidationResult

    参数:
        report_content: 报告 Markdown 内容
        outline: 报告目录结构
        context_data: 排盘数据 JSON 字符串
        min_words: 最低字数要求
        max_words: 最高字数要求
        loop_index: 第几轮验证（0=首次生成后）
        is_section: 是否为章节级验证。True 时字数问题降级为 MAJOR（仅展示，不触发重试）
    """
    outline = outline or []
    all_errors: list[ValidationError] = []
    all_warnings: list[str] = []
    scores: dict[str, float] = {}

    # 字数统计（带 ±30% 容差，避免 LLM 难以精确命中字数导致频繁重试）
    word_count = _count_chinese_chars(report_content)
    word_count_in_range = True
    tolerance = 0.30  # 容差比例（从 20% 放宽至 30%）
    # 章节级验证时，字数问题降级为 MAJOR（仅展示，不触发重试）
    word_count_severity = Severity.MAJOR.value if is_section else Severity.CRITICAL.value
    if min_words is not None:
        effective_min = int(min_words * (1 - tolerance))
        if word_count < effective_min:
            word_count_in_range = False
            all_errors.append(ValidationError(
                dimension=Dimension.COMPLETENESS.value,
                severity=word_count_severity,
                message=f"报告字数 {word_count} 字，低于最低要求 {min_words} 字（容差后 {effective_min} 字），差额 {min_words - word_count} 字",
            ))
    if max_words is not None and word_count > max_words:
        effective_max = int(max_words * (1 + tolerance))
        if word_count > effective_max:
            word_count_in_range = False
            overflow_ratio = (word_count - max_words) / max_words
            severity = word_count_severity if is_section else (Severity.CRITICAL.value if overflow_ratio >= 0.5 else Severity.MAJOR.value)
            all_errors.append(ValidationError(
                dimension=Dimension.COMPLETENESS.value,
                severity=severity,
                message=f"报告字数 {word_count} 字，超出最高限制 {max_words} 字（容差后 {effective_max} 字），超出 {word_count - max_words} 字（{overflow_ratio:.0%}）",
            ))

    # 维度1：内容完整性
    outline_titles = _extract_outline_titles(outline)
    c_errors, c_warnings, found, missing, c_score = _check_completeness(report_content, outline_titles)
    all_errors.extend(c_errors)
    all_warnings.extend(c_warnings)
    scores[Dimension.COMPLETENESS.value] = c_score

    # 维度2：格式规范性
    f_errors, f_score = _check_format(report_content)
    all_errors.extend(f_errors)
    scores[Dimension.FORMAT.value] = f_score

    # 维度3：数据准确性
    d_errors, d_score = _check_data_accuracy(report_content, context_data)
    all_errors.extend(d_errors)
    scores[Dimension.DATA_ACCURACY.value] = d_score

    # 维度3附加：大运年份准确性（确定性校验，报告大运年份必须与排盘数据严格一致）
    dy_errors, dy_score = _check_dayun_years(report_content, context_data)
    all_errors.extend(dy_errors)
    if dy_errors:
        # 大运年份错误也计入数据准确性维度，拉低该维度分数
        scores[Dimension.DATA_ACCURACY.value] = min(
            scores[Dimension.DATA_ACCURACY.value], dy_score
        )

    # 维度4：逻辑一致性（全文验证时禁止内容升级为 CRITICAL）
    chart_type = _extract_chart_type(context_data)
    l_errors, l_score = _check_logic(report_content, is_full_report=not is_section, chart_type=chart_type)
    all_errors.extend(l_errors)
    scores[Dimension.LOGIC.value] = l_score

    # 判定是否通过：仅 critical 错误触发失败（major 降级为警告，避免频繁重试）
    has_critical = any(e.severity == Severity.CRITICAL.value for e in all_errors)
    has_major = any(e.severity == Severity.MAJOR.value for e in all_errors)
    passed = not has_critical

    logger.info(
        "[validator] 验证完成 loop=%d passed=%s word_count=%d errors=%d (critical=%d major=%d minor=%d) "
        "scores=%s",
        loop_index, passed, word_count, len(all_errors),
        sum(1 for e in all_errors if e.severity == Severity.CRITICAL.value),
        sum(1 for e in all_errors if e.severity == Severity.MAJOR.value),
        sum(1 for e in all_errors if e.severity == Severity.MINOR.value),
        scores,
    )

    return ValidationResult(
        passed=passed,
        errors=all_errors,
        warnings=all_warnings,
        scores=scores,
        word_count=word_count,
        word_count_in_range=word_count_in_range,
        chapters_found=found,
        chapters_missing=missing,
        loop_index=loop_index,
    )


def build_fix_instruction(result: ValidationResult) -> str:
    """根据验证结果构建修复指令，供 LLM 重新生成时使用"""
    if result.passed:
        return ""

    lines = ["\n\n## 上次生成报告的验证结果（请根据以下问题修正后重新生成完整报告）\n"]

    # 按严重程度排序
    severity_order = {Severity.CRITICAL.value: 0, Severity.MAJOR.value: 1, Severity.MINOR.value: 2}
    sorted_errors = sorted(result.errors, key=lambda e: severity_order.get(e.severity, 3))

    for i, err in enumerate(sorted_errors, 1):
        severity_label = {"critical": "严重", "major": "重要", "minor": "轻微"}.get(err.severity, err.severity)
        dimension_label = {
            Dimension.COMPLETENESS.value: "内容完整性",
            Dimension.FORMAT.value: "格式规范性",
            Dimension.DATA_ACCURACY.value: "数据准确性",
            Dimension.LOGIC.value: "逻辑一致性",
        }.get(err.dimension, err.dimension)
        lines.append(f"{i}. [{severity_label}] {dimension_label}：{err.message}")
        if err.location:
            lines.append(f"   位置：{err.location}")

    # 添加分维度评分
    lines.append("\n### 各维度评分")
    for dim, score in result.scores.items():
        dim_label = {
            Dimension.COMPLETENESS.value: "内容完整性",
            Dimension.FORMAT.value: "格式规范性",
            Dimension.DATA_ACCURACY.value: "数据准确性",
            Dimension.LOGIC.value: "逻辑一致性",
        }.get(dim, dim)
        lines.append(f"- {dim_label}：{score:.0%}")

    # 字数信息
    lines.append(f"\n当前字数：{result.word_count} 字")

    lines.append("\n### 修复要求")
    lines.append("- 请针对以上问题逐项修正，输出完整的修正后报告（从第一个 # 标题开始）")
    lines.append("- 不要输出任何解释、说明或确认语，直接输出修正后的完整报告内容")

    return "\n".join(lines)


MAX_VALIDATION_LOOPS = 3  # 最大验证-修复循环次数

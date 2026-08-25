"""
Skill 基础定义

每个 Skill 是一个自包含的模块，包含：
- 元数据 (名称、描述、关键词)
- 专属 System Prompt
- 上下文数据要求

支持两种加载方式：
1. SKILL.md 单文件模式（推荐）：YAML frontmatter + Markdown body
2. meta.json + prompt.txt 传统模式（向后兼容）
"""

import json
import logging
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


SKILL_DIR = Path(__file__).resolve().parents[4] / ".skill"

# SKILL.md frontmatter 分隔符正则
_FRONTMATTER_RE = re.compile(
    r'^---\s*\n(.*?)\n---\s*\n?(.*)$',
    re.DOTALL,
)

# 从 description 中提取 Triggers 关键词：
# 匹配 "Triggers:" 后跟若干引号包裹的关键词，跨行支持
_TRIGGERS_RE = re.compile(
    r'Triggers?\s*:\s*(.+?)(?:\n\s*\n|\n[a-zA-Z_]+:|\Z)',
    re.DOTALL,
)
_QUOTED_KEYWORD_RE = re.compile(r'"([^"]+)"|\'([^\']+)\'')

# 提取 Markdown 中第一个 H1 作为 display_name
_FIRST_H1_RE = re.compile(r'^#\s+(.+?)\s*$', re.MULTILINE)


@dataclass
class SkillDefinition:
    """Skill 定义"""
    name: str                                    # 唯一标识: bazi_analysis
    display_name: str                            # 展示名称: 八字精批
    description: str                             # 简短描述
    icon: str                                    # 图标 emoji
    keywords: list[str] = field(default_factory=list)  # 触发关键词
    prompt: str = ""                             # 专属 System Prompt
    auto_detect: bool = True                     # 是否自动匹配
    context_requires: Optional[str] = None       # 上下文依赖: "bazi" | "ziwei" | None
    source: str = "meta_json"                    # 加载来源: "skill_md" | "meta_json"
    # 报告框架目录：仅报告型 Skill 启用，声明后用户可在前端编辑
    supports_outline: bool = False               # 是否支持 outline 编辑
    outline: list[dict] = field(default_factory=list)  # 默认 outline 树

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "icon": self.icon,
            "keywords": self.keywords,
            "auto_detect": self.auto_detect,
            "context_requires": self.context_requires,
            "supports_outline": self.supports_outline,
            "outline": self.outline,
        }


def _extract_keywords_from_description(description: str) -> list[str]:
    """
    从 description 字段中提取 Triggers 关键词。

    支持格式：
        Triggers: "全面解盘", "八字教程", "学习八字"
        Trigger: 'foo', 'bar'
    """
    if not description:
        return []

    triggers_match = _TRIGGERS_RE.search(description)
    if not triggers_match:
        return []

    raw = triggers_match.group(1)
    keywords: list[str] = []
    for m in _QUOTED_KEYWORD_RE.finditer(raw):
        kw = (m.group(1) or m.group(2) or "").strip()
        if kw:
            keywords.append(kw)
    return keywords


def _extract_display_name_from_body(body: str) -> Optional[str]:
    """从 Markdown body 中提取第一个 H1 标题作为 display_name"""
    if not body:
        return None
    m = _FIRST_H1_RE.search(body)
    if not m:
        return None
    title = m.group(1).strip()
    # 去掉常见后缀装饰（如 "— 纯解盘版"、"Skill" 等保留，但去除多余空白）
    return title if title else None


def _normalize_outline_node(node: Any, depth: int = 0) -> Optional[dict]:
    """
    校验并规范化单个 outline 节点。

    规则：
    - node 必须是 dict
    - 必须有 title 字段且为非空字符串
    - children 若存在必须是 list，递归校验每个子节点
    - depth 超过 5 层时记录 warning 并跳过子节点（避免无限嵌套）
    - 不合规节点返回 None（warning 由调用方记录）

    返回规范化后的 dict：{ title: str, children?: list[dict] }
    """
    if not isinstance(node, dict):
        logger.warning("[skill] outline 节点非 dict 类型，已跳过: %r", node)
        return None

    title = node.get("title")
    if not isinstance(title, str) or not title.strip():
        logger.warning("[skill] outline 节点缺少 title 或 title 非字符串，已跳过: %r", node)
        return None

    result: dict = {"title": title.strip()}

    children_raw = node.get("children")
    if children_raw is None:
        return result
    if not isinstance(children_raw, list):
        logger.warning(
            "[skill] outline 节点 '%s' 的 children 非 list 类型，已忽略 children",
            title,
        )
        return result
    if depth >= 5:
        logger.warning(
            "[skill] outline 节点 '%s' 嵌套深度超过 5 层，已截断子节点",
            title,
        )
        return result

    normalized_children: list[dict] = []
    for child in children_raw:
        normalized = _normalize_outline_node(child, depth + 1)
        if normalized is not None:
            normalized_children.append(normalized)
    if normalized_children:
        result["children"] = normalized_children
    return result


def _normalize_outline(outline_raw: Any) -> list[dict]:
    """
    校验并规范化 outline 列表。

    - outline 必须是 list
    - 每个元素递归校验，不合规的 warning 跳过
    - 返回规范化后的 list[dict]
    """
    if outline_raw is None:
        return []
    if not isinstance(outline_raw, list):
        logger.warning("[skill] outline 字段非 list 类型，已忽略")
        return []
    result: list[dict] = []
    for node in outline_raw:
        normalized = _normalize_outline_node(node, 0)
        if normalized is not None:
            result.append(normalized)
    return result


def parse_skill_md(skill_md_path: Path) -> Optional[SkillDefinition]:
    """
    解析 SKILL.md 文件并构造 SkillDefinition。

    解析规则：
    1. 文件以 `---\n...\n---\n` 形式包含 YAML frontmatter（可选但推荐）
    2. frontmatter 字段：name, display_name, description, icon, auto_detect, context_requires
    3. 若 description 中包含 "Triggers:" 行，提取引号包裹的关键词作为 keywords
    4. frontmatter 之后的 Markdown body 作为 prompt
    5. 若未指定 display_name，使用 body 中第一个 H1 标题
    6. 若未指定 name，使用目录名

    错误处理：
    - 文件读取失败：返回 None，记录 warning
    - YAML 解析失败：返回 None，记录 warning
    - 缺失关键字段：使用合理默认值，不抛异常
    """
    try:
        content = skill_md_path.read_text(encoding="utf-8")
        if content.startswith('\ufeff'):
            content = content[1:]
    except OSError as e:
        logger.warning("[skill] 读取 SKILL.md 失败 %s: %s", skill_md_path, e)
        return None

    # 拆分 frontmatter 和 body
    frontmatter_text = ""
    body = content
    fm_match = _FRONTMATTER_RE.match(content)
    if fm_match:
        frontmatter_text = fm_match.group(1)
        body = fm_match.group(2)
    else:
        # 无 frontmatter，整个文件作为 body
        logger.debug("[skill] %s 无 YAML frontmatter，整体作为 prompt", skill_md_path.name)

    # 解析 frontmatter
    meta: dict = {}
    if frontmatter_text:
        try:
            import yaml
            try:
                parsed = yaml.safe_load(frontmatter_text)
                if isinstance(parsed, dict):
                    meta = parsed
                elif parsed is None:
                    # 空 frontmatter
                    pass
                else:
                    logger.warning(
                        "[skill] %s frontmatter 顶层不是字典，已忽略",
                        skill_md_path.name,
                    )
            except yaml.YAMLError as e:
                logger.warning("[skill] %s YAML 解析失败: %s", skill_md_path.name, e)
                # 继续执行：使用空 meta，body 仍可用
        except ImportError:
            logger.error("[skill] PyYAML 未安装，无法解析 frontmatter")
            return None

    # 提取字段
    dir_name = skill_md_path.parent.name
    name = str(meta.get("name") or dir_name)
    description = str(meta.get("description") or "")
    icon = str(meta.get("icon") or "💬")
    auto_detect = bool(meta.get("auto_detect", True))
    context_requires_raw = meta.get("context_requires")
    context_requires = str(context_requires_raw) if context_requires_raw else None

    # display_name：优先 frontmatter，其次 H1，最后目录名
    display_name = str(meta.get("display_name") or "")
    if not display_name:
        h1 = _extract_display_name_from_body(body)
        display_name = h1 or dir_name

    # keywords：优先 frontmatter 显式声明，否则从 description 中提取
    keywords_raw = meta.get("keywords")
    if isinstance(keywords_raw, list):
        keywords = [str(k) for k in keywords_raw if k]
    elif isinstance(keywords_raw, str) and keywords_raw:
        keywords = [k.strip() for k in keywords_raw.split(",") if k.strip()]
    else:
        keywords = _extract_keywords_from_description(description)

    # supports_outline：显式声明 true 才启用 outline 编辑
    supports_outline_raw = meta.get("supports_outline")
    supports_outline = (
        isinstance(supports_outline_raw, bool) and supports_outline_raw
    ) or (
        isinstance(supports_outline_raw, str)
        and supports_outline_raw.strip().lower() == "true"
    )

    # outline：仅当 supports_outline=true 时才解析校验
    outline: list[dict] = []
    if supports_outline:
        outline = _normalize_outline(meta.get("outline"))
        if outline:
            logger.info(
                "[skill] %s outline 已加载：%d 个顶层节点",
                name,
                len(outline),
            )

    return SkillDefinition(
        name=name,
        display_name=display_name,
        description=description,
        icon=icon,
        keywords=keywords,
        prompt=body.strip(),
        auto_detect=auto_detect,
        context_requires=context_requires,
        source="skill_md",
        supports_outline=supports_outline,
        outline=outline,
    )


def _load_from_meta_json(skill_dir: Path) -> Optional[SkillDefinition]:
    """从 meta.json + prompt.txt 加载 Skill（传统模式，向后兼容）"""
    meta_file = skill_dir / "meta.json"
    prompt_file = skill_dir / "prompt.txt"

    if not meta_file.exists():
        return None

    try:
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("[skill] 解析 meta.json 失败 %s: %s", meta_file, e)
        return None

    prompt = ""
    if prompt_file.exists():
        try:
            prompt = prompt_file.read_text(encoding="utf-8")
        except OSError as e:
            logger.warning("[skill] 读取 prompt.txt 失败 %s: %s", prompt_file, e)

    # supports_outline + outline：传统 meta.json 模式也支持
    supports_outline_raw = meta.get("supports_outline")
    supports_outline = bool(supports_outline_raw)
    outline: list[dict] = []
    if supports_outline:
        outline = _normalize_outline(meta.get("outline"))

    return SkillDefinition(
        name=meta.get("name", skill_dir.name),
        display_name=meta.get("display_name", skill_dir.name),
        description=meta.get("description", ""),
        icon=meta.get("icon", "💬"),
        keywords=meta.get("keywords", []),
        prompt=prompt,
        auto_detect=meta.get("auto_detect", True),
        context_requires=meta.get("context_requires"),
        source="meta_json",
        supports_outline=supports_outline,
        outline=outline,
    )


def load_skill_from_dir(skill_dir: Path) -> Optional[SkillDefinition]:
    """
    从目录加载一个 Skill。

    加载优先级：
    1. SKILL.md（单文件模式，推荐）
    2. meta.json + prompt.txt（传统模式，向后兼容）

    两种模式均失败时返回 None。
    """
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        skill = parse_skill_md(skill_md)
        if skill is not None:
            return skill
        # SKILL.md 存在但解析失败，继续尝试 meta.json 作为兜底
        logger.warning(
            "[skill] %s/SKILL.md 解析失败，尝试回退到 meta.json",
            skill_dir.name,
        )

    return _load_from_meta_json(skill_dir)


def load_all_skills() -> list[SkillDefinition]:
    """加载 .skill 目录下所有 Skill"""
    skills: list[SkillDefinition] = []
    if not SKILL_DIR.exists():
        logger.info("[skill] .skill 目录不存在: %s", SKILL_DIR)
        return skills

    seen_names: set[str] = set()
    try:
        items = sorted(SKILL_DIR.iterdir())
    except OSError as e:
        logger.error("[skill] 读取 .skill 目录失败: %s", e)
        return skills

    for item in items:
        if not item.is_dir():
            continue
        try:
            skill = load_skill_from_dir(item)
        except Exception as e:
            # 单个 Skill 加载异常不应影响整体加载
            logger.exception("[skill] 加载 %s 时发生未预期异常: %s", item.name, e)
            continue

        if skill is None:
            logger.warning("[skill] 跳过 %s：无法识别的 Skill 格式", item.name)
            continue

        if skill.name in seen_names:
            logger.warning(
                "[skill] 检测到重名 Skill '%s'（目录 %s），已跳过",
                skill.name,
                item.name,
            )
            continue

        seen_names.add(skill.name)
        skills.append(skill)
        logger.info(
            "[skill] 已加载 %s (来源=%s, 关键词数=%d)",
            skill.name,
            skill.source,
            len(skill.keywords),
        )

    return skills

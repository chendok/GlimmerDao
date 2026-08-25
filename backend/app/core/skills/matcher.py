"""
Skill 匹配器

根据用户输入内容自动匹配最合适的 Skill。
"""

import re
from .base import SkillDefinition

# 中文标点 + 英文字符分隔
_SPLIT_PATTERN = re.compile(
    r'[\u3000\uff0c\u3002\uff01\uff1f\u3001\uff1b\uff1a'
    r'\u201c\u201d\u2018\u2019\uff08\uff09\s]+'
)


def match_skill(
    user_input: str,
    skills: list[SkillDefinition],
    default_skill_name: str = "general_chat",
) -> SkillDefinition | None:
    """
    根据用户输入匹配 Skill。

    匹配策略：
    1. 遍历所有 auto_detect=True 的 Skill
    2. 对用户输入进行分词，与 Skill 关键词比较
    3. 返回匹配关键词最多的 Skill
    4. 无匹配时返回默认 Skill（general_chat）
    """
    if not skills or not user_input:
        return None

    # 只考虑可自动检测的 Skill
    detectable = [s for s in skills if s.auto_detect]

    if not detectable:
        return None

    # 分词：按中文标点、空格拆分
    tokens = set(_SPLIT_PATTERN.split(user_input))
    # 同时保留原始输入用于子串匹配
    tokens.add(user_input.lower())

    best_skill: SkillDefinition | None = None
    best_score = 0

    for skill in detectable:
        score = 0
        for keyword in skill.keywords:
            # 精确匹配分词
            if keyword in tokens:
                score += 3
            # 子串匹配（用户输入包含关键词）
            elif keyword.lower() in user_input.lower():
                score += 2
            # 关键词包含用户的部分输入
            elif any(token in keyword for token in tokens if len(token) >= 2):
                score += 1

        if score > best_score:
            best_score = score
            best_skill = skill

    # 无匹配时返回默认 Skill
    if best_score == 0 or best_skill is None:
        for skill in skills:
            if skill.name == default_skill_name:
                return skill
        return None

    return best_skill
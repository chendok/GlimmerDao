"""
Skill 系统

提供 Skill 的加载、匹配、上下文注入功能。

特性：
- 支持 SKILL.md 单文件格式和 meta.json+prompt.txt 传统格式
- TTL 缓存：默认 30 秒内复用缓存，过期后自动重新扫描 .skill 目录
- 支持手动 reload() 强制刷新
- 文件修改时间检测：缓存命中时若 .skill 目录 mtime 变化则主动失效
"""

import logging
import time
from pathlib import Path
from typing import Optional

from .base import SkillDefinition, load_all_skills, SKILL_DIR
from .matcher import match_skill

logger = logging.getLogger(__name__)

# 缓存 TTL（秒）：超过此时间后下次访问自动重新加载
_SKILL_CACHE_TTL_SECONDS = 30.0


class SkillManager:
    """Skill 管理器 - 单例"""

    def __init__(self, cache_ttl: float = _SKILL_CACHE_TTL_SECONDS):
        self._skills: list[SkillDefinition] = []
        self._skills_by_name: dict[str, SkillDefinition] = {}
        self._loaded: bool = False
        self._last_load_time: float = 0.0
        self._last_dir_mtime: float = 0.0
        self._cache_ttl: float = cache_ttl

    def _get_dir_mtime(self) -> float:
        """获取 .skill 目录最近修改时间（用于检测新加入的 Skill 目录）"""
        try:
            if not SKILL_DIR.exists():
                return 0.0
            # 取目录 mtime 和所有子目录 mtime 的最大值
            mtimes = [SKILL_DIR.stat().st_mtime]
            for item in SKILL_DIR.iterdir():
                if item.is_dir():
                    mtimes.append(item.stat().st_mtime)
            return max(mtimes)
        except OSError:
            return 0.0

    def _is_cache_stale(self) -> bool:
        """判断缓存是否过期：TTL 到期 或 目录 mtime 变化"""
        if not self._loaded:
            return True

        # TTL 检查
        if (time.time() - self._last_load_time) > self._cache_ttl:
            return True

        # 目录 mtime 检查（捕获 TTL 窗口内的文件系统变化）
        current_mtime = self._get_dir_mtime()
        if current_mtime != self._last_dir_mtime:
            return True

        return False

    def load(self, force: bool = False) -> None:
        """
        加载所有 Skill。

        :param force: 强制重新加载，忽略缓存
        """
        if force:
            self._do_load()
            return

        if self._is_cache_stale():
            self._do_load()

    def _do_load(self) -> None:
        """实际执行加载逻辑"""
        previous_count = len(self._skills)
        self._skills = load_all_skills()
        self._skills_by_name = {s.name: s for s in self._skills}
        self._loaded = True
        self._last_load_time = time.time()
        self._last_dir_mtime = self._get_dir_mtime()

        if len(self._skills) != previous_count:
            logger.info(
                "Skill 系统已重新加载，当前共 %d 个 Skill（之前 %d 个）",
                len(self._skills),
                previous_count,
            )
        else:
            logger.debug("Skill 系统已重新加载，共 %d 个 Skill", len(self._skills))

    def reload(self) -> None:
        """强制重新加载所有 Skill（无需重启服务）"""
        logger.info("[skill] 触发手动 reload")
        self._do_load()

    @property
    def skills(self) -> list[SkillDefinition]:
        self.load()
        return self._skills

    def get(self, name: str) -> Optional[SkillDefinition]:
        """按名称获取 Skill"""
        self.load()
        return self._skills_by_name.get(name)

    def match(self, user_input: str) -> Optional[SkillDefinition]:
        """自动匹配 Skill"""
        self.load()
        return match_skill(user_input, self._skills)

    def list_skills(self, refresh: bool = False) -> list[dict]:
        """
        获取所有 Skill 的摘要列表（用于 API 返回）。

        :param refresh: 是否强制刷新（绕过缓存）
        """
        self.load(force=refresh)
        return [s.to_dict() for s in self._skills]


# 全局单例
skill_manager = SkillManager()


def get_skill_manager() -> SkillManager:
    return skill_manager

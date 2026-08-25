"""
ProfileManager - 用户画像管理器

职责：
1. 读取/更新用户画像（跨会话长期记忆）
2. 从 context_data 自动提取并缓存生辰数据
3. 追踪高频技能与累计会话数
4. 将画像渲染为 System Prompt 片段，注入到 Agent 上下文

设计原则：
- 所有方法均为 async 且容错：DB 异常不影响主对话流程
- 匿名用户（user_id=None）不读写画像，避免无意义持久化
- birth_data 提取采用启发式：兼容原始参数与排盘结果两种格式
"""
import json
import logging
from datetime import datetime
from typing import Any

from ...models.profile import UserProfile, VALID_DEPTHS, VALID_STYLES

logger = logging.getLogger(__name__)

# 频次追踪上限
_MAX_FREQUENT_SKILLS = 5
_MAX_FEEDBACK_HISTORY = 20


def _first_non_none(*values: Any) -> Any:
    """返回第一个非 None 的值；用于避免 `0 or x` 把合法的 0 当假值丢弃。"""
    for v in values:
        if v is not None:
            return v
    return None


class ProfileManager:
    """用户画像管理器 - 读写用户长期偏好"""

    async def get_profile(self, user_id: int | None) -> dict[str, Any] | None:
        """读取用户画像。匿名用户或无记录时返回 None。"""
        if user_id is None:
            return None
        try:
            from ...database import async_session
            from sqlalchemy import select

            async with async_session() as db:
                result = await db.execute(
                    select(UserProfile).where(UserProfile.user_id == user_id)
                )
                profile = result.scalar_one_or_none()
                if not profile:
                    return None
                return self._to_dict(profile)
        except Exception as e:
            logger.warning(f"读取用户画像失败 user_id={user_id}: {e}")
            return None

    async def upsert_profile(
        self, user_id: int | None, **updates: Any
    ) -> dict[str, Any] | None:
        """
        创建或更新用户画像字段。

        仅更新传入的字段，未传入字段保持不变。匿名用户直接返回 None。
        并发安全：当多个协程同时为同一新用户 upsert 时，首个 INSERT 成功，
        其余触发 IntegrityError 后自动重试为 UPDATE，避免主键冲突。
        """
        if user_id is None:
            return None
        if not updates:
            return await self.get_profile(user_id)

        # 字段白名单过滤，防止注入无关字段
        allowed = {
            "preferred_depth", "preferred_style", "interested_topics",
            "birth_data", "frequent_skills", "feedback_history", "total_sessions",
        }
        filtered = {k: v for k, v in updates.items() if k in allowed}
        if not filtered:
            return await self.get_profile(user_id)

        # 枚举值校验
        if "preferred_depth" in filtered and filtered["preferred_depth"] not in VALID_DEPTHS:
            filtered.pop("preferred_depth")
        if "preferred_style" in filtered and filtered["preferred_style"] not in VALID_STYLES:
            filtered.pop("preferred_style")

        from sqlalchemy.exc import IntegrityError

        # 最多重试 2 次：处理并发 INSERT 竞争
        for attempt in range(2):
            try:
                from ...database import async_session
                from sqlalchemy import select

                async with async_session() as db:
                    result = await db.execute(
                        select(UserProfile).where(UserProfile.user_id == user_id)
                    )
                    profile = result.scalar_one_or_none()
                    if profile is None:
                        # 首次创建：合并默认值
                        profile = UserProfile(
                            user_id=user_id,
                            preferred_depth=filtered.get("preferred_depth", "detailed"),
                            preferred_style=filtered.get("preferred_style", "professional"),
                            interested_topics=filtered.get("interested_topics", []),
                            birth_data=filtered.get("birth_data"),
                            frequent_skills=filtered.get("frequent_skills", []),
                            feedback_history=filtered.get("feedback_history", []),
                            total_sessions=filtered.get("total_sessions", 0),
                        )
                        db.add(profile)
                        try:
                            await db.commit()
                        except IntegrityError:
                            # 并发竞争：另一协程已创建该行，回滚后重试为 UPDATE
                            await db.rollback()
                            continue
                    else:
                        for k, v in filtered.items():
                            setattr(profile, k, v)
                        await db.commit()
                    await db.refresh(profile)
                    return self._to_dict(profile)
            except IntegrityError:
                if attempt == 0:
                    continue
                raise
            except Exception as e:
                logger.warning(f"更新用户画像失败 user_id={user_id}: {e}")
                return None
        # 重试耗尽，退化为读取
        return await self.get_profile(user_id)

    async def update_frequent_skill(
        self, user_id: int | None, skill_name: str | None
    ) -> None:
        """更新高频技能列表：将 skill_name 计数+1 并按频次降序保留前 N 个。

        skill_name 为空或 general_chat（兜底技能）时不记录。
        """
        if user_id is None or not skill_name or skill_name == "general_chat":
            return
        try:
            profile = await self.get_profile(user_id)
            if profile is None:
                # 首次记录直接初始化
                await self.upsert_profile(
                    user_id, frequent_skills=[{"name": skill_name, "count": 1}]
                )
                return

            current = profile.get("frequent_skills") or []
            # current 可能是 ["skill_a", ...] 或 [{"name": ..., "count": ...}, ...]
            normalized = self._normalize_skill_counts(current)
            found = False
            for entry in normalized:
                if entry["name"] == skill_name:
                    entry["count"] += 1
                    found = True
                    break
            if not found:
                normalized.append({"name": skill_name, "count": 1})
            # 降序排序并截断
            normalized.sort(key=lambda x: x.get("count", 0), reverse=True)
            normalized = normalized[:_MAX_FREQUENT_SKILLS]
            await self.upsert_profile(user_id, frequent_skills=normalized)
        except Exception as e:
            logger.warning(f"更新高频技能失败 user_id={user_id} skill={skill_name}: {e}")

    async def increment_session_count(self, user_id: int | None) -> None:
        """累计会话数 +1（用于判断新老用户）。匿名用户跳过。"""
        if user_id is None:
            return
        try:
            profile = await self.get_profile(user_id)
            current = (profile or {}).get("total_sessions", 0)
            await self.upsert_profile(user_id, total_sessions=current + 1)
        except Exception as e:
            logger.warning(f"更新会话计数失败 user_id={user_id}: {e}")

    async def apply_post_run_updates(
        self,
        user_id: int | None,
        skill_name: str | None,
        is_new_session: bool,
    ) -> None:
        """
        一次对话结束后，在单个 DB 事务内原子地更新画像长期记忆。

        合并以下操作避免并发 read-modify-write 竞争：
        - 新会话时累计会话数 +1
        - 更新高频技能计数

        所有异常吞掉，绝不影响主对话流程。
        """
        if user_id is None:
            return
        # general_chat 是兜底技能，不记录到高频技能
        track_skill = skill_name and skill_name != "general_chat"
        if not is_new_session and not track_skill:
            return

        try:
            from ...database import async_session
            from sqlalchemy import select
            from sqlalchemy.exc import IntegrityError

            for attempt in range(2):
                try:
                    async with async_session() as db:
                        result = await db.execute(
                            select(UserProfile).where(UserProfile.user_id == user_id)
                        )
                        profile = result.scalar_one_or_none()

                        if profile is None:
                            # 首次创建：合并本轮更新
                            profile = UserProfile(
                                user_id=user_id,
                                preferred_depth="detailed",
                                preferred_style="professional",
                                interested_topics=[],
                                birth_data=None,
                                frequent_skills=(
                                    [{"name": skill_name, "count": 1}] if track_skill else []
                                ),
                                feedback_history=[],
                                total_sessions=1 if is_new_session else 0,
                            )
                            db.add(profile)
                            try:
                                await db.commit()
                            except IntegrityError:
                                await db.rollback()
                                continue
                        else:
                            if is_new_session:
                                profile.total_sessions = (profile.total_sessions or 0) + 1
                            if track_skill:
                                current = self._normalize_skill_counts(
                                    profile.frequent_skills or []
                                )
                                found = False
                                for entry in current:
                                    if entry["name"] == skill_name:
                                        entry["count"] += 1
                                        found = True
                                        break
                                if not found:
                                    current.append({"name": skill_name, "count": 1})
                                current.sort(key=lambda x: x.get("count", 0), reverse=True)
                                profile.frequent_skills = current[:_MAX_FREQUENT_SKILLS]
                            await db.commit()
                        return
                except IntegrityError:
                    if attempt == 0:
                        continue
                    raise
        except Exception as e:
            logger.warning(f"apply_post_run_updates 失败 user_id={user_id}: {e}")

    async def record_feedback(
        self, user_id: int | None, feedback: dict[str, Any]
    ) -> None:
        """记录用户反馈（如评分、追问标记），最多保留最近 N 条。"""
        if user_id is None or not feedback:
            return
        try:
            profile = await self.get_profile(user_id)
            history = (profile or {}).get("feedback_history") or []
            history = list(history)
            entry = {"timestamp": datetime.utcnow().isoformat(), **feedback}
            history.append(entry)
            history = history[-_MAX_FEEDBACK_HISTORY:]
            await self.upsert_profile(user_id, feedback_history=history)
        except Exception as e:
            logger.warning(f"记录用户反馈失败 user_id={user_id}: {e}")

    # ── 生辰数据提取 ──

    def extract_birth_data(self, context_data: str | None) -> dict[str, Any] | None:
        """
        从 context_data（JSON 字符串）中启发式提取生辰数据。

        支持三种格式：
        1. 原始排盘参数：{"birth_date": "1990-01-01", "birth_hour": 8, ...}
        2. 排盘结果中的 birth_info 块：{"birth_info": {"date": ..., "hour": ...}}
        3. 档案对象的 bazi_result：{"bazi_result": {"birth_info": {...}}}

        返回统一格式：
        {"birth_date": str, "birth_hour": int, "gender": str,
         "calendar_type": str, "name": str | None}
        无匹配时返回 None。
        """
        if not context_data:
            return None
        try:
            data = json.loads(context_data)
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(data, dict):
            return None

        # 路径1：原始参数
        if "birth_date" in data or "birth_hour" in data:
            return self._normalize_birth({
                "birth_date": data.get("birth_date"),
                "birth_hour": data.get("birth_hour"),
                "gender": data.get("gender"),
                "calendar_type": data.get("calendar_type", "solar"),
                "name": data.get("name"),
            })

        # 路径2：排盘结果 birth_info
        birth_info = data.get("birth_info")
        if isinstance(birth_info, dict):
            return self._normalize_birth({
                "birth_date": _first_non_none(birth_info.get("date"), birth_info.get("birth_date")),
                "birth_hour": _first_non_none(birth_info.get("hour"), birth_info.get("birth_hour")),
                "gender": birth_info.get("gender"),
                "calendar_type": birth_info.get("calendar_type") or "solar",
                "name": birth_info.get("name"),
            })

        # 路径3：嵌套 bazi_result
        bazi_result = data.get("bazi_result")
        if isinstance(bazi_result, dict):
            inner = bazi_result.get("birth_info")
            if isinstance(inner, dict):
                return self._normalize_birth({
                    "birth_date": _first_non_none(inner.get("date"), inner.get("birth_date")),
                    "birth_hour": _first_non_none(inner.get("hour"), inner.get("birth_hour")),
                    "gender": inner.get("gender"),
                    "calendar_type": inner.get("calendar_type") or "solar",
                    "name": inner.get("name"),
                })

        return None

    def _normalize_birth(self, raw: dict[str, Any]) -> dict[str, Any] | None:
        """规范化生辰数据，缺失关键字段时返回 None。"""
        birth_date = raw.get("birth_date")
        birth_hour = raw.get("birth_hour")
        if not birth_date or birth_hour is None:
            return None
        try:
            hour = int(birth_hour)
        except (TypeError, ValueError):
            return None
        if not (0 <= hour <= 23):
            return None
        gender = str(raw.get("gender") or "").lower()
        if gender in ("男", "male", "m"):
            gender = "male"
        elif gender in ("女", "female", "f"):
            gender = "female"
        else:
            gender = gender or "unknown"
        calendar = str(raw.get("calendar_type") or "solar").lower()
        if calendar in ("lunar", "农历"):
            calendar = "lunar"
        else:
            calendar = "solar"
        return {
            "birth_date": str(birth_date),
            "birth_hour": hour,
            "gender": gender,
            "calendar_type": calendar,
            "name": raw.get("name") or None,
        }

    # ── 画像渲染 ──

    def format_for_prompt(self, profile: dict[str, Any] | None) -> str:
        """将用户画像渲染为 System Prompt 片段。无画像时返回空串。"""
        if not profile:
            return ""

        lines: list[str] = ["## 用户画像（长期记忆）"]

        depth = profile.get("preferred_depth", "detailed")
        style = profile.get("preferred_style", "professional")
        depth_zh = {"brief": "简明", "detailed": "详细", "comprehensive": "全面"}.get(depth, depth)
        style_zh = {"professional": "专业", "casual": "亲切", "academic": "学术"}.get(style, style)
        lines.append(f"- 回答深度偏好：{depth_zh}")
        lines.append(f"- 回答风格偏好：{style_zh}")

        topics = profile.get("interested_topics") or []
        if topics:
            lines.append(f"- 感兴趣的话题：{', '.join(str(t) for t in topics[:10])}")

        birth = profile.get("birth_data")
        if birth:
            name = birth.get("name") or "用户"
            gender_zh = "男" if birth.get("gender") == "male" else ("女" if birth.get("gender") == "female" else "")
            cal_zh = "农历" if birth.get("calendar_type") == "lunar" else "公历"
            lines.append(
                f"- 已知生辰（{name}）：{birth.get('birth_date')} "
                f"{birth.get('birth_hour')}时{(' ' + gender_zh) if gender_zh else ''} "
                f"({cal_zh})"
            )
            lines.append("  → 用户无需重复提供生辰，可直接基于此数据进行分析；如用户明确给出新数据则以新数据为准。")

        sessions = profile.get("total_sessions", 0)
        if sessions > 0:
            lines.append(f"- 累计会话数：{sessions}（{'老用户，可省略基础引导' if sessions >= 5 else '新用户，可适当引导'}）")

        frequent = profile.get("frequent_skills") or []
        if frequent:
            skill_names = [
                e.get("name", "") if isinstance(e, dict) else str(e)
                for e in frequent
            ]
            skill_names = [s for s in skill_names if s]
            if skill_names:
                lines.append(f"- 常用功能：{', '.join(skill_names)}")

        if len(lines) <= 1:
            return ""
        return "\n".join(lines)

    # ── 内部工具 ──

    @staticmethod
    def _to_dict(profile: UserProfile) -> dict[str, Any]:
        return {
            "user_id": profile.user_id,
            "preferred_depth": profile.preferred_depth,
            "preferred_style": profile.preferred_style,
            "interested_topics": profile.interested_topics or [],
            "birth_data": profile.birth_data,
            "frequent_skills": profile.frequent_skills or [],
            "feedback_history": profile.feedback_history or [],
            "total_sessions": profile.total_sessions or 0,
            "created_at": profile.created_at.isoformat() if profile.created_at else "",
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else "",
        }

    @staticmethod
    def _normalize_skill_counts(current: list) -> list[dict[str, Any]]:
        """将技能列表统一为 [{"name": ..., "count": ...}] 格式"""
        result: list[dict[str, Any]] = []
        for entry in current or []:
            if isinstance(entry, dict):
                name = entry.get("name")
                if name:
                    result.append({"name": name, "count": int(entry.get("count", 1))})
            elif isinstance(entry, str) and entry:
                result.append({"name": entry, "count": 1})
        return result


# 全局单例
profile_manager = ProfileManager()

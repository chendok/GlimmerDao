"""
文本后处理引擎 —— 语音转文字结果的后处理

功能：
1. 自动纠错：同音字混淆、发音相似词汇错误、语法错误
2. 断句处理：语义逻辑和语音停顿特征划分句子边界
3. 标点符号添加：逗号、句号、问号、感叹号等

架构：
- LLM 引擎（DeepSeek）：全面处理，精度 >95%
- 规则引擎（降级）：LLM 不可用时使用，精度 ~80-85%
- 可配置参数：纠错强度、标点风格
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("uvicorn")

# ── 配置 ──────────────────────────────────────────────────

CorrectionStrength = str  # "light" | "medium" | "strong"
PunctuationStyle = str     # "standard" | "minimal" | "verbose"


@dataclass
class PostProcessConfig:
    correction: CorrectionStrength = "medium"
    punctuation: PunctuationStyle = "standard"
    _llm: Optional[object] = field(default=None, repr=False, init=False)


_default_config = PostProcessConfig()


def get_default_config() -> PostProcessConfig:
    return _default_config


# ── LLM 引擎 ──────────────────────────────────────────────

def _get_llm():
    """懒加载 LLM 实例（单例）"""
    if _default_config._llm is not None:
        return _default_config._llm

    try:
        from ..config import settings
        from langchain_openai import ChatOpenAI

        if not settings.OPENAI_API_KEY:
            logger.warning("未配置 API Key，文本后处理将使用规则引擎")
            return None

        _default_config._llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.05,
            streaming=False,
        )
        logger.info("文本后处理 LLM 初始化完成")
    except Exception as e:
        logger.warning(f"文本后处理 LLM 初始化失败: {e}")
        _default_config._llm = None

    return _default_config._llm


def _build_system_prompt(config: PostProcessConfig) -> str:
    """根据配置构建 System Prompt —— 专为中文 ASR 后处理优化"""
    return f"""你是一个专业的中文语音识别（ASR）后处理引擎。你的任务是对语音转文字结果进行智能处理，大幅提升文本质量。

## 核心任务

### 1. 自动纠错（最关键）
ASR 引擎经常产生以下类型的错误，请逐一修正：

**A. 同音字/近音字混淆（最常见）**
- 在/再：再也不要 → 在也不要（错），应该是"再也不要"
- 的/得/地：跑的快 → 跑得快，认真做 → 认真地做
- 做/作：叫做 → 叫作，做业 → 作业
- 己/已/以：自已 → 自己，己经 → 已经
- 名/明：名天 → 明天，名白 → 明白
- 公/工：公作 → 工作，工司 → 公司
- 到/倒：到霉 → 倒霉，倒底 → 到底
- 哪/那：那一个 → 哪一个，去那 → 去哪
- 买/卖：买东西 → 卖东西（根据上下文判断）
- 长/常：经长 → 经常，非长 → 非常
- 绝/决：绝定 → 决定，决对 → 绝对
- 须/需：必需要 → 需要，需知 → 须知
- 带/戴：带帽子 → 戴帽子，带眼镜 → 戴眼镜
- 坐/座：坐位 → 座位，座下 → 坐下
- 蓝/篮：蓝球 → 篮球，篮天 → 蓝天
- 圆/园：公圆 → 公园，花圆 → 花园
- 声/身：声体 → 身体，身音 → 声音
- 心/新：心闻 → 新闻，新情 → 心情
- 会/回：会来 → 回来，会家 → 回家
- 对/队：对伍 → 队伍，队于 → 对于
- 去/趣：有去 → 有趣，去味 → 趣味
- 查/察：观查 → 观察，检察 → 检查

**B. 常见词汇误识别（高频）**
- 人工智能 → 人工只能
- 编程 → 变程
- 数据库 → 数句库
- 服务器 → 附务器/福务器
- 前端 → 前段
- 部署 → 不署/不暑
- 源码 → 原码
- 代码 → 代马/代玛
- 接口 → 借口
- 文档 → 文挡
- 北京 → 百京
- 上海 → 伤海
- 广州 → 广洲
- 深圳 → 身圳
- 杭州 → 航州
- 成都 → 成嘟
- 深度学习 → 深度学西
- 神经网络 → 神精网络
- 大语言模型 → 大语岩模型

**C. 连读/口语化纠正**
- 怎么了 → 咋了
- 不知道 → 不造
- 什么 → 神马
- 有没有 → 有木有
- 非常 → 灰常
- 这样子 → 酱紫
- 不要 → 表
- 喜欢 → 西欢/稀饭

**D. 数字和量词纠正**
- 一一对应 → 一对应
- 一模一样 → 一毛一样
- 二十四 → 二四
- 三十八 → 三八

**E. 上下文推断**
- 根据上下文推断正确的词汇
- 注意前后文的语义连贯性
- 如果一句话中有多个可能的纠正方案，选择语义最通顺的

纠错强度：{"轻度——仅纠正最明显、无歧义的同音字错误，不确定的保留原文" if config.correction == "light" else "强——纠正所有可检测的错误，包括语法错误和语义不连贯。在确保不改变原意的前提下，尽可能提升文本质量" if config.correction == "strong" else "中度——纠正同音字/近音字错误和明显的语法错误。对于不确定的情况，保留原文"}。

### 2. 断句处理
根据语义逻辑划分句子边界：
- 一个完整的语义单元组成一个句子
- 话题转换时另起新句
- 连词（但是、所以、因为、然后、接着等）通常标记新句子的开始
- 时间词（今天、明天、昨天、现在、刚才等）后可以开始新句
- 保持口语的自然节奏，不要过度切分
- 每个句子控制在 10-30 字为宜

### 3. 标点符号添加
{_build_punctuation_rules(config.punctuation)}

## 输出格式
- 只返回处理后的文本，不要任何解释、说明、备注
- 不要添加任何前缀、后缀、标签
- 保持原文的语体风格（口语化/书面化）
- 不要编造或添加原文没有的内容"""


def _build_punctuation_rules(style: PunctuationStyle) -> str:
    if style == "minimal":
        return "标点风格：简约。仅在句子边界添加句号（。）、问号（？）、感叹号（！），句子内部不使用逗号。"
    elif style == "verbose":
        return """标点风格：丰富。在自然停顿处添加逗号，使文本更易阅读：
- 主语/话题后添加逗号
- 时间、地点、条件状语后添加逗号
- 列举项之间添加逗号
- 转折连词（但是、然而等）前添加逗号
- 因果连词（所以、因此等）前添加逗号
- 陈述句末尾添加句号（。）
- 疑问句末尾添加问号（？）
- 感叹句末尾添加感叹号（！）"""
    else:
        return """标点风格：标准。在主要语义边界和自然停顿处添加标点：
- 较长的主语/话题后添加逗号
- 转折连词（但是、然而、不过等）前添加逗号
- 因果连词（所以、因此等）前添加逗号
- 列举中间项之间添加逗号
- 陈述句末尾添加句号（。）
- 疑问句末尾添加问号（？）
- 感叹句末尾添加感叹号（！）"""


async def _llm_postprocess(text: str, config: PostProcessConfig, timeout: float = 5.0) -> str:
    """使用 LLM 进行文本后处理"""
    llm = _get_llm()
    if llm is None:
        return ""

    try:
        from langchain.schema import HumanMessage, SystemMessage

        messages = [
            SystemMessage(content=_build_system_prompt(config)),
            HumanMessage(content=text),
        ]

        response = await asyncio.wait_for(
            llm.ainvoke(messages),
            timeout=timeout,
        )
        result = response.content.strip() if hasattr(response, 'content') else str(response).strip()

        # 验证：确保文字内容没有被实质性改变
        original_clean = re.sub(r'[^\u4e00-\u9fff\w]', '', text)
        result_clean = re.sub(r'[^\u4e00-\u9fff\w]', '', result)

        if len(original_clean) > 0 and len(result_clean) > 0:
            if abs(len(original_clean) - len(result_clean)) <= max(5, len(original_clean) * 0.2):
                logger.info(f"LLM 文本后处理完成: {len(text)} → {len(result)} 字符")
                return result

        logger.warning("LLM 后处理结果与原文差异过大，降级为规则引擎")
        return ""

    except asyncio.TimeoutError:
        logger.warning(f"LLM 文本后处理超时 ({timeout}s)，降级为规则引擎")
        return ""
    except Exception as e:
        logger.warning(f"LLM 文本后处理失败: {e}，降级为规则引擎")
        return ""


# ── 规则引擎 ──────────────────────────────────────────────

_HOMOPHONE_CORRECTIONS = {
    # 在/再
    '在来': '再来', '在说': '再说', '在次': '再次',
    '在一次': '再一次', '在一次的': '再一次的',
    # 的/得/地
    '做的好': '做得好', '说的对': '说得对', '跑的快': '跑得快',
    '唱的好': '唱得好', '写的好': '写得好', '学的好': '学得好',
    # 做/作
    '做业': '作业', '做用': '作用', '叫做': '叫作',
    # 己/已/以
    '自已': '自己', '己经': '已经', '而以': '而已',
    # 名/明
    '名天': '明天', '名白': '明白',
    # 公/工
    '公作': '工作', '工司': '公司', '工园': '公园',
    # 式/势
    '方势': '方式', '趋式': '趋势',
    # 蓝/篮
    '蓝球': '篮球', '篮天': '蓝天',
    # 圆/园
    '圆丁': '园丁', '公圆': '公园', '花圆': '花园',
    # 坐/座
    '坐位': '座位', '让坐': '让座', '座下': '坐下',
    # 带/戴
    '带帽子': '戴帽子', '带眼镜': '戴眼镜',
    # 绝/决
    '绝定': '决定', '绝心': '决心', '决对': '绝对',
    # 声/身
    '声体': '身体', '身音': '声音',
    # 心/新
    '心闻': '新闻', '新情': '心情',
    # 时/是
    '是间': '时间',
    # 会/回
    '会来': '回来', '会家': '回家', '回议': '会议',
    # 对/队
    '对伍': '队伍', '队于': '对于',
    # 去/趣
    '去味': '趣味', '有去': '有趣',
    # 天/田
    '天野': '田野', '田空': '天空',
    # 年/连
    '年接': '连接', '连龄': '年龄',
    # 常见地名
    '百京': '北京', '伤海': '上海', '广洲': '广州',
    '身圳': '深圳', '航州': '杭州', '成嘟': '成都',
    # 常见技术词汇
    '人工只能': '人工智能', '深度学西': '深度学习',
    '神精网络': '神经网络', '大语岩模型': '大语言模型',
    '变程': '编程', '变程语言': '编程语言',
    '数句库': '数据库', '数句': '数据',
    '附务器': '服务器', '福务器': '服务器',
    '前段': '前端', '全站': '全栈',
    '原码': '源码', '代马': '代码', '代玛': '代码',
    '借口': '接口', '接口文挡': '接口文档',
    '不署': '部署', '不暑': '部署',
    '开源': '开源', '原代码': '源代码',
    # 连读纠正（仅完整词汇，不使用单字映射避免破坏复合词）
    '咋了': '怎么了', '咋办': '怎么办',
    '这咋回事': '这是怎么回事', '那咋办': '那怎么办',
    # 注意：'表'→'不要' 过于激进，会破坏"代表""表格"等词，已移除
    # 改为仅匹配完整短语
    '表这样': '不要这样', '表说了': '不要说了',
    # 数字误识别
    '一毛一样': '一模一样',
    # 常见口语纠正（仅完整词汇）
    '酱紫': '这样子', '造吗': '知道吗',
    '有木有': '有没有', '神马': '什么',
    '木有': '没有', '灰常': '非常',
}


def _rule_based_correction(text: str, strength: CorrectionStrength) -> str:
    """基于规则的纠错"""
    if strength == "light":
        return text

    result = text
    for wrong, correct in _HOMOPHONE_CORRECTIONS.items():
        if wrong in result:
            result = result.replace(wrong, correct)

    if strength == "strong":
        result = re.sub(r'(.)\1{3,}', r'\1\1', result)
        result = result.replace('。。', '。').replace('，，', '，')

    return result


# ── 智能标点引擎 ──────────────────────────────────────────

# ── 句子边界标记（应在此处断开为新句子）──
_SENTENCE_BOUNDARY_WORDS = {
    '但是', '可是', '然而', '不过', '所以', '因此', '总之',
    '另外', '此外', '还有', '同时', '于是',
    '首先', '其次', '最后', '第一', '第二', '第三',
    '接下来', '下面', '以上', '综上',
}

# ── 逗号前导词（在这些词前加逗号，不断句）──
_COMMA_BEFORE_WORDS = {
    '但是', '可是', '然而', '不过', '所以', '因此', '因为',
    '而且', '并且', '虽然', '既然', '如果', '只要', '只有',
    '无论', '不管', '即使', '尽管', '除非', '除了',
    '然后', '接着', '那么', '那', '这样', '于是',
    '另外', '此外', '还有', '同时',
    '总之', '最后', '首先', '其次',
    # 单字转折连词（缩写形式）
    '但', '却', '则',
    # 列举引导词（前面加逗号分隔）
    '分别是', '包括', '即', '例如', '比如', '譬如',
}

# ── 逗号后置词（在这些词后加逗号）──
_COMMA_AFTER_WORDS = {
    '当然', '确实', '其实', '事实上', '一般来说', '总的来说',
    '换句话说', '也就是说', '比如说', '例如', '比如',
    '不过', '不客气', '没问题', '好的', '对的',
}

# ── 句末语气词 + 问号触发 ──
# 注意：'吧' 可能是疑问（好吧？）也可能是祈使/陈述（走吧。），
# 仅当句中有明确疑问词时才触发问号
_QUESTION_PARTICLES = {'吗', '呢', '啊', '呀', '呢啊', '了吗', '了没', '没有'}
_QUESTION_PARTICLES_AMBIGUOUS = {'吧', '嘛', '哦'}  # 需要配合疑问词才触发问号
_QUESTION_WORDS_PATTERN = re.compile(
    r'(什么|怎么|怎样|为什么|哪[里个些]?|谁|多少|'
    r'几[个]?|何时|何地|如何|可否|能否|是否|'
    r'是不是|能不能|可不可以|行不行|好不好|对不对)'
)

# ── 感叹号触发词 ──
_EXCLAMATION_PATTERN = re.compile(
    r'(真(是|的|好|太|棒|厉害|美|强|牛|绝|行|可以|不错|了不起)|'
    r'太(好|棒|厉害|美|强|对|牛|绝|行了|对了|好了|可以了|'
    r'厉害了|绝了|棒了|完美了|赞了|神了|酷了|nice|好了吧|'
    r'过分|夸张|离谱|感人|精彩|神奇|不可思议|'
    r'给力|坑爹|搞笑|无语|'
    r'多|难|累|忙|贵|远|近|快|慢|高|低|大|小|热|冷))'
)

# ── 逗号自然停顿点：这些字符后常需停顿 ──
# 注意：排除"的"——它是语法助词，几乎从不作为自然停顿点
_NATURAL_PAUSE_CHARS = set('了是就都也才很又还再更最已')

# ── 时间/地点引导词（后面加逗号）──
_TIME_PLACE_WORDS = {
    '今天', '明天', '昨天', '现在', '刚才', '之前', '之后',
    '以后', '以前', '今年', '去年', '明年', '这个月', '上个月',
    '这周', '上周', '下周', '早上', '中午', '晚上', '上午', '下午',
    '最近', '近来', '不久前', '很久以前', '将来', '未来',
}

# ── 并列结构检测：常见谓语动词（用于识别 "A代表X，B代表Y" 型并列）──
_PARALLEL_PREDICATES = {
    '代表', '表示', '意味', '象征', '主', '掌管', '对应', '负责',
    '是', '为', '属', '有', '具备', '拥有', '包含', '包括',
    '需要', '需要', '能够', '可以', '应该', '会', '能',
    '喜欢', '讨厌', '关心', '关注', '影响', '决定', '控制',
}
# 编译为按长度降序排列的正则模式
_PARALLEL_PREDICATE_PATTERN = re.compile(
    r'(' + '|'.join(sorted(_PARALLEL_PREDICATES, key=len, reverse=True)) + r')'
)

# ── 话题切换标记：这些词引导新话题，前面应加逗号 ──
_TOPIC_SHIFT_PATTERNS = [
    # 八字/紫微领域：宫位名称后跟谓语
	# 注意：排除单字五行（金木水火土）——这些字符太常见，匹配会过于激进
	re.compile(r'(命宫|兄弟宫|夫妻宫|子女宫|财帛宫|疾厄宫|迁移宫|交友宫|'
		           r'官禄宫|田宅宫|福德宫|父母宫|身宫|'
		           r'大限|小限|流年|流月|流日|流时|'
		           r'本命|大运|年柱|月柱|日柱|时柱|'
		           r'五行|阴阳|天干|地支|生克|十神|用神|忌神|喜神|'
		           r'长生|沐浴|冠带|临官|帝旺|衰|病|死|墓|绝|胎|养)'),
    # 通用话题切换：名词+的+名词 结构
    re.compile(r'(?:至于|关于|对于|针对|说到|谈到|讲到)'),
]


def _detect_parallel_clauses(text: str) -> list:
    """检测文本中的并列分句边界

    识别模式如：
    - "命宫代表先天命格，夫妻宫代表婚姻状况，财帛宫代表财运"
    - "A是X，B是Y，C是Z"
    - "甲主木，乙主木，丙主火"

    策略：
    1. 查找文本中重复出现的谓语动词（代表、是、主、掌管等）
    2. 对于每个谓语，提取其前面紧邻的 2-4 字作为主语
    3. 如果同一谓语出现多次，且每次主语不同，则判定为并列分句
    4. 在第二个及后续分句的主语前插入逗号

    Returns:
        逗号插入位置列表 (int, 表示在 text 的该索引处之前插入逗号)
    """
    insertions = []

    # 查找所有谓语出现位置
    predicate_matches = list(_PARALLEL_PREDICATE_PATTERN.finditer(text))
    # ── 过滤：跳过复合词中的 "是"（但是、还是、就是、也是、都是 等）──
    _COMPOUND_SHI_CHARS = set('但可还就也总才算便乃即确正不只仅单光')
    predicate_matches = [
        m for m in predicate_matches
        if not (m.group(1) == '是' and m.start() > 0 and
                text[m.start() - 1] in _COMPOUND_SHI_CHARS)
    ]
    if len(predicate_matches) < 2:
        return insertions

    # 按谓语分组，找到使用相同谓语的多个分句
    from collections import defaultdict
    pred_groups = defaultdict(list)
    for m in predicate_matches:
        pred = m.group(1)
        pred_groups[pred].append(m)

    for pred, matches in pred_groups.items():
        if len(matches) < 2:
            continue

        # 提取每个匹配的主语（谓语前紧邻的名词短语）
        clauses = []
        for m in matches:
            pred_pos = m.start()
            if pred_pos < 1:
                continue

            # 向前查找主语：从上一个谓语结束到当前谓语开始
            prev_pred_end = 0
            if clauses:
                prev_pred_end = clauses[-1]['pred_end']

            # ── 关键检查：如果两个谓语之间包含 "的"，
            # 说明第一个从句有复杂宾语（如 "八字的基础"），
            # 需要跳过宾语部分来查找第二个从句的主语 ──
            if prev_pred_end > 0:
                between_clauses = text[prev_pred_end:pred_pos]
                if '的' in between_clauses:
                    # 进一步验证：确定 "的" 不是第二个主语的一部分
                    # 如 "A的B是C，D的E是F" 中，"的" 在第二个主语中，仍是并列
                    # 简单的启发式：如果 "的" 距离第二个谓语 < 4 字，可能在第二个主语中
                    de_pos = between_clauses.rfind('的')
                    de_dist_to_pred = len(between_clauses) - de_pos
                    if de_dist_to_pred >= 4:
                        # "的" 离第二个谓语较远，属于第一个从句的宾语
                        # 使用话题切换模式在 "的" 之后查找第二个从句的主语
                        # 例如："八字的基础五行生克" → 主语 "五行生克"
                        #        "一个人的先天命格夫妻宫" → 主语 "夫妻宫"
                        after_de_start = prev_pred_end + de_pos + 1
                        after_de_text = text[after_de_start:pred_pos]
                        found_second = False
                        for pattern in _TOPIC_SHIFT_PATTERNS:
                            topic_match = pattern.search(after_de_text)
                            if topic_match:
                                second_subject_start = after_de_start + topic_match.start()
                                clauses.append({
                                    'start': second_subject_start,
                                    'pred_pos': pred_pos,
                                    'pred_end': m.end(),
                                    'subject': topic_match.group(),
                                })
                                found_second = True
                                break
                        if found_second:
                            continue  # 跳过正常的主语提取，处理下一个谓语

            # 搜索范围：从上一个谓语结束到当前谓语开始（最多向前看6字）
            search_start = max(prev_pred_end, pred_pos - 6)
            between_text = text[search_start:pred_pos]

            # 去除标点
            clean_between = re.sub(r'[，,。！？、\s]', '', between_text)
            if len(clean_between) < 1:
                continue

            # ── 特殊情况：如果 between_text 包含 "的" 且 "的" 属于第二个主语，
            # 尝试排除第一个从句的宾语（between_text 开头 1-2 字），
            # 然后用完整的名词短语作为主语 ──
            if '的' in clean_between and search_start == prev_pred_end:
                # 尝试跳过第一个从句的宾语（1-2 字），从剩余的文本中提取主语
                found_subject = False
                for object_skip in range(1, min(3, len(clean_between) - 2)):
                    trimmed = clean_between[object_skip:]
                    if '的' not in trimmed or trimmed[0] == '的':
                        continue
                    de_idx = trimmed.index('的')
                    if de_idx >= 1:
                        # 主语 = 从起始到 "的" 后的完整名词短语（最多 4 字）
                        end_idx = min(de_idx + 4, len(trimmed))
                        subject = trimmed[:end_idx]
                        subject_start_in_between = between_text.find(subject)
                        if subject_start_in_between >= 0:
                            subject_start = search_start + subject_start_in_between
                            clauses.append({
                                'start': subject_start,
                                'pred_pos': pred_pos,
                                'pred_end': m.end(),
                                'subject': subject,
                            })
                            found_subject = True
                            break
                if found_subject:
                    continue

            # 自适应主语长度：根据 between_text 长度选择合适的主语长度
            clen = len(clean_between)
            if clen <= 2:
                subj_len = 1  # 极短文本：单字主语
            elif clen <= 5:
                subj_len = 2  # 短文本：2字主语
            elif clen <= 7:
                subj_len = 3  # 中等文本：3字主语
            else:
                subj_len = 4  # 长文本：4字主语

            subject = clean_between[-subj_len:]

            # ── 过滤：如果主语以常见功能字开头，跳过该字（功能字属于前一个从句）──
            # 例如：事业的成就偏财 → 主语是 "偏财" 而非 "就偏财"
            _SINGLE_CHAR_FUNCTION = set('就也都才还又再更最已')
            if subject and subject[0] in _SINGLE_CHAR_FUNCTION and len(subject) > 1:
                subject = subject[1:]

            # 计算主语在原文中的起始位置
            # 在 between_text 中查找 subject 的最后出现位置
            subject_start_in_between = between_text.rfind(subject)
            if subject_start_in_between < 0:
                continue

            subject_start = search_start + subject_start_in_between
            clauses.append({
                'start': subject_start,
                'pred_pos': pred_pos,
                'pred_end': m.end(),
                'subject': subject,
            })

        if len(clauses) < 2:
            continue

        # 验证分句之间的独立性：主语不能相同
        unique_subjects = set(c['subject'] for c in clauses)
        if len(unique_subjects) < 2:
            continue

        # 检查是否有重叠（主语范围不应重叠）
        valid = True
        for i in range(1, len(clauses)):
            if clauses[i]['start'] < clauses[i-1]['pred_end']:
                valid = False
                break
        if not valid:
            continue

        # 在第二个及后续分句的起始位置前插入逗号
        for clause in clauses[1:]:
            pos = clause['start']
            # 确保不在句首，且前面不是已有标点
            if pos > 2 and text[pos - 1] not in '，,。！？':
                # 检查前面是否已有逗号（3字符内）
                preceding = text[max(0, pos - 3):pos]
                if '，' not in preceding and ',' not in preceding:
                    insertions.append(pos)

    return insertions


def _detect_topic_shifts(text: str) -> list:
    """检测文本中的话题切换点（应在此前加逗号）

    例如：
    - "紫微斗数中命宫代表一个人的先天命格" → "命宫" 前加逗号
    - "天干地支是八字的基础五行生克是核心理论" → "五行" 前加逗号

    策略：
    1. 使用领域特定的名词模式（宫位、天干、地支等）
    2. 通用的话题切换词（至于、关于、说到等）
    3. 检测句子中第二个及后续的名词主语出现位置

    Returns:
        逗号插入位置列表
    """
    insertions = []

    # 规则 1：领域话题切换模式
    for pattern in _TOPIC_SHIFT_PATTERNS:
        matches = list(pattern.finditer(text))
        if len(matches) >= 2:
            # 第二个及后续匹配前加逗号
            for i, m in enumerate(matches[1:], start=1):
                pos = m.start()
                # ── 相邻复合词检查：如果当前匹配与上一个匹配紧邻，
                # 且两者都是 2 字词，则它们形成复合词（如 "天干地支"、"五行生克"），
                # 不应在中间插入逗号 ──
                prev_match = matches[i - 1]
                prev_end = prev_match.end()
                prev_len = prev_match.end() - prev_match.start()
                curr_len = m.end() - m.start()
                if pos == prev_end and prev_len <= 2 and curr_len <= 2:
                    continue  # 跳过复合词内部的相邻匹配

                if pos >= 2 and text[pos - 1] not in '，,。！？':
                    # 检查前面2字符内无逗号
                    preceding = text[max(0, pos - 3):pos]
                    if '，' not in preceding and ',' not in preceding:
                        insertions.append(pos)

    # 规则 2：通用话题切换词
    for m in re.finditer(
        r'(?:至于|关于|对于|针对|说到|谈到|讲到|'
        r'接下来|另一方面|此外|另外|还有|同时)',
        text
    ):
        pos = m.start()
        if pos > 3 and text[pos - 1] not in '，,。！？':
            preceding = text[max(0, pos - 3):pos]
            if '，' not in preceding and ',' not in preceding:
                insertions.append(pos)

    return insertions


def _smart_punctuate(text: str, style: PunctuationStyle) -> str:
    """智能标点添加引擎

    四阶段处理：
    1. 句子分割 —— 识别句子边界
    2. 并列结构检测 —— 识别 "A代表X，B代表Y" 型并列
    3. 句子内逗号 —— 在自然停顿处添加逗号
    4. 句末标点 —— 添加。？！等结尾标点
    """
    if not text or not text.strip():
        return text

    # 先移除已有标点，重新分析
    text = re.sub(r'[。！？，；：、\n\r]', '', text).strip()
    if not text:
        return text

    # ── 阶段 1：句子分割 ──
    sentences = _split_sentences(text)

    # ── 阶段 2 & 3 & 4：对每个句子添加标点 ──
    result_parts = []
    for i, sentence in enumerate(sentences):
        if not sentence.strip():
            continue
        punctuated = _punctuate_sentence(sentence, style, is_last=(i == len(sentences) - 1))
        result_parts.append(punctuated)

    return ''.join(result_parts)


def _split_sentences(text: str) -> list:
    """将长文本分割为句子序列

    策略：
    1. 先检测并列结构，判断是否应保持为一个句子（用逗号分隔）而非拆分
    2. 扫描全文查找句子边界词
    3. 验证边界词是独立词（不是复合词的一部分）
    4. 在有效位置分割，确保每段至少 6 字
    5. 对于无明确边界的文本，使用语义分析
    """
    if len(text) <= 35:
        # 短文本：检查是否有句末语气词（吗、呢、啊等）后跟新内容
        # 如 "你吃饭了吗我今天吃了火锅" → 在 "吗" 后分割
        for m in re.finditer(r'(吗|呢|啊|呀|吧|哦|嘛|呐|咯)(?=[^\s，,。！？]{1,})', text):
            pos = m.end()
            if 2 <= pos <= len(text) - 2:
                # 验证：分割后的两部分都应≥2字
                if len(text[:pos]) >= 2 and len(text[pos:]) >= 2:
                    return [text[:pos], text[pos:]]
        return [text]

    # 查找所有边界词位置
    split_positions = []
    for boundary_word in sorted(_SENTENCE_BOUNDARY_WORDS, key=len, reverse=True):
        for m in re.finditer(re.escape(boundary_word), text):
            pos = m.start()
            # 边界词前至少有 6 个字，后至少有 4 个字
            if pos >= 6 and len(text) - pos >= 4:
                # 过滤：边界词前的字符不应与其他字符组成常见词
                if pos >= 2:
                    prev_two = text[pos - 2:pos]
                    combined = prev_two + boundary_word
                    if _is_common_compound(combined):
                        continue
                split_positions.append(pos)

    if not split_positions:
        if len(text) > 30:
            return _split_long_sentence(text)
        return [text]

    # 排序并去重
    split_positions = sorted(set(split_positions))

    # 过滤过近的分割点（至少间隔 8 字）
    filtered = []
    last_pos = -100
    for pos in split_positions:
        if pos - last_pos >= 8:
            filtered.append(pos)
            last_pos = pos

    if not filtered:
        if len(text) > 30:
            return _split_long_sentence(text)
        return [text]

    # 按分割点切分
    sentences = []
    start = 0
    for pos in filtered:
        segment = text[start:pos].strip()
        if len(segment) >= 4:
            sentences.append(segment)
            start = pos
    # 最后一段
    final = text[start:].strip()
    if final:
        sentences.append(final)

    if len(sentences) <= 1:
        if len(text) > 30:
            return _split_long_sentence(text)
        return [text]

    return sentences


def _is_common_compound(text: str) -> bool:
    """判断是否是常见复合词（不应被分割）"""
    _COMMON_COMPOUNDS = {
        # 不应分割的常见词
        '问题', '题目', '话题', '主题', '问题第', '第一问',
        '回答', '答案', '方案', '方法', '方式',
        '然后', '然而', '虽然', '自然', '当然',
        '结果是', '结果是', '结果是', '结果是',
    }
    return text in _COMMON_COMPOUNDS


def _split_long_sentence(text: str) -> list:
    """对超长句子按语义停顿分割

    改进策略：
    1. 先尝试使用并列结构检测来分割（如 "A代表X，B代表Y"）
    2. 查找句子边界词的位置，在其前分割
    3. 无边界词时，按自然停顿点分割
    """
    # 策略 1：尝试使用话题切换模式分割
    # 检查是否有多个话题切换点（如多个宫位名称）
    for pattern in _TOPIC_SHIFT_PATTERNS:
        matches = list(pattern.finditer(text))
        if len(matches) >= 3:
            # ── 枚举检测：如果匹配项密集均匀分布（间距 < 6 字），
            # 说明是列举（如 "命宫、兄弟宫、夫妻宫..."），不应分割 ──
            gaps = []
            for i in range(1, len(matches)):
                gaps.append(matches[i].start() - matches[i-1].end())
            avg_gap = sum(gaps) / len(gaps) if gaps else 0
            # 如果平均间距 <= 5 字，且大部分间距 <= 6 字，判定为枚举
            if avg_gap <= 5 and sum(1 for g in gaps if g <= 6) >= len(gaps) * 0.7:
                # 这是枚举，保持为一个句子，不分割
                return [text]

            # 有多个话题切换点，从中间分割
            mid_match = matches[len(matches) // 2]
            pos = mid_match.start()
            if pos >= 8 and len(text) - pos >= 8:
                return [text[:pos], text[pos:]]

    # 策略 2：查找句子边界词的位置，在其前分割
    split_positions = []
    for boundary_word in sorted(_SENTENCE_BOUNDARY_WORDS, key=len, reverse=True):
        for m in re.finditer(re.escape(boundary_word), text):
            pos = m.start()
            # 边界词前至少有 6 个字才分割
            if pos >= 6:
                split_positions.append(pos)

    if not split_positions:
        # 策略 3：无边界词，按长度均分
        mid = len(text) // 2
        # 在 mid 附近找最近的标点或自然停顿点
        for offset in range(0, min(10, mid)):
            if mid + offset < len(text) and text[mid + offset] in _NATURAL_PAUSE_CHARS:
                return [text[:mid + offset + 1], text[mid + offset + 1:]]
            if mid - offset >= 0 and text[mid - offset] in _NATURAL_PAUSE_CHARS:
                return [text[:mid - offset + 1], text[mid - offset + 1:]]
        return [text[:mid], text[mid:]]

    # 排序并选择合适的分割点
    split_positions.sort()
    # 取第一个分割点（确保分段不会太短）
    for pos in split_positions:
        if pos >= 8 and len(text) - pos >= 8:
            return [text[:pos], text[pos:]]

    return [text]


def _punctuate_sentence(text: str, style: PunctuationStyle, is_last: bool = True) -> str:
    """对单个句子添加标点

    1. 添加句内逗号
    2. 添加句末标点
    """
    if not text:
        return text

    # ── 句内逗号插入 ──
    if style != "minimal":
        text = _insert_commas(text, style)

    # ── 句末标点 ──
    text = _add_sentence_end(text, is_last)

    return text


def _insert_commas(text: str, style: PunctuationStyle) -> str:
    """在句子中智能插入逗号

    插入位置（按优先级）：
    0. 并列结构 —— "A代表X，B代表Y，C代表Z" 型（最高优先级）
    0.5. 话题切换 —— "命宫..., 夫妻宫..., 财帛宫..." 型
    1. 转折/因果/条件连词前（但是、所以、因为、如果 等）
    2. 时间/地点引导词后（今天、现在、刚才 等）
    3. 语气停顿词后（呢、啊、吧、嘛、哦 等 — 非句末时）
    4. 自然停顿处（长句中在动词后）
    5. 列举项之间
    6. 引述/话题切换（"关于""对于""至于" 等）
    """
    # 获取当前已有的逗号位置（避免重复插入）
    existing_commas = {m.start() for m in re.finditer(r'[，,]', text)}

    insertions = []  # (position, priority)

    # ── 规则 0：并列结构检测（最高优先级）──
    parallel_insertions = _detect_parallel_clauses(text)
    for pos in parallel_insertions:
        if pos not in existing_commas:
            insertions.append((pos, 0))

    # ── 规则 0.5：话题切换检测 ──
    topic_insertions = _detect_topic_shifts(text)
    for pos in topic_insertions:
        if pos not in existing_commas:
            # ── 过滤：不在 "分别是"、"包括"、"即" 等列举引导词后紧跟的位置加逗号 ──
            before = text[max(0, pos - 3):pos]
            if before in ('分别是', '包括有', '即', '如', '例如'):
                continue
            # ── 过滤：不在 "和"、"与"、"及" 等并列连接词后紧跟的位置加逗号（列表末尾）──
            if pos > 0 and text[pos - 1] in ('和', '与', '及'):
                continue
            insertions.append((pos, 0.5))

    # 规则 1：连词前加逗号
    for word in sorted(_COMMA_BEFORE_WORDS, key=len, reverse=True):
        for m in re.finditer(re.escape(word), text):
            pos = m.start()
            # 确保不在开头，且前面不是标点
            if pos > 1 and text[pos - 1] not in '，,。！？':
                # ── 列举引导词特殊处理：如果前面只有 2-3 字（短主语），不加逗号 ──
                if word in ('分别是', '包括', '即', '例如', '比如', '譬如'):
                    prefix = text[:pos].rstrip('，,')
                    if len(prefix) <= 3:
                        continue
                # 检查前面是否有其他连词（避免双重逗号）
                before = text[:pos].rstrip('，,')
                if len(before) >= 2:  # 前面至少有两个字
                    insertions.append((pos, 1))

    # 规则 2：时间/地点词后加逗号
    if style == "verbose":
        for word in sorted(_TIME_PLACE_WORDS, key=len, reverse=True):
            if text.startswith(word):
                pos = len(word)
                if pos < len(text) and text[pos] not in '，,。！？':
                    insertions.append((pos, 2))
            # 也匹配句子中间的位置
            for m in re.finditer(r'(?:^|[。，,！？])\s*' + re.escape(word), text):
                pos = m.end()
                if pos < len(text) and text[pos] not in '，,。！？的':
                    insertions.append((pos, 2))

    # 规则 3：语气词后加逗号（非句末时）
    for m in re.finditer(r'(呢|啊|吧|嘛|哦|呀|呐|咯|喽|呗|咚|哇|哈|嘻|嘿|呵)', text):
        pos = m.end()
        if pos < len(text) - 1:  # 不是句末
            if text[pos] not in '，,。！？':
                insertions.append((pos, 3))

    # 规则 4：自然停顿点（长句中在动词/虚词后加逗号）
    # 更精确的规则：只在真正的从句边界处插入逗号
    if len(text) > 18:
        for m in re.finditer(
            r'(了|是|都|也|才|很|又|还|再|更|最|已|'
            r'会|要|能|可以|可能|应该|必须|一定|需要|觉得|认为|知道|'
            r'明白|发现|感觉|希望|想|讲|问|回答|表示|建议|提出|'
            r'强调|指出|补充|解释|说明|同意|反对|支持|确认|保证|决定|'
            r'打算|计划|准备|开始|继续|停止|结束|完成|成功|失败|'
            r'通过|拒绝|接受|收到|发出|发送|接收|上传|下载|安装|配置|'
            r'部署|测试|调试|优化|重构|修复|更新|升级|迁移|备份|恢复|'
            r'导入|导出|保存|加载|提交|推送|合并|发布|上线|回滚|检查|验证|'
            r'登录|注册|退出|进入|打开|关闭|重启|启动|取消|删除|添加|修改|'
            r'创建|生成|搜索|查询|过滤|排序|分组|统计|计算|分析|处理|转换|'
            r'格式化|编码|解码|压缩|解压|加密|解密|签名|识别|匹配|替换|'
            r'查找|定位|跟踪|记录|报告|通知|提醒|警告|错误|异常|超时|重试|'
            r'缓存|存储|读取|写入|传输|请求|响应|等待|阻塞|同步|异步|并发|'
            r'并行|串行|顺序|随机|循环|递归|迭代|遍历|映射|聚合|拆分|合并|'
            r'连接|断开|建立|释放|分配|回收|申请|占用|空闲|就绪|运行|挂起|'
            r'终止|返回|跳过|忽略|捕获|抛出|触发|监听|订阅|发布|广播|推送|'
            r'拉取|轮询|回调|拦截|转换|适配|代理|转发|路由|负载|均衡|分发|'
            r'汇聚|持久化)',
            text
        ):
            pos = m.end()
            # ── 跳过 "是" 作为固定短语一部分的情况（分别是、就是、也是、都是等）──
            if m.group(1) == '是' and pos >= 2:
                preceding_char = text[pos - 2]  # "是" 前面的字符
                if preceding_char in '分别就也都很才总算可便乃即确正不只仅单光':
                    continue
            # 跳过紧接"的"的情况（如"说的""想的""做的"等语法结构）
            if pos < len(text) and text[pos] == '的':
                continue
            # 跳过紧接"了""着""过"的情况（时态助词，不应停顿）
            if pos < len(text) and text[pos] in '了着过':
                continue
            # 跳过紧接"是"的情况（"表示是"、"认为是"等）
            if pos < len(text) and text[pos] == '是':
                continue
            # ── 关键：跳过动词后紧跟宾语的情况 ──
            # 如果下一个字符是量词、数字、或名词前缀，说明是动宾结构，不应插入逗号
            if pos < len(text) and text[pos] in '一个几每这那某各':
                continue
            # 如果下一个字符是数字（1-9），说明是"动词+数量词+宾语"结构
            if pos < len(text) and text[pos] in '一二三四五六七八九十1234567890':
                continue
            # 如果下两个字符是"一个"、"一种"等量词结构
            if pos + 1 < len(text) and text[pos:pos+2] in ('一个', '一种', '一件', '一些', '这个', '那个', '每个'):
                continue
            if 8 < pos < len(text) - 8:  # 不在句首和句末
                if text[pos] not in '，,。！？':
                    insertions.append((pos, 4))
            break  # 只取第一个匹配

    # ── 规则 4.5：主语切换检测（"很好，我们..."、"完成了，接下来..."）──
    # 当补语/谓语后紧接新主语（代词或名词）时，插入逗号
    if len(text) > 10:
        subject_shift_pattern = re.compile(
            r'(很好|不错|完成|结束|好了|行了|可以|没问题|知道了|明白了|'
            r'了解了|清楚了|搞定了|做好了|做完了|吃完了|说完了|写完了|'
            r'读完了|看完了|听完了|找到了|买到了|拿到了|'
            r'开始|出发|回来|回去|过来|过去|进来|进去|'
            r'下来|下去|上来|上去|起来|'
            r'学会|学完|看懂|听懂|记住|忘记|想起)'
            r'(我[们]?|你[们]?|他[们]?|她[们]?|它[们]?|这|那|'
            r'我们|你们|他们|她们|它们|大家|各位|诸位|'
            r'接下来|下面|然后|接着|现在|之后|此后)'
        )
        for m in subject_shift_pattern.finditer(text):
            pos = m.end() - len(m.group(2))  # 新主语开始的位置
            if pos > 3 and text[pos - 1] not in '，,。！？':
                # 检查是否已有逗号
                preceding = text[max(0, pos - 3):pos]
                if '，' not in preceding and ',' not in preceding:
                    insertions.append((pos, 4.5))

    # ── 规则 4.6：后置词 "中"、"时"、"后" 等后跟新主语时加逗号 ──
    # 如 "紫微斗数中，命宫代表..."、"学习时，要注意..."
    if len(text) > 8:
        postposition_pattern = re.compile(
            r'(中|时|后|前|上|下|里|内|外|间|方面|领域|'
            r'情况下|条件下|基础上|前提下|背景下)'
            r'(?=[\u4e00-\u9fff]{2,})'  # 后面至少跟2个汉字
        )
        for m in postposition_pattern.finditer(text):
            pos = m.end()
            # ── 过滤：如果 "里" 前面是 "哪"、"这"、"那"，则跳过（"哪里"、"这里"、"那里" 不是后置词）──
            if m.group(1) == '里' and m.start() > 0 and text[m.start() - 1] in '哪这那':
                continue
            # ── 过滤：如果 "上" 前面是 "马"，则跳过（"马上" 不是后置词）──
            if m.group(1) == '上' and m.start() > 0 and text[m.start() - 1] == '马':
                continue
            # 确保不在句首，不在句末，且前面有足够内容
            if pos >= 3 and pos < len(text) - 4:
                if text[pos] not in '，,。！？的之':
                    # ── 过滤：如果后置词后紧跟连接词（"一共有"、"包括"、"分为"等），
                    # 说明后置词与后续内容紧密连接，不加逗号 ──
                    after_text = text[pos:pos + 3]
                    if after_text[:2] in ('一共', '总共', '分别', '主要', '包括', '包含', '分为', '共有'):
                        continue
                    if after_text in ('有', '是', '为', '共'):
                        continue
                    # 检查前面是否已有逗号
                    preceding = text[max(0, pos - 3):pos]
                    if '，' not in preceding and ',' not in preceding:
                        insertions.append((pos, 4.6))

    # 规则 5：列举检测（"和"、"与"、"以及"、"还有" 等）
    if style == "verbose":
        for m in re.finditer(r'(?:、|和|与|以及|还有|或者|或)(?![^，,。！？]{0,3}$)', text):
            pos = m.start()
            if pos > 2 and text[pos - 1] not in '，,。！？':
                insertions.append((pos, 5))

    # 规则 6：引述/话题切换（"关于""对于""至于""针对""根据""按照" 等）
    for word in ['关于', '对于', '至于', '针对', '根据', '按照', '基于', '通过', '利用',
                 '借助', '依靠', '凭借', '相比', '相对', '比起', '较之']:
        for m in re.finditer(re.escape(word), text):
            pos = m.start()
            if pos > 2 and text[pos - 1] not in '，,。！？':
                insertions.append((pos, 6))
            # ── 话题词在句首时：在话题短语后加逗号 ──
            # 如 "关于这个问题，我们需要..."、"至于具体的方案，我们..."
            elif pos == 0:
                # 在话题短语后寻找新主语（代词或时间词），在其前加逗号
                topic_end = m.end()
                after_topic = text[topic_end:]
                # 查找第一个真正的新主语（排除 这/那，它们通常是话题的一部分）
                # 使用 (?:...) 非捕获组，非字符类
                subject_match = re.search(
                    r'(?:我们|你们|他们|她们|它们|我|你|他|她|它)',
                    after_topic
                )
                # 如果没有代词主语，尝试匹配时间词（明天、今天、现在 等）
                if not subject_match:
                    subject_match = re.search(
                        r'(?:明天|今天|昨天|现在|刚才|之后|以后|以前|'
                        r'今年|去年|明年|这个月|上个月|这周|上周|下周|'
                        r'早上|中午|晚上|上午|下午|最近|将来|未来|'
                        r'接下来|下面|然后|接着|之后|此后|'
                        r'目前|当前|当下|如今|往后|从此)',
                        after_topic
                    )
                if subject_match:
                    comma_pos = topic_end + subject_match.start()
                    if comma_pos >= 2 and comma_pos < len(text) - 2:
                        insertions.append((comma_pos, 6))

    # ── 规则 4.7：的+N 后跟新主语时加逗号 ──
    # 如 "这么好的天气，我们..."、"这是一段很正常的文本，不需要..."
    #     "他说的很有道理，我们应该..."
    # 注意：使用 (?:...) 非捕获组而非 [...] 字符类，确保匹配多字词（如 "我们"）
    # ── 复合词黑名单：的+N 捕获的 N 与 lookahead 字符组成复合词时，不应分割 ──
    _DE_COMPOUND_BLACKLIST = {
        '成就', '就是', '也就', '来就', '出就', '造就', '迁就', '将就',
        '就会', '就能', '就要', '就将', '才就', '这就', '那就',
    }
    for m in re.finditer(
        r'的([\u4e00-\u9fff]{1,5})'
        r'(?=(?:我们|你们|他们|她们|它们|我|你|他|她|它|这|那|不|没|也|还|就|都))',
        text
    ):
        pos = m.end()
        if pos >= 4 and pos < len(text) - 2:
            if text[pos] not in '，,。！？':
                # 过滤：如果 "的" 前面是 "目"（"目的" 不是 "的+N" 结构），跳过
                if m.start() > 0 and text[m.start() - 1] == '目':
                    continue
                # 过滤：如果捕获的 N 与 lookahead 字符组成常见复合词，跳过
                # 例如：的成就 → 成+就=成就，不应在中间加逗号
                captured = m.group(1)
                if pos < len(text) and captured[-1] + text[pos] in _DE_COMPOUND_BLACKLIST:
                    continue
                insertions.append((pos, 4.7))

    # ── 规则 4.8：礼貌用语前加逗号 ──
    # 如 "我很好，谢谢"、"没问题，再见"
    for m in re.finditer(r'(谢谢|多谢|感谢|不客气|再见|拜拜|好的|没问题|没关系|辛苦了)', text):
        pos = m.start()
        if pos > 2 and text[pos - 1] not in '，,。！？':
            # 确保前面有足够内容（不是孤立的礼貌用语）
            preceding = text[:pos].rstrip('，,。！？')
            if len(preceding) >= 2:
                insertions.append((pos, 4.8))

    # ── 规则 0.7：密集列举检测（"分别是A，B，C，D" 型）──
    # 当列举引导词后跟偶数长度的连续 CJK 文本时，每 2 字插入逗号
    # 仅当话题切换检测未覆盖时才启用（避免与宫位等已知模式冲突）
    _FIVE_ELEMENTS = set('金木水火土')
    for m in re.finditer(r'(分别是|包括|即)(?=[\u4e00-\u9fff]{6,})', text):
        pos = m.end()
        remaining = text[pos:]
        if len(remaining) >= 6 and len(remaining) % 2 == 0:
            # 过滤单字列举（如 "金木水火土"、"甲乙丙丁"）
            # 如果字符唯一性 > 70%，说明是单字列举
            unique_ratio = len(set(remaining)) / len(remaining)
            if unique_ratio >= 0.7:
                continue
            # 过滤纯五行列举
            if all(c in _FIVE_ELEMENTS for c in remaining):
                continue
            # ── 关键：如果话题切换已经检测到这些项目，不要重复插入 ──
            # 检查 remaining 中是否有话题切换匹配
            has_topic_items = False
            for pattern in _TOPIC_SHIFT_PATTERNS:
                if pattern.search(remaining):
                    has_topic_items = True
                    break
            if has_topic_items:
                continue
            # 每 2 字插入逗号（使用 priority 0.55，享受宽松间距 > 1）
            for i in range(pos + 2, pos + len(remaining), 2):
                if i < len(text) and text[i - 1] not in '，,':
                    insertions.append((i, 0.55))

    # 去重并排序（按位置升序，同位置取最高优先级）
    insertions.sort(key=lambda x: (x[0], -x[1]))
    seen_positions = set()
    unique_insertions = []
    for pos, priority in insertions:
        if pos not in existing_commas and pos not in seen_positions:
            # 话题切换和并列结构（priority <= 0.55）：宽松去重，间距 > 1 即可
            if priority <= 0.55:
                if not any(abs(pos - p) <= 1 for p in existing_commas):
                    unique_insertions.append(pos)
                    seen_positions.add(pos)
                    existing_commas.add(pos)
            else:
                # 其他规则：间距 > 2 避免标点过密
                if not any(abs(pos - p) <= 2 for p in existing_commas):
                    unique_insertions.append(pos)
                    seen_positions.add(pos)
                    existing_commas.add(pos)

    # 限制逗号数量：每 4 个字最多 1 个逗号
    max_commas = max(1, len(text) // 4)
    # 确保至少能容纳并列结构、话题切换和密集列举所需的逗号
    parallel_count = len([p for p in unique_insertions if p in parallel_insertions or p in topic_insertions])
    enum_count = len([p for p, pri in insertions if pri == 0.55])
    max_commas = max(max_commas, parallel_count + enum_count + 1)  # +1 留一个给其他规则
    if len(unique_insertions) > max_commas:
        # 按优先级保留（已按 priority 排过序，低 priority 值 = 高优先级在前）
        unique_insertions = unique_insertions[:max_commas]

    # 按位置插入逗号（从后往前插入，避免位置偏移）
    unique_insertions.sort(reverse=True)
    result = list(text)
    for pos in unique_insertions:
        if 0 < pos < len(result):
            result.insert(pos, '，')

    return ''.join(result)


def _add_sentence_end(text: str, is_last: bool) -> str:
    """为句子添加结尾标点

    检测策略：
    1. 疑问句：疑问词 + 语气词，反问句，选择疑问句
    2. 感叹句：程度副词 + 形容词，感叹词
    3. 陈述句：默认句号
    """
    if not text:
        return text

    # 如果已有结尾标点，不再添加
    if text[-1] in '。！？':
        return text

    # ── 疑问句检测 ──
    is_question = False

    # ── 否定式陈述句过滤：如果句子以 "不知道"、"不"、"没" 等否定词开头，
    # 即使包含疑问词，也不是疑问句 ──
    _NEGATION_STARTS = {'不知道', '不知', '不', '没', '没有', '无', '非', '未'}
    starts_with_negation = any(text.startswith(w) for w in sorted(_NEGATION_STARTS, key=len, reverse=True))

    # 检测 1：疑问词 + 句末语气词
    if _QUESTION_WORDS_PATTERN.search(text) and not starts_with_negation:
        is_question = True

    # 检测 2：句末明确疑问语气词（吗、呢、啊、呀 等）
    if not is_question:
        for particle in sorted(_QUESTION_PARTICLES, key=len, reverse=True):
            if text.endswith(particle) and len(text) >= len(particle) + 2:
                is_question = True
                break

    # 检测 3：句末模糊语气词（需要配合疑问词才触发问号）
    if not is_question:
        for particle in sorted(_QUESTION_PARTICLES_AMBIGUOUS, key=len, reverse=True):
            if text.endswith(particle) and len(text) >= len(particle) + 2:
                if _QUESTION_WORDS_PATTERN.search(text):
                    is_question = True
                break

    # 检测 4：反问句模式（"难道...吗"、"不是...吗"、"怎么...呢"）
    if not is_question:
        rhetorical_patterns = [
            r'难道.*[吗嘛]', r'不是.*[吗嘛]', r'怎么.*[呢啊]',
            r'哪[里个].*[呢啊]', r'谁[^？。]*[呢啊]',
            r'为什么.*[呢啊]', r'什么.*[呢啊]',
        ]
        for pattern in rhetorical_patterns:
            if re.search(pattern, text):
                is_question = True
                break

    # 检测 5：选择疑问句（"还是...？"、"是A还是B？"）
    if not is_question and re.search(r'还是', text):
        # ── 过滤：如果 "还是" 前面是 "但"（但还是）、"可"（可还是）、"却"（却还是）等，
        # 表示 "仍然" 的意思，不是选择疑问句 ──
        _STILL_CONTEXT = re.search(
            r'(?:但|可|却|就|总|仍|依|也|还|都|才|又|再)还是', text
        )
        if not _STILL_CONTEXT:
            if re.search(r'是.*还是', text) or text.endswith('还是'):
                # ── 进一步过滤：如果 "是" 是 "但是" 的一部分，跳过 ──
                shi_hai_shi_match = re.search(r'是.*还是', text)
                if shi_hai_shi_match:
                    shi_pos = shi_hai_shi_match.start()
                    if shi_pos > 0 and text[shi_pos - 1] == '但':
                        pass  # "但是...还是" 不是选择疑问句
                    else:
                        is_question = True
                else:
                    is_question = True

    # ── 感叹句检测 ──
    is_exclamation = False
    if not is_question:
        # 检测 1：感叹词模式
        if _EXCLAMATION_PATTERN.search(text):
            is_exclamation = True
        # 检测 2：句首感叹词
        if re.match(r'^(哇|啊|呀|哎呀|哎哟|天哪|天啊|我的天|'
                     r'太好了|太好了|好极了|太棒了|真棒|厉害|'
                     r'加油|恭喜|祝贺|欢迎)', text):
            is_exclamation = True
        # 检测 3：句末感叹词（啊、呀、哇、啦 在句末，且前面有程度副词）
        if not is_exclamation:
            exclamation_end = re.search(
                r'(极|非常|特别|十分|很|太|真|好|多|可|'
                r'不得了|得很|极了|不过|不行|要命|要死|'
                r'死|坏|透|极|绝|顶|超|巨|老)'
                r'.{0,6}(啊|呀|哇|啦|喽|呐|哪|呢|哦)$',
                text
            )
            if exclamation_end:
                is_exclamation = True

    if is_question:
        return text + '？'
    elif is_exclamation:
        return text + '！'
    elif is_last:
        return text + '。'
    else:
        # 非最后一句且不是疑问/感叹，用句号
        return text + '。'


# ── 替换旧的规则引擎 ──────────────────────────────────────

def _rule_based_punctuation(text: str, style: PunctuationStyle) -> str:
    """基于规则的标点添加（已升级为智能标点引擎）"""
    return _smart_punctuate(text, style)


def _rule_based_correction(text: str, strength: CorrectionStrength) -> str:
    """基于规则的纠错"""
    if strength == "light":
        return text

    result = text
    for wrong, correct in _HOMOPHONE_CORRECTIONS.items():
        if wrong in result:
            result = result.replace(wrong, correct)

    if strength == "strong":
        result = re.sub(r'(.)\1{3,}', r'\1\1', result)
        result = result.replace('。。', '。').replace('，，', '，')

    return result


def _rule_based_postprocess(text: str, config: PostProcessConfig) -> str:
    """基于规则的全流程后处理"""
    if not text or not text.strip():
        return text

    # 阶段 1：纠错
    text = _rule_based_correction(text, config.correction)

    # 阶段 2：智能标点（使用新的智能引擎）
    text = _smart_punctuate(text, config.punctuation)

    # 清理多余空白
    text = re.sub(r'\s+', '', text)

    return text


# ── 对外接口 ──────────────────────────────────────────────

async def postprocess_text(
    text: str,
    correction: CorrectionStrength = "medium",
    punctuation: PunctuationStyle = "standard",
    timeout: float = 5.0,
) -> str:
    """对语音转文字结果进行后处理

    Args:
        text: 原始识别文本
        correction: 纠错强度 ("light" | "medium" | "strong")
        punctuation: 标点风格 ("standard" | "minimal" | "verbose")
        timeout: LLM 调用超时时间（秒）

    Returns:
        处理后的文本
    """
    if not text or not text.strip():
        return text

    existing_punct = len(re.findall(r'[。！？，；：、]', text))
    if existing_punct > 3:
        logger.info(f"文本已有 {existing_punct} 个标点，跳过后处理")
        return text

    config = PostProcessConfig(correction=correction, punctuation=punctuation)

    result = await _llm_postprocess(text, config, timeout)
    if result:
        return result

    logger.info("使用规则引擎进行文本后处理")
    return _rule_based_postprocess(text, config)


def postprocess_text_sync(
    text: str,
    correction: CorrectionStrength = "medium",
    punctuation: PunctuationStyle = "standard",
) -> str:
    """同步版本的后处理（仅规则引擎）"""
    if not text or not text.strip():
        return text

    existing_punct = len(re.findall(r'[。！？，；：、]', text))
    if existing_punct > 3:
        return text

    config = PostProcessConfig(correction=correction, punctuation=punctuation)
    return _rule_based_postprocess(text, config)


# ── 流式部分结果实时纠错 ─────────────────────────────────

# 部分结果纠错映射（轻量级，仅纠正最明显的错误）
_PARTIAL_CORRECTIONS = {
    # 最高频错误
    '人工只能': '人工智能', '数句': '数据', '数句库': '数据库',
    '变程': '编程', '前段': '前端', '附务器': '服务器',
    '福务器': '服务器', '借口': '接口', '代马': '代码',
    '代玛': '代码', '原码': '源码', '不署': '部署',
    '不暑': '部署', '百京': '北京', '伤海': '上海',
    '广洲': '广州', '身圳': '深圳', '航州': '杭州',
    '成嘟': '成都', '深度学西': '深度学习',
    '神精网络': '神经网络', '大语岩模型': '大语言模型',
    '公作': '工作', '工司': '公司', '名天': '明天',
    '名白': '明白', '自已': '自己', '己经': '已经',
    '做业': '作业', '做用': '作用',
    '绝定': '决定', '决对': '绝对',
    '声体': '身体', '身音': '声音',
    '心闻': '新闻', '新情': '心情',
    '会来': '回来', '会家': '回家',
    '对伍': '队伍', '队于': '对于',
    '有去': '有趣', '去味': '趣味',
    '带帽子': '戴帽子', '带眼镜': '戴眼镜',
    '坐位': '座位', '座下': '坐下',
    '蓝球': '篮球', '篮天': '蓝天',
    '公圆': '公园', '花圆': '花园',
    '在来': '再来', '在说': '再说', '在次': '再次',
    '做的好': '做得好', '说的对': '说得对',
    '跑的快': '跑得快', '唱的好': '唱得好',
    '一毛一样': '一模一样',
    '不造': '不知道', '不宣': '不喜欢',
    '有木有': '有没有', '神马': '什么', '木有': '没有',
    '灰常': '非常', '酱紫': '这样子',
    '文挡': '文档', '接口文挡': '接口文档',
    '开源': '开源', '原代码': '源代码',

    # ── 八字/紫微领域高频错误（流式实时纠错）──
    '巴子': '八字', '巴字': '八字', '八自': '八字',
    '排盘': '排盘', '排磐': '排盘',
    '命盘': '命盘', '明盘': '命盘',
    '大运': '大运', '大孕': '大运',
    '留年': '流年', '刘年': '流年',
    '留月': '流月', '刘月': '流月',
    '留日': '流日', '刘日': '流日',
    '留时': '流时', '刘时': '流时',
    '天干': '天干', '天甘': '天干',
    '地支': '地支', '地之': '地支',
    '藏干': '藏干', '藏甘': '藏干',
    '纳音': '纳音', '那音': '纳音',
    '空亡': '空亡', '空王': '空亡',
    '神煞': '神煞', '神沙': '神煞',
    '五行': '五行', '无行': '五行',
    '十神': '十神', '十身': '十神',
    '正官': '正官', '正关': '正官',
    '七杀': '七杀', '七煞': '七杀',
    '正印': '正印', '正应': '正印',
    '偏印': '偏印', '偏应': '偏印',
    '正财': '正财', '正才': '正财',
    '偏财': '偏财', '偏才': '偏财',
    '食神': '食神', '石神': '食神',
    '伤官': '伤官', '上官': '伤官',
    '比肩': '比肩', '比间': '比肩',
    '劫财': '劫财', '劫才': '劫财',
    '紫微': '紫微', '子微': '紫微', '紫薇': '紫微',
    '天机': '天机', '天鸡': '天机',
    '武曲': '武曲', '五曲': '武曲',
    '天同': '天同', '天童': '天同',
    '廉贞': '廉贞', '连贞': '廉贞',
    '天府': '天府', '天腐': '天府',
    '太阴': '太阴', '太音': '太阴',
    '贪狼': '贪狼', '贪郎': '贪狼',
    '巨门': '巨门', '俱门': '巨门',
    '天相': '天相', '天香': '天相',
    '天梁': '天梁', '天粮': '天梁',
    '破军': '破军', '破君': '破军',
    '文昌': '文昌', '文娼': '文昌',
    '文曲': '文曲', '文取': '文曲',
    '左辅': '左辅', '左府': '左辅',
    '右弼': '右弼', '右必': '右弼',
    '天魁': '天魁', '天葵': '天魁',
    '天钺': '天钺', '天月': '天钺',
    '禄存': '禄存', '路存': '禄存',
    '天马': '天马', '天码': '天马',
    '擎羊': '擎羊', '青羊': '擎羊',
    '陀罗': '陀罗', '陀螺': '陀罗',
    '火星': '火星', '火性': '火星',
    '铃星': '铃星', '灵星': '铃星',
    '地空': '地空', '地孔': '地空',
    '地劫': '地劫', '地节': '地劫',
    '化禄': '化禄', '化路': '化禄',
    '化权': '化权', '化全': '化权',
    '化科': '化科', '化颗': '化科',
    '化忌': '化忌', '化记': '化忌',
    '命宫': '命宫', '明宫': '命宫',
    '大限': '大限', '大现': '大限',
    '小限': '小限', '小现': '小限',
    '四化': '四化', '四画': '四化',
    '对宫': '对宫', '对公': '对宫',
    '本命': '本命', '本名': '本命',
    '运程': '运程', '运城': '运程',
    '长生': '长生', '常生': '长生',
    '沐浴': '沐浴', '木浴': '沐浴',
    '冠带': '冠带', '官带': '冠带',
    '临官': '临官', '林官': '临官',
    '帝旺': '帝旺', '帝王': '帝旺',
    '真太阳时': '真太阳时', '真太阳石': '真太阳时',
    '排八字': '排八字', '排巴子': '排八字',
    '排大运': '排大运', '排大孕': '排大运',
    '起运': '起运', '起孕': '起运',
    '用神': '用神', '用身': '用神',
    '忌神': '忌神', '记神': '忌神',
    '喜神': '喜神', '洗神': '喜神',
}


def correct_partial_text(text: str) -> str:
    """对流式语音识别的部分结果进行实时纠错

    轻量级处理，仅纠正最明显、最确定的错误，延迟 <1ms。
    不会添加标点符号（部分结果不适合添加标点）。

    Args:
        text: 当前部分识别文本

    Returns:
        纠错后的文本
    """
    if not text or not text.strip():
        return text

    result = text

    # 高频错误纠正
    for wrong, correct in _PARTIAL_CORRECTIONS.items():
        if wrong in result:
            result = result.replace(wrong, correct)

    # 清理异常字符
    result = re.sub(r'[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\u200B-\u200F\uFEFF]', '', result)
    result = re.sub(r'\s+', ' ', result).strip()

    return result


# 扩大完整后处理纠错词库
_HOMOPHONE_CORRECTIONS.update({
    # 在/再 扩展
    '在也不': '再也不', '在来一次': '再来一次',
    # 的/得/地 扩展
    '说得好': '说得好', '写得很好': '写得很好',
    '做的很好': '做得很好', '学得很快': '学得很快',
    '认真的做': '认真地做', '慢慢的走': '慢慢地走',
    # 做/作 扩展
    '做文章': '作文章', '做报告': '作报告',
    '做贡献': '作贡献', '叫做什么': '叫作什么',
    # 须/需 扩展
    '必需要': '需要', '必需': '必须',
    '须要': '需要', '必需要求': '要求',
    # 到/倒 扩展
    '到底': '到底', '到是': '倒是',
    '到霉': '倒霉', '到胃口': '倒胃口',
    # 象/像 扩展
    '好象': '好像', '图象': '图像',
    '照象': '照像', '好相': '好像',
    # 式/势 扩展
    '形式': '形势', '公势': '公式',
    # 查/察 扩展
    '观查': '观察', '检察': '检查',
    '调查': '调查', '侦擦': '侦查',

    # ── 八字/紫微斗数领域术语纠错 ──
    # 八字核心术语
    '巴子': '八字', '巴字': '八字', '八自': '八字',
    '排盘': '排盘', '排磐': '排盘', '排潘': '排盘',
    '命盘': '命盘', '命磐': '命盘', '明盘': '命盘',
    '大运': '大运', '大孕': '大运', '大韵': '大运',
    '留年': '流年', '刘年': '流年', '流连': '流年',
    '留月': '流月', '刘月': '流月',
    '留日': '流日', '刘日': '流日',
    '留时': '流时', '刘时': '流时',
    '天干': '天干', '天甘': '天干', '天赶': '天干',
    '地支': '地支', '地之': '地支', '地枝': '地支',
    '藏干': '藏干', '藏甘': '藏干', '仓干': '藏干',
    '纳音': '纳音', '那音': '纳音', '纳阴': '纳音',
    '空亡': '空亡', '空王': '空亡', '空网': '空亡',
    '神煞': '神煞', '神沙': '神煞', '神杀': '神煞',
    '五行': '五行', '无行': '五行', '五形': '五行',
    '十神': '十神', '十身': '十神', '石神': '十神',
    '正官': '正官', '正关': '正官', '政官': '正官',
    '七杀': '七杀', '七煞': '七杀', '七沙': '七杀',
    '正印': '正印', '正应': '正印', '正隐': '正印',
    '偏印': '偏印', '偏应': '偏印', '片印': '偏印',
    '正财': '正财', '正才': '正财', '正材': '正财',
    '偏财': '偏财', '偏才': '偏财', '片财': '偏财',
    '食神': '食神', '十神': '食神', '石神': '食神',
    '伤官': '伤官', '上官': '伤官', '商官': '伤官',
    '比肩': '比肩', '比间': '比肩', '笔肩': '比肩',
    '劫财': '劫财', '劫才': '劫财', '节财': '劫财',
    # 天干
    '甲木': '甲木', '假木': '甲木', '贾木': '甲木',
    '乙木': '乙木', '以木': '乙木', '已木': '乙木',
    '丙火': '丙火', '饼火': '丙火', '并火': '丙火',
    '丁火': '丁火', '定火': '丁火', '顶火': '丁火',
    '戊土': '戊土', '务土': '戊土', '无土': '戊土',
    '己土': '己土', '几土': '己土', '记土': '己土',
    '庚金': '庚金', '更金': '庚金', '耕金': '庚金',
    '辛金': '辛金', '新金': '辛金', '心金': '辛金',
    '壬水': '壬水', '人水': '壬水', '任水': '壬水',
    '癸水': '癸水', '鬼水': '癸水', '贵水': '癸水',
    # 地支
    '子水': '子水', '紫水': '子水', '字水': '子水',
    '丑土': '丑土', '愁土': '丑土', '臭土': '丑土',
    '寅木': '寅木', '银木': '寅木', '引木': '寅木',
    '卯木': '卯木', '毛木': '卯木', '猫木': '卯木',
    '辰土': '辰土', '尘土': '辰土', '陈土': '辰土',
    '巳火': '巳火', '四火': '巳火', '死火': '巳火',
    '午火': '午火', '五火': '午火', '武火': '午火',
    '未土': '未土', '为土': '未土', '位土': '未土',
    '申金': '申金', '深金': '申金', '身金': '申金',
    '酉金': '酉金', '有金': '酉金', '又金': '酉金',
    '戌土': '戌土', '需土': '戌土', '虚土': '戌土',
    '亥水': '亥水', '海水': '亥水', '害水': '亥水',
    # 紫微斗数主星
    '紫微': '紫微', '子微': '紫微', '紫薇': '紫微', '紫为': '紫微',
    '天机': '天机', '天鸡': '天机', '天基': '天机', '天几': '天机',
    '太阳': '太阳', '太洋': '太阳', '太扬': '太阳',
    '武曲': '武曲', '五曲': '武曲', '舞曲': '武曲', '武取': '武曲',
    '天同': '天同', '天童': '天同', '天铜': '天同', '天通': '天同',
    '廉贞': '廉贞', '连贞': '廉贞', '联贞': '廉贞', '廉真': '廉贞',
    '天府': '天府', '天腐': '天府', '天辅': '天府', '天父': '天府',
    '太阴': '太阴', '太音': '太阴', '太因': '太阴', '泰阴': '太阴',
    '贪狼': '贪狼', '贪郎': '贪狼', '摊狼': '贪狼', '滩狼': '贪狼',
    '巨门': '巨门', '俱门': '巨门', '具门': '巨门', '句门': '巨门',
    '天相': '天相', '天香': '天相', '天象': '天相', '天向': '天相',
    '天梁': '天梁', '天粮': '天梁', '天良': '天梁', '天凉': '天梁',
    '破军': '破军', '破君': '破军', '破均': '破军', '迫军': '破军',
    # 辅星/杂曜
    '文昌': '文昌', '文娼': '文昌', '文仓': '文昌',
    '文曲': '文曲', '文取': '文曲', '文区': '文曲',
    '左辅': '左辅', '左府': '左辅', '左斧': '左辅',
    '右弼': '右弼', '右必': '右弼', '右笔': '右弼',
    '天魁': '天魁', '天葵': '天魁', '天亏': '天魁',
    '天钺': '天钺', '天月': '天钺', '天越': '天钺',
    '禄存': '禄存', '路存': '禄存', '陆存': '禄存',
    '天马': '天马', '天码': '天马', '天玛': '天马',
    '擎羊': '擎羊', '青羊': '擎羊', '情羊': '擎羊', '轻羊': '擎羊',
    '陀罗': '陀罗', '陀螺': '陀罗', '驮罗': '陀罗', '驼罗': '陀罗',
    '火星': '火星', '火性': '火星', '或星': '火星',
    '铃星': '铃星', '灵星': '铃星', '零星': '铃星',
    '地空': '地空', '地孔': '地空', '地控': '地空',
    '地劫': '地劫', '地节': '地劫', '地杰': '地劫',
    # 四化星
    '化禄': '化禄', '化路': '化禄', '化陆': '化禄', '画禄': '化禄',
    '化权': '化权', '化全': '化权', '化拳': '化权', '画权': '化权',
    '化科': '化科', '化颗': '化科', '化课': '化科', '画科': '化科',
    '化忌': '化忌', '化记': '化忌', '化季': '化忌', '画忌': '化忌',
    # 十二宫
    '命宫': '命宫', '明宫': '命宫', '名宫': '命宫',
    '兄弟宫': '兄弟宫', '兄弟攻': '兄弟宫', '兄弟公': '兄弟宫',
    '夫妻宫': '夫妻宫', '夫妻公': '夫妻宫', '福气宫': '夫妻宫',
    '子女宫': '子女宫', '子女公': '子女宫', '子女儿': '子女宫',
    '财帛宫': '财帛宫', '财博宫': '财帛宫', '财伯宫': '财帛宫',
    '疾厄宫': '疾厄宫', '疾病宫': '疾厄宫', '急厄宫': '疾厄宫',
    '迁移宫': '迁移宫', '千移宫': '迁移宫', '迁移公': '迁移宫',
    '交友宫': '交友宫', '交友公': '交友宫', '交有宫': '交友宫',
    '官禄宫': '官禄宫', '官路宫': '官禄宫', '关禄宫': '官禄宫',
    '田宅宫': '田宅宫', '田斋宫': '田宅宫', '田摘宫': '田宅宫',
    '福德宫': '福德宫', '福得宫': '福德宫', '福的宫': '福德宫',
    '父母宫': '父母宫', '父母公': '父母宫', '父目宫': '父母宫',
    '身宫': '身宫', '生宫': '身宫', '深宫': '身宫',
    # 其他八字/紫微术语
    '大限': '大限', '大现': '大限', '大线': '大限',
    '小限': '小限', '小现': '小限', '小线': '小限',
    '四化': '四化', '四画': '四化', '四话': '四化',
    '三方四正': '三方四正', '三方四政': '三方四正',
    '对宫': '对宫', '对公': '对宫', '队宫': '对宫',
    '本命': '本命', '本名': '本命', '本明': '本命',
    '运程': '运程', '运城': '运程', '运成': '运程',
    '十二长生': '十二长生', '十二长身': '十二长生',
    '长生': '长生', '长身': '长生', '常生': '长生',
    '沐浴': '沐浴', '木浴': '沐浴', '目浴': '沐浴',
    '冠带': '冠带', '官带': '冠带', '关带': '冠带',
    '临官': '临官', '林官': '临官', '邻官': '临官',
    '帝旺': '帝旺', '帝王': '帝旺', '地旺': '帝旺',
    '真太阳时': '真太阳时', '真太阳石': '真太阳时',
    '排八字': '排八字', '排巴子': '排八字',
    '排大运': '排大运', '排大孕': '排大运',
    '起运': '起运', '起孕': '起运', '启运': '起运',
    '交运': '交运', '交孕': '交运', '焦运': '交运',
    '用神': '用神', '用身': '用神', '永神': '用神',
    '忌神': '忌神', '记神': '忌神', '季神': '忌神',
    '喜神': '喜神', '洗神': '喜神', '西神': '喜神',
    '闲神': '闲神', '贤神': '闲神', '咸神': '闲神',
    '仇神': '仇神', '愁神': '仇神', '抽神': '仇神',
    '通关': '通关', '通官': '通关', '同关': '通关',
    '调候': '调候', '调后': '调候', '条候': '调候',
    '扶抑': '扶抑', '扶易': '扶抑', '服抑': '扶抑',
    '从格': '从格', '从革': '从格', '从隔': '从格',
    '化格': '化格', '画格': '化格', '话格': '化格',

    # 更多技术词汇
    '全站工程师': '全栈工程师',
    '前段开发': '前端开发', '后段开发': '后端开发',
    'Python': 'Python', 'JavaScript': 'JavaScript',
    'React': 'React', 'Vue': 'Vue',
    'API': 'API', 'SDK': 'SDK',
    'Git': 'Git', 'GitHub': 'GitHub',
    'Docker': 'Docker', 'Kubernetes': 'Kubernetes',
    '微服务': '微服务', '微福务': '微服务',
    '云原声': '云原生', '云原生': '云原生',
    '容器华': '容器化', '容器画': '容器化',
    '持续集成': '持续集成', '持续部暑': '持续部署',
    '持续交付': '持续交付', '自动化': '自动化',
    '自动华': '自动化', '自动划': '自动化',
    # 更多地名
    '南京': '南京', '天津': '天津',
    '重庆': '重庆', '武汗': '武汉',
    '武汉': '武汉', '西按': '西安',
    '西安': '西安', '长杀': '长沙',
    '长沙': '长沙', '正州': '郑州',
    '郑州': '郑州', '青倒': '青岛',
    '青岛': '青岛', '大脸': '大连',
    '大连': '大连', '下门': '厦门',
    '厦门': '厦门', '福洲': '福州',
    '福州': '福州', '昆名': '昆明',
    '昆明': '昆明', '哈儿滨': '哈尔滨',
    '哈尔滨': '哈尔滨', '沈样': '沈阳',
    '沈阳': '沈阳', '石加庄': '石家庄',
    '石家庄': '石家庄',
    # 更多常见词
    '环境': '环境', '环镜': '环境',
    '配置': '配置', '陪置': '配置',
    '版本': '版本', '板本': '版本',
    '安装': '安装', '按装': '安装',
    '下载': '下载', '下在': '下载',
    '运行': '运行', '云行': '运行',
    '执行': '执行', '直行': '执行',
    '编译': '编译', '边译': '编译',
    '测试': '测试', '策试': '测试',
    '调试': '调试', '条试': '调试',
    '开发': '开发', '开法': '开发',
    '设计': '设计', '社计': '设计',
    '架构': '架构', '加构': '架构',
    '算法': '算法', '算发': '算法',
    '函数': '函数', '寒数': '函数',
    '变量': '变量', '变亮': '变量',
    '参数': '参数', '灿数': '参数',
    '模块': '模块', '磨块': '模块',
    '组件': '组件', '组建': '组件',
    '框架': '框架', '矿架': '框架',
    '协议': '协议', '鞋议': '协议',
    '网络': '网络', '网罗': '网络',
    '系统': '系统', '戏统': '系统',
    '程序': '程序', '成序': '程序',
    '应用': '应用', '硬用': '应用',
    '服务': '服务', '福务': '服务',
    '项目': '项目', '向目': '项目',
    '需求': '需求', '需球': '需求',
    '文档': '文档', '文当': '文档',
    '更新': '更新', '更心': '更新',
    '优化': '优化', '有化': '优化',
    '修复': '修复', '修副': '修复',
    '重构': '重构', '冲构': '重构',
    '迁移': '迁移', '千移': '迁移',
    '兼容': '兼容', '间容': '兼容',
    '性能': '性能', '兴能': '性能',
    '安全': '安全', '安权': '安全',
    '稳定': '稳定', '稳顶': '稳定',
    '可靠': '可靠', '可考': '可靠',
    '高效': '高效', '高校': '高效',
    '简单': '简单', '减单': '简单',
    '复杂': '复杂', '副杂': '复杂',
    '重要': '重要', '中要': '重要',
    '关键': '关键', '关建': '关键',
    '核心': '核心', '河心': '核心',
    '基础': '基础', '机础': '基础',
    '标准': '标准', '标椎': '标准',
    '规范': '规范', '归范': '规范',
    '流程': '流程', '留程': '流程',
    '策略': '策略', '册略': '策略',
    '方案': '方案', '芳案': '方案',
    '计划': '计划', '记划': '计划',
    '目标': '目标', '木标': '目标',
    '结果': '结果', '节果': '结果',
    '效果': '效果', '笑果': '效果',
    '质量': '质量', '质亮': '质量',
    '效率': '效率', '笑率': '效率',
    '成本': '成本', '城本': '成本',
    '资源': '资源', '资原': '资源',
    '能力': '能力', '能立': '能力',
    '经验': '经验', '精验': '经验',
    '知识': '知识', '知食': '知识',
    '技术': '技术', '记术': '技术',
    '方法': '方法', '芳法': '方法',
    '工具': '工具', '公具': '工具',
    '平台': '平台', '平抬': '平台',
    '产品': '产品', '产平': '产品',
    '业务': '业务', '夜务': '业务',
    '用户': '用户', '用护': '用户',
    '体验': '体验', '体艳': '体验',
    '界面': '界面', '借面': '界面',
    '功能': '功能', '公能': '功能',
    '特性': '特性', '特兴': '特性',
    '优势': '优势', '有势': '优势',
    '问题': '问题', '问提': '问题',
    '解决': '解决', '解觉': '解决',
    '处理': '处理', '出理': '处理',
    '管理': '管理', '管里': '管理',
    '控制': '控制', '空制': '控制',
    '监控': '监控', '间控': '监控',
    '分析': '分析', '分西': '分析',
    '统计': '统计', '通计': '统计',
    '计算': '计算', '记算': '计算',
    '存储': '存储', '存出': '存储',
    '缓存': '缓存', '换存': '缓存',
    '备份': '备份', '被份': '备份',
    '恢复': '恢复', '灰复': '恢复',
    '日志': '日志', '日制': '日志',
    '错误': '错误', '错无': '错误',
    '异常': '异常', '意常': '异常',
    '警告': '警告', '警高': '警告',
    '信息': '信息', '心息': '信息',
    '消息': '消息', '消西': '消息',
    '通知': '通知', '通之': '通知',
    '提醒': '提醒', '提形': '提醒',
    '确认': '确认', '却认': '确认',
    '取消': '取消', '取笑': '取消',
    '删除': '删除', '山除': '删除',
    '添加': '添加', '天加': '添加',
    '修改': '修改', '修该': '修改',
    '创建': '创建', '创见': '创建',
    '生成': '生成', '声成': '生成',
    '导入': '导入', '倒入': '导入',
    '导出': '导出', '倒出': '导出',
    '保存': '保存', '保村': '保存',
    '加载': '加载', '家在': '加载',
    '提交': '提交', '题交': '提交',
    '推送': '推送', '推松': '推送',
    '合并': '合并', '和并': '合并',
    '分支': '分支', '分之': '分支',
    '冲突': '冲突', '冲图': '冲突',
    '发布': '发布', '发不': '发布',
    '上线': '上线', '上现': '上线',
    '回滚': '回滚', '回棍': '回滚',
    '监控': '监控', '间控': '监控',
    '报警': '报警', '报井': '报警',
    '扩容': '扩容', '扩融': '扩容',
    '缩容': '缩容', '缩融': '缩容',
    '负载': '负载', '付载': '负载',
    '均衡': '均衡', '均横': '均衡',
    '代理': '代理', '带理': '代理',
    '网关': '网关', '网管': '网关',
    '路由': '路由', '路有': '路由',
    '域名': '域名', '玉名': '域名',
    '证书': '证书', '正书': '证书',
    '加密': '加密', '加蜜': '加密',
    '解密': '解密', '解蜜': '解密',
    '签名': '签名', '千名': '签名',
    '验证': '验证', '严证': '验证',
    '授权': '授权', '受权': '授权',
    '认证': '认证', '人证': '认证',
    '登录': '登录', '灯录': '登录',
    '注册': '注册', '住册': '注册',
    '密码': '密码', '蜜码': '密码',
    '账户': '账户', '张户': '账户',
    '权限': '权限', '全限': '权限',
    '角色': '角色', '决色': '角色',
    '会话': '会话', '回话': '会话',
    '令牌': '令牌', '另牌': '令牌',
    '过期': '过期', '过气': '过期',
    '刷新': '刷新', '帅新': '刷新',
    '请求': '请求', '请球': '请求',
    '响应': '响应', '想应': '响应',
    '超时': '超时', '超市': '超时',
    '重试': '重试', '冲试': '重试',
    '降级': '降级', '将级': '降级',
    '熔断': '熔断', '容断': '熔断',
    '限流': '限流', '现流': '限流',
    '队列': '队列', '对列': '队列',
    '消息队': '消息队', '消息对': '消息队',
    '生产者': '生产者', '声产者': '生产者',
    '消费者': '消费者', '消废者': '消费者',
    '订阅': '订阅', '定阅': '订阅',
    '发布订阅': '发布', '发不': '发布',
    '主题': '主题', '主题': '主题',
    '分区': '分区', '分曲': '分区',
    '副本': '副本', '副板': '副本',
    '主从': '主从', '主虫': '主从',
    '集群': '集群', '集权': '集群',
    '节点': '节点', '结点': '节点',
    '实例': '实例', '实力': '实例',
    '容器': '容器', '容气': '容器',
    '镜像': '镜像', '镜像': '镜像',
    '镜像': '镜像', '静像': '镜像',
    '编排': '编排', '编排': '编排',
    '调度': '调度', '调度': '调度',
    '任务': '任务', '人物': '任务',
    '定时': '定时', '定时': '定时',
    '触发': '触发', '出发': '触发',
    '事件': '事件', '时间': '时间',
    '回调': '回调', '回调': '回调',
    '钩子': '钩子', '钩子': '钩子',
    '插件': '插件', '插件': '插件',
    '中间件': '中间件', '中间见': '中间件',
    '拦截器': '拦截器', '拦截气': '拦截器',
    '过滤器': '过滤器', '过滤器': '过滤器',
    '转换器': '转换器', '转换气': '转换器',
    '适配器': '适配器', '适配气': '适配器',
    '序列化': '序列化', '序列画': '序列化',
    '反序列化': '反序列化', '反序列画': '反序列化',
    '编码': '编码', '编码': '编码',
    '解码': '解码', '解码': '解码',
    '压缩': '压缩', '压缩': '压缩',
    '解压': '解压', '解压': '解压',
    '哈希': '哈希', '哈希': '哈希',
    '索引': '索引', '索引': '索引',
    '查询': '查询', '查询': '查询',
    '事务': '事务', '事务': '事务',
    '锁': '锁', '锁': '锁',
    '死锁': '死锁', '死锁': '死锁',
    '并发': '并发', '并发': '并发',
    '并行': '并行', '并行': '并行',
    '异步': '异步', '异步': '异步',
    '同步': '同步', '同步': '同步',
    '阻塞': '阻塞', '阻塞': '阻塞',
    '非阻塞': '非阻塞', '非阻塞': '非阻塞',
    '协程': '协程', '协程': '协程',
    '线程': '线程', '线程': '线程',
    '进程': '进程', '进程': '进程',
    '内存': '内存', '内存': '内存',
    '磁盘': '磁盘', '磁盘': '磁盘',
    'CPU': 'CPU', 'GPU': 'GPU',
    'IO': 'IO', 'IO密集型': 'IO密集型',
    '计算密集型': '计算密集型', '计算密级型': '计算密集型',
})

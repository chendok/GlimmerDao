# 排盘JSON结构规范

> 本文档定义八字排盘系统输出的完整JSON结构。排盘系统必须按此规范输出，技能模型按此规范读取。
>
> **格式要求**：排盘信息必须以JSON格式输出，不得使用Markdown或其他格式。JSON的嵌套结构能精确表达字段层级关系，且技能中所有字段引用路径均按JSON路径设计。

---

## 一、JSON结构总览

```json
{
  "chartType": "八字",
  "basicInfo": { },
  "fourPillars": [ ],
  "dayMaster": { },
  "pattern": "",
  "monthOrder": "",
  "wuXingDistribution": { },
  "shenSha": { },
  "kongWangInfo": { },
  "tianYiGuiRenInfo": { },
  "mingGong": "",
  "shenGong": "",
  "taiYuan": "",
  "qiYun": { },
  "daYun": [ ],
  "currentDaYun": { },
  "currentLiuNian": { },
  "liuYueYear": 2026,
  "liuYueList": [ ],
  "analysis": { }
}
```

---

## 二、字段详细定义

### 2.1 chartType（排盘类型）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `chartType` | string | 是 | 固定值 `"八字"` |

---

### 2.2 basicInfo（基础信息）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `name` | string | 是 | 命主姓名 | `"陈纪东"` |
| `gender` | string | 是 | 性别 | `"男"` / `"女"` |
| `genderLabel` | string | 是 | 性别标签 | `"乾造"`（男）/ `"坤造"`（女） |
| `solarDate` | string | 是 | 公历出生时间 | `"1974年08月19日 13:30"` |
| `lunarDate` | string | 是 | 农历出生时间 | `"甲寅年七月初二日 未时"` |
| `trueSolarTime` | string | 是 | 真太阳时校正后时间 | `"1974-08-19 13:52"` |
| `birthplace` | string | 是 | 出生地点 | `"吉林省 吉林市 昌邑区"` |

**示例**：
```json
"basicInfo": {
  "name": "陈纪东",
  "gender": "男",
  "genderLabel": "乾造",
  "solarDate": "1974年08月19日 13:30",
  "lunarDate": "甲寅年七月初二日 未时",
  "trueSolarTime": "1974-08-19 13:52",
  "birthplace": "吉林省 吉林市 昌邑区"
}
```

---

### 2.3 fourPillars（四柱信息）

数组，固定4个元素，顺序为年柱→月柱→日柱→时柱。

**每个柱位对象字段**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `label` | string | 是 | 柱位名称 | `"年柱"` / `"月柱"` / `"日柱"` / `"时柱"` |
| `gan` | string | 是 | 天干 | `"甲"` |
| `zhi` | string | 是 | 地支 | `"寅"` |
| `naYin` | string | 是 | 纳音 | `"大溪水"` |
| `wuXing` | string | 是 | 天干五行 | `"木"` |
| `zhuXing` | string | 是 | 柱位十神（日柱为"日主"） | `"食神"` / `"日主"` |
| `fuXing` | string[] | 是 | 地支藏干对应的十神（本气→中气→余气） | `["食神", "偏财", "七杀"]` |
| `zangGan` | string[] | 是 | 地支藏干（本气→中气→余气） | `["甲", "丙", "戊"]` |
| `xingYun` | string | 是 | 日干在该地支的十二长生（行运） | `"病"` |
| `zizuo` | string | 是 | 该柱天干在地支的十二长生（自坐） | `"长生"` |
| `kongWang` | string[] | 是 | 该柱空亡地支 | `["子", "丑"]` |
| `shishen` | string[] | 是 | 完整十神列表（天干十神+各藏干十神） | `["食神", "食神", "偏财", "七杀"]` |

**示例**：
```json
"fourPillars": [
  {
    "label": "年柱",
    "gan": "甲",
    "zhi": "寅",
    "naYin": "大溪水",
    "wuXing": "木",
    "zhuXing": "食神",
    "fuXing": ["食神", "偏财", "七杀"],
    "zangGan": ["甲", "丙", "戊"],
    "xingYun": "病",
    "zizuo": "长生",
    "kongWang": ["子", "丑"],
    "shishen": ["食神", "食神", "偏财", "七杀"]
  },
  {
    "label": "月柱",
    "gan": "壬",
    "zhi": "申",
    "naYin": "剑锋金",
    "wuXing": "水",
    "zhuXing": "比肩",
    "fuXing": ["偏印", "比肩", "七杀"],
    "zangGan": ["庚", "壬", "戊"],
    "xingYun": "长生",
    "zizuo": "长生",
    "kongWang": ["戌", "亥"],
    "shishen": ["比肩", "偏印", "比肩", "七杀"]
  },
  {
    "label": "日柱",
    "gan": "壬",
    "zhi": "辰",
    "naYin": "长流水",
    "wuXing": "水",
    "zhuXing": "日主",
    "fuXing": ["七杀", "伤官", "劫财"],
    "zangGan": ["戊", "乙", "癸"],
    "xingYun": "墓",
    "zizuo": "墓",
    "kongWang": ["午", "未"],
    "shishen": ["日主", "七杀", "伤官", "劫财"]
  },
  {
    "label": "时柱",
    "gan": "丁",
    "zhi": "未",
    "naYin": "天河水",
    "wuXing": "火",
    "zhuXing": "正财",
    "fuXing": ["正官", "正财", "伤官"],
    "zangGan": ["己", "丁", "乙"],
    "xingYun": "养",
    "zizuo": "冠带",
    "kongWang": ["寅", "卯"],
    "shishen": ["正财", "正官", "正财", "伤官"]
  }
]
```

---

### 2.4 dayMaster（日主信息）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `gan` | string | 是 | 日主天干 | `"壬"` |
| `wuXing` | string | 是 | 日主五行 | `"水"` |
| `yinYang` | string | 是 | 阴阳属性 | `"阳"` / `"阴"` |
| `strength.level` | string | 是 | 旺衰等级 | `"身强"` / `"身弱"` / `"中和"` |
| `strength.score` | int | 是 | 旺衰评分（0-100） | `46` |
| `strength.detail` | string | 是 | 旺衰说明 | `"日主偏弱，失令少助"` |

**示例**：
```json
"dayMaster": {
  "gan": "壬",
  "wuXing": "水",
  "yinYang": "阳",
  "strength": {
    "level": "身弱",
    "score": 46,
    "detail": "日主偏弱，失令少助"
  }
}
```

> **注意**：此字段为排盘基础数据。更详细的旺衰分析（含得令/得地/得势/扶抑方向）在 `analysis.dayMasterStrength` 中提供。

---

### 2.5 pattern（格局名称）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `pattern` | string | 是 | 格局名称 | `"偏印格"` |

---

### 2.6 monthOrder（月令信息）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `monthOrder` | string | 是 | 月令地支及五行 | `"申（金行）"` |

---

### 2.7 wuXingDistribution（五行分布）

全局五行量化分布，5个五行各自的分值。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `金` | int | 是 | 金的分值 | `2` |
| `木` | int | 是 | 木的分值 | `5` |
| `水` | int | 是 | 水的分值 | `4` |
| `火` | int | 是 | 火的分值 | `3` |
| `土` | int | 是 | 土的分值 | `6` |

**示例**：
```json
"wuXingDistribution": {
  "金": 2,
  "木": 5,
  "水": 4,
  "火": 3,
  "土": 6
}
```

---

### 2.8 shenSha（神煞信息）

按柱位列出该柱的所有神煞。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `年柱` | string[] | 是 | 年柱神煞列表 | `["文昌贵人"]` |
| `月柱` | string[] | 是 | 月柱神煞列表 | `["太极贵人", "福星贵人", "驿马", "月德贵人"]` |
| `日柱` | string[] | 是 | 日柱神煞列表 | `["丧门", "金刚", "魁罡"]` |
| `时柱` | string[] | 是 | 时柱神煞列表 | `["天乙贵人", "国印贵人", "勾煞", "天喜", "天医", "德秀贵人", "空亡"]` |

**示例**：
```json
"shenSha": {
  "年柱": ["文昌贵人"],
  "月柱": ["太极贵人", "福星贵人", "驿马", "月德贵人"],
  "日柱": ["丧门", "金刚", "魁罡"],
  "时柱": ["天乙贵人", "国印贵人", "勾煞", "天喜", "天医", "德秀贵人", "空亡"]
}
```

---

### 2.9 命宫/身宫/胎元

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `mingGong` | string | 是 | 命宫（天干地支） | `"丙寅"` |
| `shenGong` | string | 是 | 身宫（天干地支） | `"戊辰"` |
| `taiYuan` | string | 是 | 胎元（天干地支） | `"癸亥"` |

---

### 2.10 qiYun（起运信息）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `years` | int | 是 | 起运年数 | `6` |
| `months` | int | 是 | 起运月数 | `7` |
| `days` | int | 是 | 起运日数 | `10` |
| `startAge` | int | 是 | 起运年龄 | `7` |
| `totalDays` | int | 是 | 总折算天数 | `19` |

**示例**：
```json
"qiYun": {
  "years": 6,
  "months": 7,
  "days": 10,
  "startAge": 7,
  "totalDays": 19
}
```

---

### 2.11 daYun（大运列表）

数组，每个元素为一步大运。

**大运对象字段**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `startAge` | int | 是 | 大运起始年龄 | `8` |
| `endAge` | int | 是 | 大运结束年龄 | `17` |
| `startYear` | int | 是 | 大运起始年份 | `1981` |
| `endYear` | int | 是 | 大运结束年份 | `1990` |
| `ganZhi` | string | 是 | 大运干支 | `"癸酉"` |
| `zhuXing` | string | 是 | 大运天干十神 | `"劫财"` |
| `fuXing` | string[] | 是 | 大运地支藏干十神 | `["正印"]` |
| `wuXing` | string | 是 | 大运天干五行 | `"水"` |
| `isCurrent` | bool | 否 | 是否为当前大运 | `true` |

**示例**（仅展示前3步）：
```json
"daYun": [
  {
    "startAge": 8, "endAge": 17,
    "startYear": 1981, "endYear": 1990,
    "ganZhi": "癸酉", "zhuXing": "劫财",
    "fuXing": ["正印"], "wuXing": "水",
    "isCurrent": false
  },
  {
    "startAge": 18, "endAge": 27,
    "startYear": 1991, "endYear": 2000,
    "ganZhi": "甲戌", "zhuXing": "食神",
    "fuXing": ["七杀", "正印", "正财"], "wuXing": "木",
    "isCurrent": false
  },
  {
    "startAge": 28, "endAge": 37,
    "startYear": 2001, "endYear": 2010,
    "ganZhi": "乙亥", "zhuXing": "伤官",
    "fuXing": ["比肩", "食神"], "wuXing": "木",
    "isCurrent": false
  }
]
```

> 大运共10步，从起运年龄到107岁，此处省略后续7步。

---

### 2.12 currentDaYun（当前大运）

当前命主所处的大运。若命主未到起运年龄则为 `null`。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `startAge` | int | 是 | 当前大运起始年龄 | `48` |
| `endAge` | int | 是 | 当前大运结束年龄 | `57` |
| `startYear` | int | 是 | 当前大运起始年份 | `2021` |
| `endYear` | int | 是 | 当前大运结束年份 | `2030` |
| `ganZhi` | string | 是 | 当前大运干支 | `"丁丑"` |
| `zhuXing` | string | 是 | 当前大运天干十神 | `"正财"` |
| `fuXing` | string[] | 是 | 当前大运地支藏干十神 | `["正官", "正印", "劫财"]` |
| `wuXing` | string | 是 | 当前大运天干五行 | `"火"` |

**示例**：
```json
"currentDaYun": {
  "startAge": 48, "endAge": 57,
  "startYear": 2021, "endYear": 2030,
  "ganZhi": "丁丑", "zhuXing": "正财",
  "fuXing": ["正官", "正印", "劫财"], "wuXing": "火"
}
```

---

### 2.13 currentLiuNian（当前流年）

当前年份的流年信息。无则填 `null`。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `year` | int | 是 | 流年年份 | `2026` |
| `ganZhi` | string | 是 | 流年干支 | `"丙午"` |
| `zhuXing` | string | 是 | 流年天干十神 | `"偏财"` |
| `fuXing` | string[] | 是 | 流年地支藏干十神 | `["七杀", "正印", "劫财"]` |
| `wuXing` | string | 是 | 流年天干五行 | `"火"` |

**示例**：
```json
"currentLiuNian": {
  "year": 2026,
  "ganZhi": "丙午",
  "zhuXing": "偏财",
  "fuXing": ["正财", "正官"],
  "wuXing": "火"
}
```

---

### 2.14 liuYueList（流月列表）

当前流年的12个月流月信息。可选字段，用户选中流月分析时提供。

数组，12个元素，每月一个。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `month` | int | 是 | 月份（1-12） | `1` |
| `ganZhi` | string | 是 | 流月干支 | `"庚寅"` |
| `zhuXing` | string | 是 | 流月天干十神 | `"偏印"` |
| `wuXing` | string | 是 | 流月天干五行 | `"金"` |

**示例**（仅展示前2月）：
```json
"liuYueList": [
  { "month": 1, "ganZhi": "庚寅", "zhuXing": "偏印", "wuXing": "金" },
  { "month": 2, "ganZhi": "辛卯", "zhuXing": "正印", "wuXing": "金" }
]
```

---

## 三、analysis（预计算分析结果）

> **最高优先级**：当排盘JSON包含 `analysis` 字段时，该字段中的预计算分析结果优先于一切规则，模型必须直接使用，不得自行重新计算或推翻。

`analysis` 对象包含以下14个子字段：

### 3.1 analysis.dayMasterStrength（日主旺衰详情）

```json
"dayMasterStrength": {
  "gan": "壬",
  "wuXing": "水",
  "level": "身弱",
  "score": 35,
  "deLing": false,
  "deDi": true,
  "deShi": false,
  "detail": "申月庚金生水得令28分，但木5重泄+土6重克，日主实际受力弱",
  "fuYiDirection": "生扶（印星/比劫）"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `gan` | string | 日主天干 |
| `wuXing` | string | 日主五行 |
| `level` | string | 旺衰等级：身强/中和/身弱 |
| `score` | int | 旺衰评分（0-100）：>60身强，40-60中和，<40身弱 |
| `deLing` | bool | 是否得令（月令生扶日主） |
| `deDi` | bool | 是否得地（地支有根气） |
| `deShi` | bool | 是否得势（天干有比劫帮身） |
| `detail` | string | 旺衰判定详细说明（一句话） |
| `fuYiDirection` | string | 扶抑方向：身强→"克泄耗（官杀/食伤/财星）"，身弱→"生扶（印星/比劫）" |

---

### 3.2 analysis.geJuInfo（格局信息）

```json
"geJuInfo": {
  "name": "偏印格",
  "chengBaiDu": "半成",
  "yongShen": "金（印星）",
  "xiangShen": "无",
  "chongKe": "月令申金被年支寅冲",
  "heHua": "无",
  "level": "有疵但成立"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 格局名称（如：正官格/七杀格/正印格/偏印格/食神格/伤官格/正财格/偏财格/建禄格/阳刃格等） |
| `chengBaiDu` | string | 格局成败度：成/半成/破格 |
| `yongShen` | string | 格局用神及对应十神 |
| `xiangShen` | string | 相神（辅助用神的十神），无则填"无" |
| `chongKe` | string | 格局用神受冲克情况，无则填"无" |
| `heHua` | string | 格局用神被合化情况，无则填"无" |
| `level` | string | 格局层次：清纯有力/有疵但成立/破损有救/破败无救 |

---

### 3.3 analysis.tiaoHou（调候用神及寒暖燥湿）

```json
"tiaoHou": {
  "hanNuan": { "level": "偏凉", "score": -1 },
  "zaoShi": { "level": "偏燥", "score": 2 },
  "tiaoHouNeed": true,
  "tiaoHouYongShen": "金",
  "tiaoHouReason": "申月金旺当令，土分6≥5偏燥，金通关化土生水，既润燥又生水",
  "urgency": "中度"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `hanNuan.level` | string | 寒暖等级：极寒/寒冷/偏寒/中和/偏凉/偏热/大热/极热 |
| `hanNuan.score` | int | 寒暖分值：负数为寒，正数为热，0为中和 |
| `zaoShi.level` | string | 燥湿等级：极湿/潮湿/偏湿/中和/偏燥/干燥/极燥 |
| `zaoShi.score` | int | 燥湿分值：负数为湿，正数为燥，0为中和 |
| `tiaoHouNeed` | bool | 是否需要调候 |
| `tiaoHouYongShen` | string | 调候用神五行（金/木/水/火/土/无） |
| `tiaoHouReason` | string | 调候判定依据（一句话） |
| `urgency` | string | 调候急迫度：高度/中度/低度/无需 |

---

### 3.4 analysis.yongShen（综合用神及喜忌系统）

```json
"yongShen": {
  "tiaoHouYongShen": "金",
  "fuYiYongShen": ["金", "水"],
  "geJuYongShen": "金",
  "zongHeYongShen": ["金", "水"],
  "priorityOrder": ["金", "水"],
  "priorityReason": "金生水，金为源头、水为归宿。印星(金)是比劫(水)的源头，以印星为第一用神",
  "zongHeReason": "调候=金，扶抑=金水，格局=金，三者一致",
  "xiShen": ["金", "水"],
  "jiShen": ["火", "土", "木"],
  "chouShen": ["木", "火"],
  "xianShen": [],
  "derivation": {
    "yongShen": "金、水（综合判定）",
    "xiShen": "土生金（喜），金生水（喜）",
    "jiShen": "火克金、土克水、木泄水",
    "chouShen": "木生火（仇），火生土（仇）"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `tiaoHouYongShen` | string | 调候用神五行 |
| `fuYiYongShen` | string[] | 扶抑用神五行列表 |
| `geJuYongShen` | string | 格局用神五行 |
| `zongHeYongShen` | string[] | 综合用神五行列表（最终结论） |
| `priorityOrder` | string[] | 用神优先级排序（第一个为第一用神），模型必须按此顺序输出所有用神相关内容 |
| `priorityReason` | string | 用神优先级排序理由（一句话） |
| `zongHeReason` | string | 综合用神判定依据（一句话，说明三级优先级如何取值） |
| `xiShen` | string[] | 喜神五行列表（生用神的五行） |
| `jiShen` | string[] | 忌神五行列表（克/泄用神的五行） |
| `chouShen` | string[] | 仇神五行列表（生忌神的五行） |
| `xianShen` | string[] | 闲神五行列表（无明显生克关系的五行） |
| `derivation` | object | 喜忌推导过程说明 |

---

### 3.5 analysis.shiShenPower（十神力量排序及数值）

数组，固定10个元素，按力量从大到小排序。必须列出全部十个十神。

```json
"shiShenPower": [
  { "rank": 1, "name": "食神", "wuXing": "木", "power": 25, "level": "极旺", "sources": "天干透出+地支本气根，十二长生临官" },
  { "rank": 2, "name": "偏印", "wuXing": "金", "power": 18, "level": "偏旺", "sources": "地支本气根，月令当令" },
  { "rank": 3, "name": "七杀", "wuXing": "土", "power": 15, "level": "偏旺", "sources": "地支藏干，受冲减损" },
  { "rank": 4, "name": "比肩", "wuXing": "水", "power": 12, "level": "中等", "sources": "天干透出，月令长生" },
  { "rank": 5, "name": "偏财", "wuXing": "火", "power": 10, "level": "中等", "sources": "地支中气藏干" },
  { "rank": 6, "name": "正财", "wuXing": "火", "power": 8, "level": "中等", "sources": "地支中气藏干" },
  { "rank": 7, "name": "正官", "wuXing": "土", "power": 5, "level": "偏弱", "sources": "地支本气根" },
  { "rank": 8, "name": "伤官", "wuXing": "木", "power": 3, "level": "偏弱", "sources": "地支余气藏干" },
  { "rank": 9, "name": "正印", "wuXing": "金", "power": 0, "level": "不现", "sources": "命局不现" },
  { "rank": 10, "name": "劫财", "wuXing": "水", "power": 0, "level": "不现", "sources": "命局不现" }
]
```

**每个元素字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `rank` | int | 排名（1-10） |
| `name` | string | 十神名称（正官/七杀/正印/偏印/食神/伤官/正财/偏财/比肩/劫财） |
| `wuXing` | string | 该十神对应的五行 |
| `power` | int | 综合力量值（四舍五入保留整数） |
| `level` | string | 力量等级：≥25极旺/15-24偏旺/8-14中等/1-7偏弱/0不现 |
| `sources` | string | 力量来源说明（一句话，说明天干/地支/长生/冲合刑害修正等关键因素） |

> **力量计算公式**：综合力量 = (天干基础力量 × 天干位置权重 + 地支基础力量 × 地支位置权重) × 十二长生系数 × 冲合刑害修正系数。详见 SKILL.md 6.4节。

---

### 3.6 analysis.shiShenCombination（核心十神组合）

```json
"shiShenCombination": {
  "name": "食神生财",
  "type": "吉组合",
  "priority": 5,
  "conditions": {
    "shiShen": { "name": "食神", "level": "极旺", "meetsRequirement": true },
    "caiXing": { "name": "偏财", "level": "中等", "meetsRequirement": true }
  },
  "coreMeaning": "以技艺才能生财，富命之基",
  "yongShenShiShen": "食神",
  "yongShenConflict": false,
  "geJuImpact": "+5分（组合中用神十神与综合用神一致）"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 核心组合名称（如：杀印相生/食神制杀/官印相生/伤官配印/食神生财/伤官生财/财官双美/财生杀旺/官杀混杂/伤官见官/比劫夺财/枭神夺食/财破印/无明显核心组合） |
| `type` | string | 组合类型：吉组合/凶组合/特殊组合/无 |
| `priority` | int | 组合优先级（吉组合1-8，凶组合1-5，特殊组合1-3） |
| `conditions` | object | 组合成立条件验证 |
| `coreMeaning` | string | 组合核心含义（一句话） |
| `yongShenShiShen` | string | 组合中的"用神十神"（起主导作用的十神） |
| `yongShenConflict` | bool | 用神十神是否与综合用神冲突 |
| `geJuImpact` | string | 对格局层次的影响（加分/减分/无影响） |

> 若无核心组合成立，`name` 填 `"无明显核心组合"`，`type` 填 `"无"`，其余字段填空值。

---

### 3.7 analysis.diZhiRelations（地支关系，8种类型全覆盖）

```json
"diZhiRelations": {
  "liuHe": { "exists": false, "pairs": [] },
  "sanHe": { "exists": false, "groups": [] },
  "banHe": { "exists": false, "pairs": [], "note": "" },
  "sanHui": { "exists": false, "groups": [] },
  "liuChong": { "exists": true, "pairs": [{"branches": "寅申", "strength": "强", "pillars": "年柱-月柱"}] },
  "xing": { "exists": false, "pairs": [] },
  "hai": { "exists": false, "pairs": [] },
  "po": { "exists": false, "pairs": [] },
  "summary": "寅申六冲（强），无其他地支关系"
}
```

**8种关系类型**：

| 字段 | 对应关系 | pairs/groups元素字段 |
|---|---|---|
| `liuHe` | 六合（6组） | `{"branches": "寅亥", "heHuaWuXing": "木", "pillars": "年柱-日柱"}` |
| `sanHe` | 三合局（4组） | `{"branches": "申子辰", "heHuaWuXing": "水", "zhongShen": "子", "pillars": "月柱-日柱-时柱"}` |
| `banHe` | 半合（8组，须含中神） | `{"branches": "申子", "heHuaWuXing": "水", "zhongShen": "子", "pillars": "月柱-日柱"}` + `note` 字段标注拱合 |
| `sanHui` | 三会局（4组） | `{"branches": "寅卯辰", "huiHuaWuXing": "木", "pillars": "年柱-日柱-时柱"}` |
| `liuChong` | 六冲（6组） | `{"branches": "寅申", "strength": "强/中", "pillars": "年柱-月柱"}` |
| `xing` | 相刑（4类） | `{"branches": "寅巳申", "type": "无恩之刑/恃势之刑/无礼之刑/自刑", "pillars": "..."}` |
| `hai` | 相害（6组） | `{"branches": "申亥", "type": "穿害/害", "pillars": "月柱-年柱"}` |
| `po` | 相破（6组） | `{"branches": "丑辰", "type": "破", "pillars": "月柱-日柱"}` |

> 每种类型必须标注 `exists`（是否存在）。`exists: false` 时 `pairs`/`groups` 为空数组。
>
> `summary` 为全部地支关系的一句话总结。

---

### 3.8 analysis.mingJuLevel（命局层次评分）

```json
"mingJuLevel": {
  "scores": [
    { "dimension": "格局成格度", "score": 20, "maxScore": 30, "reason": "偏印格成立，但月令申金被寅冲，格局有疵" },
    { "dimension": "用神有力程度", "score": 15, "maxScore": 25, "reason": "用神金水，金不透干且被冲，水有比肩帮身但力量有限" },
    { "dimension": "五行流通度", "score": 12, "maxScore": 20, "reason": "土克水有阻断，但有金通关，流通有阻" },
    { "dimension": "神煞吉凶配比", "score": 12, "maxScore": 15, "reason": "吉神9个含3个甲级，凶煞5个均为乙级丙级" },
    { "dimension": "地支关系和谐度", "score": 6, "maxScore": 10, "reason": "寅申强冲(-3)，无合局化解" }
  ],
  "totalScore": 65,
  "level": "中等",
  "levelRange": "55-69",
  "summary": "命局有冲有合，用神受损但有救应，属于先难后易型"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `scores` | array | 五维度评分，固定5个元素 |
| `scores[].dimension` | string | 维度名称 |
| `scores[].score` | int | 该维度得分 |
| `scores[].maxScore` | int | 该维度满分 |
| `scores[].reason` | string | 评分依据（一句话） |
| `totalScore` | int | 五维度总分（满分100） |
| `level` | string | 层次等级：上等/中上/中等/中下/下等 |
| `levelRange` | string | 等级分数区间 |
| `summary` | string | 命局层次一句话总结 |

**五维度评分标准**（详见 SKILL.md 6.7节）：

| 维度 | 满分 | 评分依据 |
|---|---|---|
| 格局成格度 | 30 | 格局用神清纯有力程度 |
| 用神有力程度 | 25 | 用神透干、根气、受损情况 |
| 五行流通度 | 20 | 五行相生链条完整程度 |
| 神煞吉凶配比 | 15 | 吉神凶煞数量及力量对比 |
| 地支关系和谐度 | 10 | 合局增强与冲刑破坏的平衡 |

**层次等级映射**：

| 总分 | 等级 |
|---|---|
| 85-100 | 上等 |
| 70-84 | 中上 |
| 55-69 | 中等 |
| 40-54 | 中下 |
| 0-39 | 下等 |

### 3.9 analysis.ganHe（天干五合关系）

> **强制规则**：四柱天干中相邻或遥隔的天干五合必须全部检查，不得遗漏。丁壬合是判断配偶星是否被合绊的关键依据。

```json
"ganHe": {
  "exists": true,
  "pairs": [
    {
      "ganZhi": "丁壬",
      "heHuaWuXing": "木",
      "pillars": "月干-时干",
      "strength": "中",
      "isAdjacent": true,
      "description": "时干丁火正财被月干壬水比肩合绊，配偶星有合，代表财星有争夺或配偶易被他人吸引"
    }
  ],
  "summary": "丁壬合化木（中），配偶星有合绊，财星有争夺之象"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `exists` | bool | 是否存在天干五合 |
| `pairs` | array | 合绊对列表 |
| `pairs[].ganZhi` | string | 合绊的干支对（如"丁壬"） |
| `pairs[].heHuaWuXing` | string | 合化后的五行 |
| `pairs[].pillars` | string | 涉及的柱位（如"月干-时干"） |
| `pairs[].strength` | string | 力量等级：强/中/弱 |
| `pairs[].isAdjacent` | bool | 是否相邻（相邻合力量强，遥隔合力量弱） |
| `pairs[].description` | string | 合绊对命局的影响说明（一句话） |
| `summary` | string | 天干五合总体影响总结 |

> **天干五合对照表**：甲己合土、乙庚合金、丙辛合水、丁壬合木、戊癸合火。合化成功条件：月令支持合化五行+地支有根。若月令不支持或地支无根，则"合而不化"，仅论合绊不论合化。

---

### 3.10 analysis.wuXingFlow（五行流通路径）

> **强制规则**：五行流通路径必须从日主出发，按相生顺序追踪，最终归宿由命局五行力量决定。不同模型必须按同一规则确定路径和归宿。

```json
"wuXingFlow": {
  "path": "土（七杀）→ 金（偏印）→ 水（日主）→ 木（食神）→ 火（正财）",
  "flowDirection": "顺生",
  "finalDestination": "火（正财）",
  "finalDestinationWuXing": "火",
  "blockPoint": "土克水（无金通关时阻断）",
  "tongGuan": "金（印星）通关：土生金、金生水",
  "smoothness": "有阻但可通",
  "smoothnessScore": 12,
  "description": "日主壬水受土克，需金通关化土生水。金为通关五行，大运流年遇金则流通顺畅，富贵立显。最终归宿为火（正财），代表财富落地。"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `path` | string | 完整五行流通路径（用箭头连接） |
| `flowDirection` | string | 流通方向：顺生/逆生/混乱 |
| `finalDestination` | string | 五行流通的最终归宿（五行+对应十神） |
| `finalDestinationWuXing` | string | 最终归宿五行 |
| `blockPoint` | string | 流通阻断点说明 |
| `tongGuan` | string | 通关五行（化解阻断的五行） |
| `smoothness` | string | 流畅度：顺畅/有阻但可通/不畅/断裂 |
| `smoothnessScore` | int | 流畅度评分（0-20，与命局层次评分维度三一致） |
| `description` | string | 流通路径的一句话总结 |

> **路径确定规则**：从日主五行出发，按五行相生链（金→水→木→火→土→金）追踪。每步追踪：找到被生五行在命局中是否存在（分值≥1即存在），存在则继续，不存在则终止。终止时的五行即为"最终归宿"。若存在多个分支，取分值最高的分支。

---

### 3.11 analysis.naYinAssessment（纳音格局评估）

> **强制规则**：四柱纳音必须按固定模板分析，不得自由发挥。纳音生克方向必须统一。

```json
"naYinAssessment": {
  "pattern": "三水一金",
  "patternQuality": "极佳",
  "elements": [
    {"pillar": "年柱", "naYin": "大溪水", "wuXing": "水", "meaning": "源远流长，智慧灵动"},
    {"pillar": "月柱", "naYin": "剑锋金", "wuXing": "金", "meaning": "锐利刚强，锋芒毕露"},
    {"pillar": "日柱", "naYin": "长流水", "wuXing": "水", "meaning": "持续不断，生生不息"},
    {"pillar": "时柱", "naYin": "天河水", "wuXing": "水", "meaning": "高远广阔，润泽万物"}
  ],
  "shengKeRelations": [
    {"from": "月柱", "to": "年柱", "relation": "金生水", "meaning": "月柱环境生助年柱根基，个人努力反哺家族"},
    {"from": "年柱", "to": "日柱", "relation": "水水比和", "meaning": "年柱与日柱同气，内心与家族根基相连"},
    {"from": "日柱", "to": "时柱", "relation": "水水比和", "meaning": "日时纳音相同，晚年与当下心境和谐"}
  ],
  "overallAssessment": "三水一金，金生水，纳音格局极佳。全局水气浓厚，极大补充了身弱的日主，是命局中隐性的巨大优势。",
  "impactOnDayMaster": "补水助身，对身弱日主有显著补益作用"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `pattern` | string | 纳音格局模式（如"三水一金"） |
| `patternQuality` | string | 格局质量：极佳/良好/一般/不佳 |
| `elements` | array | 四柱纳音元素（固定4个） |
| `shengKeRelations` | array | 纳音生克关系（固定3组：年→月、年→日、日→时） |
| `overallAssessment` | string | 纳音格局总体评价 |
| `impactOnDayMaster` | string | 对日主的影响 |

> **生克方向规则**：纳音生克以年柱为基准，依次分析年→月、年→日、日→时的关系。生克方向统一为"前柱对后柱"。

---

### 3.12 analysis.daYunEvaluations（大运预计算评估）

> **强制规则**：每步大运必须按三维度（五行与用神关系、地支互动、天干互动）预计算吉凶，不得由模型自行判断。

```json
"daYunEvaluations": [
  {
    "ganZhi": "癸酉",
    "startAge": 8, "endAge": 17,
    "level": "偏吉",
    "score": 65,
    "dimensions": {
      "wuXingRelation": 28,
      "diZhiInteraction": 22,
      "ganInteraction": 15
    },
    "summary": "金水用神大运，劫财+正印帮扶日主，早年学业顺利，根基稳固",
    "keyYears": [],
    "advice": "打好基础，培养学习习惯"
  },
  {
    "ganZhi": "丁丑",
    "startAge": 48, "endAge": 57,
    "isCurrent": true,
    "level": "偏吉",
    "score": 62,
    "dimensions": {
      "wuXingRelation": 22,
      "diZhiInteraction": 25,
      "ganInteraction": 15
    },
    "summary": "当前大运。丑为金库，助旺用神申金，正财透干但被合绊，财运有波动但整体向好",
    "keyYears": [2026, 2028, 2029],
    "advice": "把握金水旺的年份推进事业，火土旺的年份谨慎投资"
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ganZhi` | string | 大运干支 |
| `startAge`/`endAge` | int | 起止年龄 |
| `isCurrent` | bool | 是否为当前大运 |
| `level` | string | 吉凶等级：大吉/偏吉/平运/偏凶/大凶 |
| `score` | int | 综合评分（0-100） |
| `dimensions` | object | 三维度各自得分 |
| `summary` | string | 大运一句话总结 |
| `keyYears` | int[] | 大运内的关键年份 |
| `advice` | string | 行动建议 |

> **评分规则**：按综合判定规则第八章执行。必须对所有10步大运分别评分。

---

### 3.13 analysis.shenShaClassification（神煞分类与等级）

> **强制规则**：神煞必须按统一标准分为吉神和凶煞，并为每个神煞指定等级。不得由模型自行判断等级。

```json
"shenShaClassification": {
  "jiShen": [
    {"name": "天乙贵人", "location": "时柱", "level": "甲级", "score": 3, "description": "最强贵人星，逢凶化吉"},
    {"name": "月德贵人", "location": "月柱", "level": "甲级", "score": 3, "description": "慈祥和悦，化解是非"},
    {"name": "太极贵人", "location": "月柱", "level": "甲级", "score": 3, "description": "哲学玄学天赋"},
    {"name": "文昌贵人", "location": "年柱", "level": "乙级", "score": 2, "description": "利学业考试文章"},
    {"name": "福星贵人", "location": "月柱", "level": "乙级", "score": 2, "description": "福气深厚，平安顺遂"},
    {"name": "天喜", "location": "时柱", "level": "乙级", "score": 2, "description": "婚庆喜事，人缘好"},
    {"name": "天医", "location": "时柱", "level": "乙级", "score": 2, "description": "医学天赋，健康意识强"},
    {"name": "国印贵人", "location": "时柱", "level": "乙级", "score": 2, "description": "掌权印，管理才能"},
    {"name": "德秀贵人", "location": "时柱", "level": "乙级", "score": 2, "description": "才华出众，品德高尚"}
  ],
  "xiongSha": [
    {"name": "魁罡", "location": "日柱", "level": "乙级", "score": -2, "description": "性烈聪明，不服输"},
    {"name": "丧门", "location": "日柱", "level": "丙级", "score": -1, "description": "主孝服哀事"},
    {"name": "金刚", "location": "日柱", "level": "丙级", "score": -1, "description": "性格刚硬，易冲突"},
    {"name": "勾煞", "location": "时柱", "level": "丙级", "score": -1, "description": "主勾连牵连"},
    {"name": "空亡", "location": "时柱", "level": "丙级", "score": -1, "description": "时柱空亡，晚年或子女有虚空之象"}
  ],
  "jiXiongRatio": {"ji": 9, "xiong": 5, "ratio": "6:4"},
  "summary": "吉神9个（甲级3个+乙级6个），凶煞5个（乙级1个+丙级4个），吉大于凶"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `jiShen` | array | 吉神列表，每个含名称/位置/等级/分值/描述 |
| `xiongSha` | array | 凶煞列表，每个含名称/位置/等级/分值/描述 |
| `jiXiongRatio` | object | 吉凶数量对比 |
| `summary` | string | 神煞总体评价 |

**神煞等级标准**（必须严格按此执行，不得自行调整）：

| 等级 | 吉神 | 凶煞 |
|---|---|---|
| **甲级** | 天乙贵人、月德贵人、天德贵人、太极贵人 | 羊刃、劫煞、灾煞 |
| **乙级** | 文昌贵人、福星贵人、国印贵人、天喜、天医、德秀贵人、驿马、学堂 | 魁罡、空亡、勾煞、元辰、孤辰、寡宿 |
| **丙级** | 将星、华盖、金舆、禄神、红鸾、天厨 | 丧门、金刚、吊客、披麻、天罗、地网、白虎、天狗 |

> **注意**：驿马在吉神表中属乙级（主走动机遇），不列入凶煞。华盖/将星若命局中出现，按丙级吉神计入。魁罡在日柱时力量最强，定为乙级；在其他柱位时降为丙级。

---

### 3.14 analysis.liuNianAssessments（关键流年预计算评估）

> **强制规则**：当前大运内的关键流年必须预计算吉凶，不得由模型自行判断。

```json
"liuNianAssessments": [
  {
    "year": 2026, "ganZhi": "丙午",
    "level": "偏凶",
    "score": 35,
    "summary": "丙午火旺，财星破印，仇神冲克用神金，高风险年份",
    "riskLevel": "高",
    "riskReason": "火土忌神齐来，财星破印，七杀攻身",
    "opportunities": [],
    "advice": "谨慎投资，防范破财和健康问题"
  },
  {
    "year": 2028, "ganZhi": "戊申",
    "level": "偏吉",
    "score": 68,
    "summary": "申金用神到位，事业有贵人相助，但戊土七杀透干有压力",
    "riskLevel": "中",
    "riskReason": "流年地支申与原局寅申冲加剧，需注意变动",
    "opportunities": ["事业突破", "贵人相助"],
    "advice": "把握贵人机遇，但同时注意变动风险，不宜冒进"
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `year` | int | 年份 |
| `ganZhi` | string | 流年干支 |
| `level` | string | 吉凶等级：大吉/偏吉/平运/偏凶/大凶 |
| `score` | int | 综合评分（0-100） |
| `summary` | string | 流年一句话总结 |
| `riskLevel` | string | 风险等级：高/中/低 |
| `riskReason` | string | 风险原因 |
| `opportunities` | string[] | 机遇列表 |
| `advice` | string | 行动建议 |

> **评分规则**：按综合判定规则第八章流年判定规则执行。至少覆盖当前大运内的所有年份。

---

## 四、完整JSON示例

以下为陈纪东命盘的完整排盘JSON示例（含analysis预计算字段）：

```json
{
  "chartType": "八字",
  "basicInfo": {
    "name": "陈纪东",
    "gender": "男",
    "genderLabel": "乾造",
    "solarDate": "1974年08月19日 13:30",
    "lunarDate": "甲寅年七月初二日 未时",
    "trueSolarTime": "1974-08-19 13:52",
    "birthplace": "吉林省 吉林市 昌邑区"
  },
  "fourPillars": [
    {
      "label": "年柱", "gan": "甲", "zhi": "寅",
      "naYin": "大溪水", "wuXing": "木", "zhuXing": "食神",
      "fuXing": ["食神", "偏财", "七杀"],
      "zangGan": ["甲", "丙", "戊"],
      "xingYun": "病", "zizuo": "长生",
      "kongWang": ["子", "丑"],
      "shishen": ["食神", "食神", "偏财", "七杀"]
    },
    {
      "label": "月柱", "gan": "壬", "zhi": "申",
      "naYin": "剑锋金", "wuXing": "水", "zhuXing": "比肩",
      "fuXing": ["偏印", "比肩", "七杀"],
      "zangGan": ["庚", "壬", "戊"],
      "xingYun": "长生", "zizuo": "长生",
      "kongWang": ["戌", "亥"],
      "shishen": ["比肩", "偏印", "比肩", "七杀"]
    },
    {
      "label": "日柱", "gan": "壬", "zhi": "辰",
      "naYin": "长流水", "wuXing": "水", "zhuXing": "日主",
      "fuXing": ["七杀", "伤官", "劫财"],
      "zangGan": ["戊", "乙", "癸"],
      "xingYun": "墓", "zizuo": "墓",
      "kongWang": ["午", "未"],
      "shishen": ["日主", "七杀", "伤官", "劫财"]
    },
    {
      "label": "时柱", "gan": "丁", "zhi": "未",
      "naYin": "天河水", "wuXing": "火", "zhuXing": "正财",
      "fuXing": ["正官", "正财", "伤官"],
      "zangGan": ["己", "丁", "乙"],
      "xingYun": "养", "zizuo": "冠带",
      "kongWang": ["寅", "卯"],
      "shishen": ["正财", "正官", "正财", "伤官"]
    }
  ],
  "dayMaster": {
    "gan": "壬", "wuXing": "水", "yinYang": "阳",
    "strength": { "level": "身弱", "score": 46, "detail": "日主偏弱，失令少助" }
  },
  "pattern": "偏印格",
  "monthOrder": "申（金行）",
  "wuXingDistribution": { "金": 2, "木": 5, "水": 4, "火": 3, "土": 6 },
  "shenSha": {
    "年柱": ["文昌贵人"],
    "月柱": ["太极贵人", "福星贵人", "驿马", "月德贵人"],
    "日柱": ["丧门", "金刚", "魁罡"],
    "时柱": ["天乙贵人", "国印贵人", "勾煞", "天喜", "天医", "德秀贵人", "空亡"]
  },
  "mingGong": "丙寅",
  "shenGong": "戊辰",
  "taiYuan": "癸亥",
  "qiYun": { "years": 6, "months": 7, "days": 10, "startAge": 7, "totalDays": 19 },
  "daYun": [
    { "startAge": 8, "endAge": 17, "startYear": 1981, "endYear": 1990, "ganZhi": "癸酉", "zhuXing": "劫财", "fuXing": ["正印"], "wuXing": "水", "isCurrent": false },
    { "startAge": 18, "endAge": 27, "startYear": 1991, "endYear": 2000, "ganZhi": "甲戌", "zhuXing": "食神", "fuXing": ["七杀", "正印", "正财"], "wuXing": "木", "isCurrent": false },
    { "startAge": 28, "endAge": 37, "startYear": 2001, "endYear": 2010, "ganZhi": "乙亥", "zhuXing": "伤官", "fuXing": ["比肩", "食神"], "wuXing": "木", "isCurrent": false },
    { "startAge": 38, "endAge": 47, "startYear": 2011, "endYear": 2020, "ganZhi": "丙子", "zhuXing": "偏财", "fuXing": ["劫财"], "wuXing": "火", "isCurrent": false },
    { "startAge": 48, "endAge": 57, "startYear": 2021, "endYear": 2030, "ganZhi": "丁丑", "zhuXing": "正财", "fuXing": ["正官", "正印", "劫财"], "wuXing": "火", "isCurrent": true },
    { "startAge": 58, "endAge": 67, "startYear": 2031, "endYear": 2040, "ganZhi": "戊寅", "zhuXing": "七杀", "fuXing": ["食神", "偏财", "七杀"], "wuXing": "土", "isCurrent": false },
    { "startAge": 68, "endAge": 77, "startYear": 2041, "endYear": 2050, "ganZhi": "己卯", "zhuXing": "正官", "fuXing": ["伤官"], "wuXing": "土", "isCurrent": false },
    { "startAge": 78, "endAge": 87, "startYear": 2051, "endYear": 2060, "ganZhi": "庚辰", "zhuXing": "偏印", "fuXing": ["七杀", "伤官", "劫财"], "wuXing": "金", "isCurrent": false },
    { "startAge": 88, "endAge": 97, "startYear": 2061, "endYear": 2070, "ganZhi": "辛巳", "zhuXing": "正印", "fuXing": ["偏财", "偏印", "七杀"], "wuXing": "金", "isCurrent": false },
    { "startAge": 98, "endAge": 107, "startYear": 2071, "endYear": 2080, "ganZhi": "壬午", "zhuXing": "比肩", "fuXing": ["正财", "正官"], "wuXing": "水", "isCurrent": false }
  ],
  "currentDaYun": {
    "startAge": 48, "endAge": 57,
    "startYear": 2021, "endYear": 2030,
    "ganZhi": "丁丑", "zhuXing": "正财",
    "fuXing": ["正官", "正印", "劫财"], "wuXing": "火"
  },
  "currentLiuNian": {
    "year": 2026, "ganZhi": "丙午",
    "zhuXing": "偏财", "fuXing": ["正财", "正官"], "wuXing": "火"
  },
  "liuYueList": null,
  "analysis": {
    "dayMasterStrength": {
      "gan": "壬", "wuXing": "水",
      "level": "身弱", "score": 35,
      "deLing": false, "deDi": true, "deShi": false,
      "detail": "申月庚金生水得令28分，但木5重泄+土6重克，日主实际受力弱",
      "fuYiDirection": "生扶（印星/比劫）"
    },
    "geJuInfo": {
      "name": "偏印格",
      "chengBaiDu": "半成",
      "yongShen": "金（印星）",
      "xiangShen": "无",
      "chongKe": "月令申金被年支寅冲",
      "heHua": "无",
      "level": "有疵但成立"
    },
    "tiaoHou": {
      "hanNuan": { "level": "偏凉", "score": -1 },
      "zaoShi": { "level": "偏燥", "score": 2 },
      "tiaoHouNeed": true,
      "tiaoHouYongShen": "金",
      "tiaoHouReason": "申月金旺当令，土分6≥5偏燥，金通关化土生水，既润燥又生水",
      "urgency": "中度"
    },
    "yongShen": {
      "tiaoHouYongShen": "金",
      "fuYiYongShen": ["金", "水"],
      "geJuYongShen": "金",
      "zongHeYongShen": ["金", "水"],
      "priorityOrder": ["金", "水"],
      "priorityReason": "金生水，金为源头、水为归宿。印星(金)是比劫(水)的源头，以印星为第一用神",
      "zongHeReason": "调候=金，扶抑=金水，格局=金，三者一致",
      "xiShen": ["金", "水"],
      "jiShen": ["火", "土", "木"],
      "chouShen": ["木", "火"],
      "xianShen": [],
      "derivation": {
        "yongShen": "金、水（综合判定）",
        "xiShen": "土生金（喜），金生水（喜）",
        "jiShen": "火克金、土克水、木泄水",
        "chouShen": "木生火（仇），火生土（仇）"
      }
    },
    "shiShenPower": [
      { "rank": 1, "name": "食神", "wuXing": "木", "power": 25, "level": "极旺", "sources": "天干透出+地支本气根，十二长生临官" },
      { "rank": 2, "name": "偏印", "wuXing": "金", "power": 18, "level": "偏旺", "sources": "地支本气根，月令当令" },
      { "rank": 3, "name": "七杀", "wuXing": "土", "power": 15, "level": "偏旺", "sources": "地支藏干，受冲减损" },
      { "rank": 4, "name": "比肩", "wuXing": "水", "power": 12, "level": "中等", "sources": "天干透出，月令长生" },
      { "rank": 5, "name": "偏财", "wuXing": "火", "power": 10, "level": "中等", "sources": "地支中气藏干" },
      { "rank": 6, "name": "正财", "wuXing": "火", "power": 8, "level": "中等", "sources": "地支中气藏干" },
      { "rank": 7, "name": "正官", "wuXing": "土", "power": 5, "level": "偏弱", "sources": "地支本气根" },
      { "rank": 8, "name": "伤官", "wuXing": "木", "power": 3, "level": "偏弱", "sources": "地支余气藏干" },
      { "rank": 9, "name": "正印", "wuXing": "金", "power": 0, "level": "不现", "sources": "命局不现" },
      { "rank": 10, "name": "劫财", "wuXing": "水", "power": 0, "level": "不现", "sources": "命局不现" }
    ],
    "shiShenCombination": {
      "name": "食神生财",
      "type": "吉组合",
      "priority": 5,
      "conditions": {
        "shiShen": { "name": "食神", "level": "极旺", "meetsRequirement": true },
        "caiXing": { "name": "偏财", "level": "中等", "meetsRequirement": true }
      },
      "coreMeaning": "以技艺才能生财，富命之基",
      "yongShenShiShen": "食神",
      "yongShenConflict": false,
      "geJuImpact": "+5分（组合中用神十神与综合用神一致）"
    },
    "diZhiRelations": {
      "liuHe": { "exists": false, "pairs": [] },
      "sanHe": { "exists": false, "groups": [] },
      "banHe": { "exists": false, "pairs": [], "note": "" },
      "sanHui": { "exists": false, "groups": [] },
      "liuChong": { "exists": true, "pairs": [{"branches": "寅申", "strength": "强", "pillars": "年柱-月柱"}] },
      "xing": { "exists": false, "pairs": [] },
      "hai": { "exists": false, "pairs": [] },
      "po": { "exists": false, "pairs": [] },
      "summary": "寅申六冲（强），无其他地支关系"
    },
    "mingJuLevel": {
      "scores": [
        { "dimension": "格局成格度", "score": 20, "maxScore": 30, "reason": "偏印格成立，但月令申金被寅冲，格局有疵" },
        { "dimension": "用神有力程度", "score": 15, "maxScore": 25, "reason": "用神金水，金不透干且被冲，水有比肩帮身但力量有限" },
        { "dimension": "五行流通度", "score": 12, "maxScore": 20, "reason": "土克水有阻断，但有金通关，流通有阻" },
        { "dimension": "神煞吉凶配比", "score": 12, "maxScore": 15, "reason": "吉神9个含3个甲级，凶煞5个均为乙级丙级" },
        { "dimension": "地支关系和谐度", "score": 6, "maxScore": 10, "reason": "寅申强冲(-3)，无合局化解" }
      ],
      "totalScore": 65,
      "level": "中等",
      "levelRange": "55-69",
      "summary": "命局有冲有合，用神受损但有救应，属于先难后易型"
    },
    "ganHe": {
      "exists": true,
      "pairs": [
        {
          "ganZhi": "丁壬",
          "heHuaWuXing": "木",
          "pillars": "月干-时干",
          "strength": "中",
          "isAdjacent": true,
          "description": "时干丁火正财被月干壬水比肩合绊，配偶星有合，代表财星有争夺或配偶易被他人吸引"
        }
      ],
      "summary": "丁壬合化木（中），配偶星有合绊，财星有争夺之象"
    },
    "wuXingFlow": {
      "path": "土（七杀）→ 金（偏印）→ 水（日主）→ 木（食神）→ 火（正财）",
      "flowDirection": "顺生",
      "finalDestination": "火（正财）",
      "finalDestinationWuXing": "火",
      "blockPoint": "土克水（无金通关时阻断）",
      "tongGuan": "金（印星）通关：土生金、金生水",
      "smoothness": "有阻但可通",
      "smoothnessScore": 12,
      "description": "日主壬水受土克，需金通关化土生水。金为通关五行，大运流年遇金则流通顺畅，富贵立显。最终归宿为火（正财），代表财富落地。"
    },
    "naYinAssessment": {
      "pattern": "三水一金",
      "patternQuality": "极佳",
      "elements": [
        {"pillar": "年柱", "naYin": "大溪水", "wuXing": "水", "meaning": "源远流长，智慧灵动"},
        {"pillar": "月柱", "naYin": "剑锋金", "wuXing": "金", "meaning": "锐利刚强，锋芒毕露"},
        {"pillar": "日柱", "naYin": "长流水", "wuXing": "水", "meaning": "持续不断，生生不息"},
        {"pillar": "时柱", "naYin": "天河水", "wuXing": "水", "meaning": "高远广阔，润泽万物"}
      ],
      "shengKeRelations": [
        {"from": "月柱", "to": "年柱", "relation": "金生水", "meaning": "月柱环境生助年柱根基，个人努力反哺家族"},
        {"from": "年柱", "to": "日柱", "relation": "水水比和", "meaning": "年柱与日柱同气，内心与家族根基相连"},
        {"from": "日柱", "to": "时柱", "relation": "水水比和", "meaning": "日时纳音相同，晚年与当下心境和谐"}
      ],
      "overallAssessment": "三水一金，金生水，纳音格局极佳。全局水气浓厚，极大补充了身弱的日主，是命局中隐性的巨大优势。",
      "impactOnDayMaster": "补水助身，对身弱日主有显著补益作用"
    },
    "daYunEvaluations": [
      {
        "ganZhi": "癸酉", "startAge": 8, "endAge": 17,
        "level": "偏吉", "score": 65,
        "dimensions": {"wuXingRelation": 28, "diZhiInteraction": 22, "ganInteraction": 15},
        "summary": "金水用神大运，劫财+正印帮扶日主，早年学业顺利，根基稳固",
        "keyYears": [], "advice": "打好基础，培养学习习惯"
      },
      {
        "ganZhi": "丁丑", "startAge": 48, "endAge": 57,
        "isCurrent": true, "level": "偏吉", "score": 62,
        "dimensions": {"wuXingRelation": 22, "diZhiInteraction": 25, "ganInteraction": 15},
        "summary": "当前大运。丑为金库，助旺用神申金，正财透干但被合绊，财运有波动但整体向好",
        "keyYears": [2026, 2028, 2029],
        "advice": "把握金水旺的年份推进事业，火土旺的年份谨慎投资"
      }
    ],
    "shenShaClassification": {
      "jiShen": [
        {"name": "天乙贵人", "location": "时柱", "level": "甲级", "score": 3, "description": "最强贵人星，逢凶化吉"},
        {"name": "月德贵人", "location": "月柱", "level": "甲级", "score": 3, "description": "慈祥和悦，化解是非"},
        {"name": "太极贵人", "location": "月柱", "level": "甲级", "score": 3, "description": "哲学玄学天赋"},
        {"name": "文昌贵人", "location": "年柱", "level": "乙级", "score": 2, "description": "利学业考试文章"},
        {"name": "福星贵人", "location": "月柱", "level": "乙级", "score": 2, "description": "福气深厚，平安顺遂"},
        {"name": "天喜", "location": "时柱", "level": "乙级", "score": 2, "description": "婚庆喜事，人缘好"},
        {"name": "天医", "location": "时柱", "level": "乙级", "score": 2, "description": "医学天赋，健康意识强"},
        {"name": "国印贵人", "location": "时柱", "level": "乙级", "score": 2, "description": "掌权印，管理才能"},
        {"name": "德秀贵人", "location": "时柱", "level": "乙级", "score": 2, "description": "才华出众，品德高尚"}
      ],
      "xiongSha": [
        {"name": "魁罡", "location": "日柱", "level": "乙级", "score": -2, "description": "性烈聪明，不服输"},
        {"name": "丧门", "location": "日柱", "level": "丙级", "score": -1, "description": "主孝服哀事"},
        {"name": "金刚", "location": "日柱", "level": "丙级", "score": -1, "description": "性格刚硬，易冲突"},
        {"name": "勾煞", "location": "时柱", "level": "丙级", "score": -1, "description": "主勾连牵连"},
        {"name": "空亡", "location": "时柱", "level": "丙级", "score": -1, "description": "时柱空亡，晚年或子女有虚空之象"}
      ],
      "jiXiongRatio": {"ji": 9, "xiong": 5, "ratio": "6:4"},
      "summary": "吉神9个（甲级3个+乙级6个），凶煞5个（乙级1个+丙级4个），吉大于凶"
    },
    "liuNianAssessments": [
      {
        "year": 2026, "ganZhi": "丙午",
        "level": "偏凶", "score": 35,
        "summary": "丙午火旺，财星破印，仇神冲克用神金，高风险年份",
        "riskLevel": "高",
        "riskReason": "火土忌神齐来，财星破印，七杀攻身",
        "opportunities": [],
        "advice": "谨慎投资，防范破财和健康问题"
      },
      {
        "year": 2028, "ganZhi": "戊申",
        "level": "偏吉", "score": 68,
        "summary": "申金用神到位，事业有贵人相助，但戊土七杀透干有压力",
        "riskLevel": "中",
        "riskReason": "流年地支申与原局寅申冲加剧，需注意变动",
        "opportunities": ["事业突破", "贵人相助"],
        "advice": "把握贵人机遇，但同时注意变动风险，不宜冒进"
      }
    ]
  }
}
```

---

## 五、字段变更记录

相比原有排盘JSON结构，本次规范新增/调整以下字段：

| 变更类型 | 字段路径 | 说明 |
|---|---|---|
| **新增** | `basicInfo.lunarDate` | 农历出生时间 |
| **新增** | `daYun[].wuXing` | 大运天干五行 |
| **新增** | `daYun[].isCurrent` | 标记当前大运 |
| **新增** | `currentDaYun` | 当前大运完整信息 |
| **新增** | `currentLiuNian` | 当前流年完整信息（从 `null` 升级为对象） |
| **新增** | `liuYueList` | 流月列表 |
| **新增** | `analysis` | 预计算分析结果对象（含14个子字段） |
| **新增** | `analysis.dayMasterStrength` | 日主旺衰详情（含得令/得地/得势/扶抑方向） |
| **新增** | `analysis.geJuInfo` | 格局信息（含成败度/相神/冲克/合化） |
| **新增** | `analysis.tiaoHou` | 调候用神及寒暖燥湿 |
| **新增** | `analysis.yongShen` | 综合用神及喜忌系统（含 `priorityOrder` 用神优先级排序） |
| **新增** | `analysis.shiShenPower` | 十神力量排序（全10个十神，含数值） |
| **新增** | `analysis.shiShenCombination` | 核心十神组合 |
| **新增** | `analysis.diZhiRelations` | 地支关系（8种类型结构化，替代旧版字符串数组） |
| **新增** | `analysis.mingJuLevel` | 命局层次评分（五维度） |
| **新增** | `analysis.ganHe` | 天干五合关系（含合化/合绊判定、对配偶星影响） |
| **新增** | `analysis.wuXingFlow` | 五行流通路径（含归宿五行、通关五行、流畅度评分） |
| **新增** | `analysis.naYinAssessment` | 纳音格局评估（含生克方向、总体评价） |
| **新增** | `analysis.daYunEvaluations` | 大运预计算评估（每步大运三维度评分） |
| **新增** | `analysis.shenShaClassification` | 神煞分类与等级（吉神/凶煞标准化分级） |
| **新增** | `analysis.liuNianAssessments` | 关键流年预计算评估（含风险等级、机遇列表） |
| **废弃** | 旧版 `diZhiRelations`（字符串数组） | 被 `analysis.diZhiRelations` 结构化对象替代 |

---

## 六、字段必填说明

| 层级 | 字段 | 必填条件 |
|---|---|---|
| **必填** | `chartType`, `basicInfo`, `fourPillars`, `dayMaster`, `pattern`, `monthOrder`, `wuXingDistribution`, `shenSha`, `mingGong`, `shenGong`, `taiYuan`, `qiYun`, `daYun` | 基础排盘数据，必须提供 |
| **条件必填** | `currentDaYun` | 命主已到起运年龄时必填 |
| **条件必填** | `currentLiuNian` | 排盘时有指定流年时必填，否则为 `null` |
| **可选** | `liuYueList` | 用户选中流月分析时提供 |
| **强烈建议** | `analysis` 及其全部子字段 | 确保不同模型输出一致性的核心。缺失时模型将按SKILL.md嵌入规则自行计算，可能导致不同模型结论分歧 |

# 排盘JSON结构规范

> 本文档定义紫微斗数排盘系统输出的完整JSON结构。排盘系统必须按此规范输出，技能模型按此规范读取。
>
> **格式要求**：排盘信息必须以JSON格式输出，不得使用Markdown或其他格式。JSON的嵌套结构能精确表达宫位、星曜、四化的层级关系，且技能中所有字段引用路径均按JSON路径设计。
>
> **与八字规范的关系**：本规范沿用八字技能 `排盘JSON结构规范.md` 的整体范式（顶层字段 + `analysis` 预计算字段 + 完整示例 + 字段必填说明），字段内容按紫微斗数体系重新定义。

---

## 一、JSON结构总览

```json
{
  "chartType": "紫微斗数",
  "basicInfo": { },
  "mingGong": { },
  "shenGong": { },
  "wuXingJu": "",
  "suiXian": { },
  "palaces": [ ],
  "shenGongPosition": "",
  "nianGan": "",
  "nianZhi": "",
  "nianSiHua": { },
  "laiYinGong": "",
  "daXianList": [ ],
  "currentDaXian": { },
  "currentLiuNian": { },
  "liuYueList": [ ],
  "analysis": { }
}
```

---

## 二、字段详细定义

### 2.1 chartType（排盘类型）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `chartType` | string | 是 | 固定值 `"紫微斗数"` |

---

### 2.2 basicInfo（基础信息）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `name` | string | 是 | 命主姓名 | `"林子涵"` |
| `gender` | string | 是 | 性别 | `"男"` / `"女"` |
| `genderLabel` | string | 是 | 性别标签 | `"乾造"`（男）/ `"坤造"`（女） |
| `solarDate` | string | 是 | 公历出生时间 | `"1984年10月15日 14:30"` |
| `lunarDate` | string | 是 | 农历出生时间 | `"甲子年八月二十一日 未时"` |
| `trueSolarTime` | string | 是 | 真太阳时校正后时间 | `"1984-10-15 14:42"` |
| `birthplace` | string | 是 | 出生地点 | `"浙江省 杭州市 西湖区"` |

**示例**：
```json
"basicInfo": {
  "name": "林子涵",
  "gender": "女",
  "genderLabel": "坤造",
  "solarDate": "1984年10月15日 14:30",
  "lunarDate": "甲子年八月二十一日 未时",
  "trueSolarTime": "1984-10-15 14:42",
  "birthplace": "浙江省 杭州市 西湖区"
}
```

---

### 2.3 mingGong（命宫）

命宫为整盘太极点，决定人格基调与人生大方向。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `position` | string | 是 | 命宫地支宫位（子/丑/寅/卯/辰/巳/午/未/申/酉/戌/亥） | `"午"` |
| `stemBranch` | string | 是 | 命宫天干地支（宫干+地支） | `"庚午"` |

**示例**：
```json
"mingGong": {
  "position": "午",
  "stemBranch": "庚午"
}
```

> 命宫主星、辅煞星、四化等完整信息在 `palaces` 数组中命宫对象内提供。

---

### 2.4 shenGong（身宫）

身宫代表后天行为模式与人生重心，落于十二宫之一。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `position` | string | 是 | 身宫地支宫位 | `"辰"` |
| `stemBranch` | string | 是 | 身宫天干地支 | `"戊辰"` |

**示例**：
```json
"shenGong": {
  "position": "辰",
  "stemBranch": "戊辰"
}
```

---

### 2.5 wuXingJu（五行局）

由命宫宫干+地支查纳音得出，决定大限起运岁数与紫微星定位。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `wuXingJu` | string | 是 | 五行局：水二局/木三局/金四局/土五局/火六局 | `"土五局"` |

> 五行局与起运岁对应：水二局2岁起、木三局3岁起、金四局4岁起、土五局5岁起、火六局6岁起。

---

### 2.6 suiXian（岁限方向）

大限行运方向与起运年龄。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `direction` | string | 是 | 大限行运方向：`"顺行"` / `"逆行"`（阳男阴女顺、阴男阳女逆） | `"逆行"` |
| `startAge` | int | 是 | 起运年龄（等于五行局数） | `5` |

**示例**：
```json
"suiXian": {
  "direction": "逆行",
  "startAge": 5
}
```

---

### 2.7 palaces（十二宫）

数组，固定12个元素，从命宫起按逆时针顺序排列：命宫→兄弟宫→夫妻宫→子女宫→财帛宫→疾厄宫→迁移宫→交友宫→官禄宫→田宅宫→福德宫→父母宫。

**每个宫位对象字段**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `palaceName` | string | 是 | 宫名 | `"命宫"` / `"夫妻宫"` |
| `position` | string | 是 | 地支宫位 | `"午"` |
| `heavenlyStem` | string | 是 | 宫位天干（宫干） | `"庚"` |
| `mainStars` | string[] | 是 | 主星列表（十四主星，空宫填空数组并借对宫星） | `["紫微"]` |
| `auxiliaryStars` | string[] | 是 | 辅星（六吉星：左辅/右弼/文昌/文曲/天魁/天钺/禄存/天马等） | `["禄存", "天马"]` |
| `evilStars` | string[] | 是 | 煞星（擎羊/陀罗/火星/铃星/地空/地劫等） | `["地劫"]` |
| `miscellaneousStars` | string[] | 是 | 杂曜（红鸾/天喜/华盖/孤辰/寡宿/天哭/天虚等） | `["红鸾"]` |
| `siHua` | array | 是 | 该宫落点的四化列表，元素 `{type, star}` | `[{"type":"化禄","star":"廉贞"}]` |
| `miaoWang` | array | 是 | 主星庙旺利陷，元素 `{star, state}` | `[{"star":"紫微","state":"庙"}]` |
| `sanFangSiZheng` | object | 是 | 三方四正构成 | 见下 |

**siHua 元素字段**：

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `type` | string | 四化类型：化禄/化权/化科/化忌 | `"化禄"` |
| `star` | string | 被引动的主星名 | `"廉贞"` |

**miaoWang 元素字段**：

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `star` | string | 主星名 | `"紫微"` |
| `state` | string | 庙旺利陷：庙/旺/利/平/陷 | `"庙"` |

**sanFangSiZheng 对象字段**：

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `sanFang` | string[] | 三方宫名（与本宫相隔120°的两个宫） | `["财帛宫", "官禄宫"]` |
| `duiGong` | string | 对宫宫名 | `"迁移宫"` |

**示例**（仅展示命宫、财帛宫2个对象）：
```json
"palaces": [
  {
    "palaceName": "命宫",
    "position": "午",
    "heavenlyStem": "庚",
    "mainStars": ["紫微"],
    "auxiliaryStars": [],
    "evilStars": ["地劫"],
    "miscellaneousStars": [],
    "siHua": [],
    "miaoWang": [{"star": "紫微", "state": "庙"}],
    "sanFangSiZheng": {"sanFang": ["财帛宫", "官禄宫"], "duiGong": "迁移宫"}
  },
  {
    "palaceName": "财帛宫",
    "position": "寅",
    "heavenlyStem": "丙",
    "mainStars": ["武曲", "天相"],
    "auxiliaryStars": ["禄存", "天马"],
    "evilStars": ["火星"],
    "miscellaneousStars": [],
    "siHua": [{"type": "化科", "star": "武曲"}],
    "miaoWang": [{"star": "武曲", "state": "旺"}, {"star": "天相", "state": "利"}],
    "sanFangSiZheng": {"sanFang": ["命宫", "官禄宫"], "duiGong": "福德宫"}
  }
]
```

> **空宫处理**：无主星的宫位，`mainStars` 填空数组 `[]`，并在 `miaoWang` 中以 `{star:"(借对宫)", state:""}` 标注借星；解读时借对宫主星论。

---

### 2.8 shenGongPosition（身宫落点）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `shenGongPosition` | string | 是 | 身宫落于哪一宫（宫名） | `"夫妻宫"` |

> 身宫必落于十二宫之一，此字段标明其宫名，便于快速判断人生重心（如身宫在官禄主事业型、在夫妻主感情型）。

---

### 2.9 nianGan（生年天干）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `nianGan` | string | 是 | 出生年天干 | `"甲"` |

---

### 2.10 nianZhi（生年地支）

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `nianZhi` | string | 是 | 出生年地支（太岁） | `"子"` |

---

### 2.11 nianSiHua（生年四化）

由生年天干引动，终身不变，为命盘底色。固定四键。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `huaLu` | string | 是 | 化禄所落主星 | `"廉贞"` |
| `huaQuan` | string | 是 | 化权所落主星 | `"破军"` |
| `huaKe` | string | 是 | 化科所落主星 | `"武曲"` |
| `huaJi` | string | 是 | 化忌所落主星 | `"太阳"` |

**示例**：
```json
"nianSiHua": {
  "huaLu": "廉贞",
  "huaQuan": "破军",
  "huaKe": "武曲",
  "huaJi": "太阳"
}
```

> **十天干四化表**：甲廉破武阳；乙机梁紫阴；丙同机昌廉；丁阴同机巨；戊贪阴弼机；己武贪梁曲；庚阳武阴同；辛巨阳曲昌；壬梁紫左武；癸破巨阴贪。

---

### 2.12 laiYinGong（来因宫）

生年天干所在宫位（即宫干等于生年天干的那个宫），为生年四化之源头。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `laiYinGong` | string | 是 | 来因宫宫名 | `"官禄宫"` |

> 来因宫代表此生因缘业力的来源宫位，是四化派论命的关键太极点。

---

### 2.13 daXianList（大限列表）

数组，12个元素，从命宫起按 `suiXian.direction` 顺/逆行排列，每步10年。

**大限对象字段**：

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `gongName` | string | 是 | 大限命宫所落本命宫名 | `"子女宫"` |
| `stemBranch` | string | 是 | 大限命宫干支（该宫宫干+地支） | `"丁卯"` |
| `ageRange` | string | 是 | 大限年龄区间 | `"35-44"` |
| `startYear` | int | 否 | 大限起始年份 | `2018` |
| `endYear` | int | 否 | 大限结束年份 | `2027` |
| `siHua` | object | 是 | 大限天干所起四化 | 见下 |
| `isCurrent` | bool | 否 | 是否为当前大限 | `true` |

**siHua 对象字段**（同生年四化结构）：

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `huaLu` | string | 大限化禄所落主星 | `"太阴"` |
| `huaQuan` | string | 大限化权所落主星 | `"天同"` |
| `huaKe` | string | 大限化科所落主星 | `"天机"` |
| `huaJi` | string | 大限化忌所落主星 | `"巨门"` |

**示例**（仅展示3步）：
```json
"daXianList": [
  {
    "gongName": "命宫", "stemBranch": "庚午", "ageRange": "5-14",
    "startYear": 1988, "endYear": 1997,
    "siHua": {"huaLu": "太阳", "huaQuan": "武曲", "huaKe": "太阴", "huaJi": "天同"},
    "isCurrent": false
  },
  {
    "gongName": "子女宫", "stemBranch": "丁卯", "ageRange": "35-44",
    "startYear": 2018, "endYear": 2027,
    "siHua": {"huaLu": "太阴", "huaQuan": "天同", "huaKe": "天机", "huaJi": "巨门"},
    "isCurrent": true
  },
  {
    "gongName": "财帛宫", "stemBranch": "丙寅", "ageRange": "45-54",
    "startYear": 2028, "endYear": 2037,
    "siHua": {"huaLu": "天同", "huaQuan": "天机", "huaKe": "文昌", "huaJi": "廉贞"},
    "isCurrent": false
  }
]
```

> 大限共12步（对应十二宫），从起运年龄到124岁，此处省略其余步骤。

---

### 2.14 currentDaXian（当前大限）

命主当前所处的大限。若未到起运年龄则为 `null`。结构与 `daXianList[]` 元素一致。

**示例**：
```json
"currentDaXian": {
  "gongName": "子女宫",
  "stemBranch": "丁卯",
  "ageRange": "35-44",
  "startYear": 2018,
  "endYear": 2027,
  "siHua": {"huaLu": "太阴", "huaQuan": "天同", "huaKe": "天机", "huaJi": "巨门"}
}
```

---

### 2.15 currentLiuNian（当前流年）

当前年份的流年信息。无则填 `null`。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `year` | int | 是 | 流年年份 | `2026` |
| `ganZhi` | string | 是 | 流年干支 | `"丙午"` |
| `gongName` | string | 是 | 流年命宫所落本命宫名（太岁地支对应宫） | `"命宫"` |
| `stemBranch` | string | 是 | 流年命宫干支 | `"丙午"` |
| `siHua` | object | 是 | 流年天干所起四化（结构同上） | 见下 |

**示例**：
```json
"currentLiuNian": {
  "year": 2026,
  "ganZhi": "丙午",
  "gongName": "命宫",
  "stemBranch": "丙午",
  "siHua": {"huaLu": "天同", "huaQuan": "天机", "huaKe": "文昌", "huaJi": "廉贞"}
}
```

---

### 2.16 liuYueList（流月列表）

当前流年的12个月流月信息。可选字段，用户选中流月分析时提供；未选时为 `null`。

数组，12个元素，每月一个。

| 字段 | 类型 | 必填 | 说明 | 示例 |
|---|---|---|---|---|
| `month` | int | 是 | 月份（1-12） | `1` |
| `ganZhi` | string | 是 | 流月干支 | `"庚寅"` |
| `gongName` | string | 是 | 流月命宫所落宫名 | `"财帛宫"` |

**示例**（仅展示2月）：
```json
"liuYueList": [
  { "month": 1, "ganZhi": "庚寅", "gongName": "财帛宫" },
  { "month": 2, "ganZhi": "辛卯", "gongName": "子女宫" }
]
```

---

## 三、analysis（预计算分析结果）

> **最高优先级**：当排盘JSON包含 `analysis` 字段时，该字段中的预计算分析结果优先于一切规则，模型必须直接使用，不得自行重新计算或推翻。
>
> `analysis` 对象包含以下14个子字段，覆盖命局层次、格局、星曜力量、四化、宫位、三方四正、大限、流年、神煞及六大人生领域评估。

### 3.1 analysis.mingJuLevel（命局层次评分）

```json
"mingJuLevel": {
  "scores": [
    { "dimension": "格局成格度", "maxScore": 30, "score": 22, "reason": "极向离明格、府相朝垣成格，紫微庙旺得地，但太阳化忌减损" },
    { "dimension": "星曜分布度", "maxScore": 25, "score": 18, "reason": "主星多庙旺，但田宅、父母两宫空宫，根基稍弱" },
    { "dimension": "四化吉凶度", "maxScore": 20, "score": 14, "reason": "化禄入官禄、化权入福德、化科入财帛三吉，化忌入子女一凶" },
    { "dimension": "运势顺畅度", "maxScore": 15, "score": 12, "reason": "大限逆行，35-44行子女宫逢本命化忌，中年有波折" },
    { "dimension": "煞星影响度", "maxScore": 10, "score": 6, "reason": "地劫坐命主虚耗，但紫微帝座可制煞，煞星分散于六亲宫" }
  ],
  "totalScore": 72,
  "level": "中等",
  "levelRange": "55-79",
  "summary": "紫微在午帝坐得地，府相朝垣格局不低，但地劫坐命、太阳化忌，属先贵后磨型，中年有考验"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `scores` | array | 五维度评分，固定5个元素 |
| `scores[].dimension` | string | 维度名称：格局成格度/星曜分布度/四化吉凶度/运势顺畅度/煞星影响度 |
| `scores[].maxScore` | int | 该维度满分 |
| `scores[].score` | int | 该维度得分 |
| `scores[].reason` | string | 评分依据（一句话） |
| `totalScore` | int | 五维度总分（满分100） |
| `level` | string | 层次等级：上等/中等/下等 |
| `levelRange` | string | 等级分数区间 |
| `summary` | string | 命局层次一句话总结 |

**五维度评分标准**：

| 维度 | 满分 | 评分依据 |
|---|---|---|
| 格局成格度 | 30 | 主格是否成立、清纯有力程度、冲破减损情况 |
| 星曜分布度 | 25 | 主星庙旺利陷分布、空宫数量、吉星会照度 |
| 四化吉凶度 | 20 | 生年四化落宫吉凶配比（禄权科为吉、忌为凶） |
| 运势顺畅度 | 15 | 大限行运与命盘叠合的总体顺逆趋势 |
| 煞星影响度 | 10 | 六煞星落宫对命局破坏程度（命身宫受煞扣分重） |

**层次等级映射**：

| 总分 | 等级 |
|---|---|
| 80-100 | 上等 |
| 55-79 | 中等 |
| 0-54 | 下等 |

---

### 3.2 analysis.geJuInfo（格局信息）

```json
"geJuInfo": {
  "patterns": [
    { "name": "极向离明格", "type": "吉格", "formed": true, "level": "上等", "description": "紫微在午独坐，庙旺得地，三方府相朝垣，帝座有辅" },
    { "name": "府相朝垣格", "type": "吉格", "formed": true, "level": "上等", "description": "天府在戌、天相在寅，三合朝命，主富贵双全" },
    { "name": "日月并明格", "type": "吉格", "formed": true, "level": "中等", "description": "太阳在卯、太阴在亥皆庙旺，主名声显达" },
    { "name": "火贪格", "type": "吉格", "formed": false, "level": "下等", "description": "火星与贪狼未同宫，火贪横发格不成立" }
  ],
  "mainPattern": "极向离明格",
  "patternLevel": "上等"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `patterns` | array | 命盘可识别的全部格局列表（吉格、凶格、中性均需排查） |
| `patterns[].name` | string | 格局名称（如极向离明/府相朝垣/紫府同宫/杀破狼/机月同梁/月朗天门/火贪/铃贪/刑囚夹印/马头带箭等） |
| `patterns[].type` | string | 格局类型：吉格/凶格/中性 |
| `patterns[].formed` | bool | 是否成立 |
| `patterns[].level` | string | 单格层次：上等/中等/下等 |
| `patterns[].description` | string | 格局含义及成立条件说明（一句话） |
| `mainPattern` | string | 主格局名称（最核心的一个） |
| `patternLevel` | string | 总体格局层次：上等/中等/下等 |

> 凶格（如刑囚夹印、马头带箭、命里逢劫、劫空夹命）必须同样排查并标注，不得只报吉格。

---

### 3.3 analysis.starPower（星曜力量）

```json
"starPower": {
  "mingGongStars": [
    { "starName": "紫微", "miaoWang": "庙", "power": "强", "reason": "紫微在午为帝座得地，庙旺，三方府相朝垣，力量强" }
  ],
  "overallStrength": "强"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `mingGongStars` | array | 命宫主星力量逐颗评估 |
| `mingGongStars[].starName` | string | 主星名 |
| `mingGongStars[].miaoWang` | string | 庙旺利陷：庙/旺/利/平/陷 |
| `mingGongStars[].power` | string | 综合力量：强/中/弱 |
| `mingGongStars[].reason` | string | 力量判定依据（一句话，含庙旺、三方四正会照、煞星干扰等） |
| `overallStrength` | string | 命宫整体力量：强/中等/弱 |

> 力量评估须综合：庙旺利陷 + 三方四正吉星会照 + 煞星冲破 + 四化引动。

---

### 3.4 analysis.siHuaAnalysis（四化分析）

```json
"siHuaAnalysis": {
  "nianSiHua": [
    { "type": "化禄", "star": "廉贞", "palace": "官禄宫(戌)", "effect": "吉", "description": "生年化禄入官禄，事业有禄，工作顺遂有财" },
    { "type": "化权", "star": "破军", "palace": "福德宫(申)", "effect": "吉", "description": "化权入福德，内心有主见有冲劲，掌权之象" },
    { "type": "化科", "star": "武曲", "palace": "财帛宫(寅)", "effect": "吉", "description": "化科入财帛，理财有名声，求财稳健" },
    { "type": "化忌", "star": "太阳", "palace": "子女宫(卯)", "effect": "凶", "description": "化忌入子女，子女缘有亏，或投资合伙易损" }
  ],
  "currentDaXianSiHua": [
    { "type": "化禄", "star": "太阴", "palace": "交友宫(亥)", "effect": "吉", "description": "大限化禄入交友，人际财源广" },
    { "type": "化权", "star": "天同", "palace": "疾厄宫(丑)", "effect": "中性", "description": "大限化权入疾厄，身体有劲但也劳心" },
    { "type": "化科", "star": "天机", "palace": "兄弟宫(巳)", "effect": "吉", "description": "大限化科入兄弟，同辈有助" },
    { "type": "化忌", "star": "巨门", "palace": "疾厄宫(丑)", "effect": "凶", "description": "大限化忌入疾厄，巨门落陷，健康与口舌是非需防" }
  ],
  "currentLiuNianSiHua": [
    { "type": "化禄", "star": "天同", "palace": "疾厄宫(丑)", "effect": "吉", "description": "流年化禄入疾厄，身体有福但易懒" },
    { "type": "化权", "star": "天机", "palace": "兄弟宫(巳)", "effect": "吉", "description": "流年化权入兄弟，同辈变动有力" },
    { "type": "化科", "star": "文昌", "palace": "子女宫(卯)", "effect": "吉", "description": "流年化科入子女，子女学业有成名" },
    { "type": "化忌", "star": "廉贞", "palace": "官禄宫(戌)", "effect": "凶", "description": "流年化忌冲官禄，事业有压，需防官非口舌" }
  ],
  "siHuaInteraction": "生年化禄坐官禄为体，流年化忌入官禄为用，禄忌同宫于官禄，事业先有机后受阻，2026年事业宜守不宜攻。大限化忌入疾厄叠巨门落陷，健康与情绪为本大限重点课题。"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `nianSiHua` | array | 生年四化逐颗评估（固定4个） |
| `currentDaXianSiHua` | array | 当前大限四化逐颗评估（固定4个） |
| `currentLiuNianSiHua` | array | 当前流年四化逐颗评估（固定4个） |
| 四化元素.`type` | string | 化禄/化权/化科/化忌 |
| 四化元素.`star` | string | 被引动主星 |
| 四化元素.`palace` | string | 落点宫名（含地支） |
| 四化元素.`effect` | string | 吉凶效应：吉/凶/中性 |
| 四化元素.`description` | string | 该四化作用说明（一句话） |
| `siHuaInteraction` | string | 生年/大限/流年三层四化叠合交互作用总述 |

> 四化分析须遵循"生年为体、大限为用、流年为引"的叠合层次，重点标注禄忌同宫、忌入命身疾、禄入财官等关键落点。

---

### 3.5 analysis.palaceAssessment（宫位评估）

对十二宫逐宫评估。键为宫名，值为该宫评估对象。

```json
"palaceAssessment": {
  "命宫": {
    "mainStar": "紫微",
    "strength": "强",
    "auspiciousness": "吉",
    "keyFindings": "紫微庙旺独坐，帝座有威，三方府相朝垣，格局不低，主尊贵有领导力；地劫同宫主虚耗，需防眼高手低"
  },
  "财帛宫": {
    "mainStar": "武曲、天相",
    "strength": "强",
    "auspiciousness": "吉",
    "keyFindings": "武曲化科，理财有方，天相辅财，财源稳健，禄存天马同宫主流动财"
  },
  "官禄宫": {
    "mainStar": "廉贞、天府",
    "strength": "强",
    "auspiciousness": "吉",
    "keyFindings": "生年化禄坐此，事业有禄有财，天府库稳，宜管理金融体制内"
  },
  "疾厄宫": {
    "mainStar": "天同、巨门",
    "strength": "弱",
    "auspiciousness": "凶",
    "keyFindings": "巨门落陷叠大限化忌，脾胃口腔呼吸需防，本大限健康为课题"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| (宫名键) | object | 十二宫各一个，键为宫名 |
| `mainStar` | string | 该宫主星（空宫标注借星） |
| `strength` | string | 该宫整体力量：强/中/弱 |
| `auspiciousness` | string | 吉凶：吉/凶/中性 |
| `keyFindings` | string | 该宫核心论断（一句话，含主星、庙旺、煞星、四化影响） |

> 必须覆盖全部12宫，不得遗漏。空宫以借对宫星论，`mainStar` 填 `"(借对宫XX)"`。

---

### 3.6 analysis.sanFangSiZheng（三方四正分析）

对关键宫位（命宫、财帛、官禄、夫妻等）展开三方四正组合分析。

```json
"sanFangSiZheng": {
  "命宫": {
    "sanFang": ["财帛宫", "官禄宫"],
    "duiGong": "迁移宫",
    "combinedStars": ["紫微", "武曲", "天相", "廉贞", "天府", "贪狼"],
    "assessment": "府相朝垣，紫微帝座得辅，三方吉星汇聚，格局清纯有力，主富贵双全"
  },
  "夫妻宫": {
    "sanFang": ["迁移宫", "福德宫"],
    "duiGong": "官禄宫",
    "combinedStars": ["七杀", "贪狼", "破军"],
    "assessment": "夫妻七杀，三方杀破狼动星汇聚，感情多变不稳，宜晚婚稳婚"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| (宫名键) | object | 关键宫位各一个 |
| `sanFang` | string[] | 三方宫名列表（2个） |
| `duiGong` | string | 对宫宫名 |
| `combinedStars` | string[] | 本宫+三方+对宫的全部主星汇总 |
| `assessment` | string | 三方四正综合论断（一句话） |

> 至少覆盖命宫、财帛宫、官禄宫、夫妻宫四个关键宫位。

---

### 3.7 analysis.daXianEvaluations（大限预计算评估）

> **强制规则**：每步大限必须按大限命宫主星、大限四化落宫、与本命叠宫三维度预计算吉凶，不得由模型自行判断。

```json
"daXianEvaluations": [
  {
    "gongName": "命宫",
    "stemBranch": "庚午",
    "ageRange": "5-14",
    "rating": "吉",
    "score": 78,
    "dimensions": { "career": 80, "wealth": 75, "health": 82, "relationship": 70 },
    "keyEvents": ["早年得长辈荫庇", "学业顺遂，根基稳固"]
  },
  {
    "gongName": "子女宫",
    "stemBranch": "丁卯",
    "ageRange": "35-44",
    "isCurrent": true,
    "rating": "平",
    "score": 58,
    "dimensions": { "career": 55, "wealth": 60, "health": 50, "relationship": 60 },
    "keyEvents": ["大限化忌入疾厄，健康情绪承压", "流年2026化忌冲官禄，事业波动", "投资合伙易损，宜守不宜攻"]
  },
  {
    "gongName": "财帛宫",
    "stemBranch": "丙寅",
    "ageRange": "45-54",
    "rating": "吉",
    "score": 75,
    "dimensions": { "career": 78, "wealth": 82, "health": 70, "relationship": 72 },
    "keyEvents": ["武曲化科财帛宫当令，财运上升", "中年事业财运双收，为人生高峰期"]
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `gongName` | string | 大限命宫所落本命宫名 |
| `stemBranch` | string | 大限命宫干支 |
| `ageRange` | string | 大限年龄区间 |
| `isCurrent` | bool | 是否为当前大限 |
| `rating` | string | 总体吉凶：吉/平/凶 |
| `score` | int | 综合评分（0-100） |
| `dimensions` | object | 四领域各自评分（事业/财运/健康/感情，各0-100） |
| `keyEvents` | string[] | 该大限关键事件/趋势描述列表 |

> 必须覆盖全部12步大限（或至少覆盖命主已行过的及未来关键大限），当前大限须标 `isCurrent: true`。

---

### 3.8 analysis.liuNianAssessments（流年预计算评估）

> **强制规则**：当前大限内的关键流年必须预计算吉凶，不得由模型自行判断。

```json
"liuNianAssessments": [
  {
    "year": 2025,
    "ganZhi": "乙巳",
    "gongName": "兄弟宫",
    "rating": "吉",
    "score": 70,
    "riskLevel": "低",
    "keyMonths": [
      { "month": 3, "rating": "吉", "advice": "春季同辈助力，合作有机" },
      { "month": 9, "rating": "平", "advice": "秋季守成为宜，勿冒进" }
    ]
  },
  {
    "year": 2026,
    "ganZhi": "丙午",
    "gongName": "命宫",
    "rating": "平",
    "score": 58,
    "riskLevel": "中",
    "keyMonths": [
      { "month": 4, "rating": "凶", "advice": "流月化忌冲官禄，事业有压，不宜跳槽" },
      { "month": 8, "rating": "吉", "advice": "贵人入命，把握合作机遇" }
    ]
  },
  {
    "year": 2028,
    "ganZhi": "戊申",
    "gongName": "福德宫",
    "rating": "吉",
    "score": 68,
    "riskLevel": "低",
    "keyMonths": [
      { "month": 2, "rating": "吉", "advice": "贪狼化禄，人际财源开" },
      { "month": 11, "rating": "平", "advice": "岁末收敛，注意情绪" }
    ]
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `year` | int | 流年年份 |
| `ganZhi` | string | 流年干支 |
| `gongName` | string | 流年命宫所落本命宫名 |
| `rating` | string | 总体吉凶：吉/平/凶 |
| `score` | int | 综合评分（0-100） |
| `riskLevel` | string | 风险等级：高/中/低 |
| `keyMonths` | array | 关键月份逐月评估 |
| `keyMonths[].month` | int | 月份（1-12） |
| `keyMonths[].rating` | string | 该月吉凶：吉/平/凶 |
| `keyMonths[].advice` | string | 该月行动建议 |

> 至少覆盖当前流年及前后2年（共约5年），当前流年必须详细到关键月份。

---

### 3.9 analysis.shenShaClassification（神煞分类）

> **强制规则**：辅星与煞星必须按统一标准分为吉神与凶煞，并为每个指定等级与落宫，不得由模型自行判断等级。

```json
"shenShaClassification": {
  "auspicious": [
    { "name": "天魁", "palace": "疾厄宫", "level": "甲级" },
    { "name": "天钺", "palace": "父母宫", "level": "甲级" },
    { "name": "禄存", "palace": "财帛宫", "level": "甲级" },
    { "name": "左辅", "palace": "交友宫", "level": "乙级" },
    { "name": "右弼", "palace": "子女宫", "level": "乙级" },
    { "name": "文昌", "palace": "子女宫", "level": "乙级" },
    { "name": "文曲", "palace": "交友宫", "level": "乙级" },
    { "name": "天马", "palace": "财帛宫", "level": "乙级" }
  ],
  "inauspicious": [
    { "name": "地空", "palace": "夫妻宫", "level": "甲级" },
    { "name": "地劫", "palace": "命宫", "level": "甲级" },
    { "name": "擎羊", "palace": "子女宫", "level": "乙级" },
    { "name": "陀罗", "palace": "疾厄宫", "level": "乙级" },
    { "name": "火星", "palace": "财帛宫", "level": "乙级" },
    { "name": "铃星", "palace": "交友宫", "level": "乙级" }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `auspicious` | array | 吉神列表 |
| `inauspicious` | array | 凶煞列表 |
| 元素.`name` | string | 神煞名 |
| 元素.`palace` | string | 所落宫名 |
| 元素.`level` | string | 等级：甲级/乙级/丙级 |

**神煞等级标准**：

| 等级 | 吉神 | 凶煞 |
|---|---|---|
| **甲级** | 天魁、天钺、禄存 | 地空、地劫 |
| **乙级** | 左辅、右弼、文昌、文曲、天马 | 擎羊、陀罗、火星、铃星 |
| **丙级** | 红鸾、天喜、华盖、三台、八座等 | 孤辰、寡宿、天哭、天虚等 |

> 命宫、身宫受甲级凶煞（地空地劫）需重点提示；甲级吉神（天魁天钺禄存）所在宫为贵人/财源宫。

---

### 3.10 analysis.personalityAnalysis（性格分析）

```json
"personalityAnalysis": {
  "coreTraits": [
    "紫微坐命，天生具领导气质，自尊心强，好面子",
    "行事稳重有章法，格局宏大，有主见",
    "地劫同宫，偶有空想虚耗，需防眼高手低"
  ],
  "strengths": ["领导力强，统御能力佳", "责任感重，处事公正", "贵人运强，善借力"],
  "weaknesses": ["刚愎自用，独断专行", "虚荣心重，过度在意形象", "易因空亡星陷入不切实际的幻想"],
  "innerNature": "福德宫破军化权，内心躁动不安分，渴望开创与突破，不甘平庸",
  "outerBehavior": "命宫紫微，外在稳重威严，举止有帝王气度，重视秩序与体面"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `coreTraits` | string[] | 核心性格特质列表（基于命宫主星） |
| `strengths` | string[] | 性格优势列表 |
| `weaknesses` | string[] | 性格短板列表 |
| `innerNature` | string | 内在心性（基于福德宫主星及四化） |
| `outerBehavior` | string | 外在行为模式（基于命宫主星及身宫落点） |

---

### 3.11 analysis.careerAssessment（事业评估）

```json
"careerAssessment": {
  "suitableIndustries": ["管理咨询", "金融理财", "体制内/大型企业管理", "文化创意"],
  "careerStyle": "紫微+武曲天府官禄化禄，宜稳健型领导岗，非冒险创业型；擅统筹资源、带团队",
  "peakPeriod": "45-54岁财帛宫大限，武曲化科当令，事业财运双高峰",
  "advice": [
    "35-44大限宜积累蓄势，勿冒进",
    "善用天魁天钺贵人，借力上位",
    "2026流年化忌冲官禄，不宜跳槽创业"
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `suitableIndustries` | string[] | 适配行业列表（基于官禄宫主星及命宫格局） |
| `careerStyle` | string | 事业风格描述 |
| `peakPeriod` | string | 事业高峰期（基于大限评估） |
| `advice` | string[] | 事业发展建议列表 |

---

### 3.12 analysis.wealthAssessment（财富评估）

```json
"wealthAssessment": {
  "wealthPattern": "财帛武曲天相+化科，求财稳健有名声，天府坐官禄化禄为财库，属正财格局",
  "incomeSource": "正职薪俸+管理理财为主，非偏财横财型",
  "wealthLevel": "中上",
  "riskFactors": ["地劫坐命，易有虚耗破财", "流年化忌冲官禄时收入波动"],
  "advice": ["以正财为本，避免高风险投机", "置产聚财，天府库性宜守不宜散"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `wealthPattern` | string | 财富格局描述（基于财帛宫主星、化禄落宫、禄存） |
| `incomeSource` | string | 收入来源描述 |
| `wealthLevel` | string | 财富等级：上/中上/中/中下/下 |
| `riskFactors` | string[] | 破财风险因素列表（化忌冲财、地空地劫守财等） |
| `advice` | string[] | 求财理财建议列表 |

---

### 3.13 analysis.healthAssessment（健康评估）

```json
"healthAssessment": {
  "vulnerableSystems": ["脾胃(紫微土+天同巨门疾厄)", "口腔/呼吸道(巨门落陷)", "心血管(破军福德化权劳心)"],
  "fiveElementBalance": "命宫庚午土金，紫微土旺，巨门水陷疾厄，土克水，脾胃与泌尿消化需调",
  "riskPeriods": ["35-44大限化忌入疾厄，本大限健康为课题", "2026-2027流年疾厄宫受冲"],
  "advice": ["定期检查脾胃与口腔", "避免过度劳心，福德破军化权需适度放松", "健康仅作趋势提示，异常请咨询专业医师"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `vulnerableSystems` | string[] | 易患系统列表（基于疾厄宫主星及五行对应脏腑） |
| `fiveElementBalance` | string | 五行脏腑平衡描述 |
| `riskPeriods` | string[] | 健康风险时段列表（基于大限/流年化忌入疾厄） |
| `advice` | string[] | 健康建议列表 |

> 健康评估仅作趋势提示，不进行医疗诊断，必须提示咨询专业人士。

---

### 3.14 analysis.relationshipAssessment（感情评估）

```json
"relationshipAssessment": {
  "marriageProspect": "夫妻宫七杀独坐，感情多变波折，宜晚婚(28岁后)，早婚易离",
  "partnerCharacteristics": "配偶刚强独立，有个性有主见，可能从事军警或竞争性行业",
  "riskFactors": ["七杀坐夫妻主刑克", "地空坐夫妻宫，感情易有空虚失落", "三方杀破狼动星，婚姻不稳"],
  "advice": ["晚婚稳婚，选择包容性强的伴侣", "婚后保持独立空间，避免硬碰硬", "2026-2027感情考验期，多沟通忍让"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `marriageProspect` | string | 婚恋前景描述（基于夫妻宫主星庙旺及对宫官禄互涉） |
| `partnerCharacteristics` | string | 伴侣特质描述 |
| `riskFactors` | string[] | 感情风险因素列表 |
| `advice` | string[] | 感情经营建议列表 |

---

## 四、完整JSON示例

以下为林子涵命盘的完整排盘JSON示例（命宫紫微在午独坐，含 `analysis` 预计算字段）：

```json
{
  "chartType": "紫微斗数",
  "basicInfo": {
    "name": "林子涵",
    "gender": "女",
    "genderLabel": "坤造",
    "solarDate": "1984年10月15日 14:30",
    "lunarDate": "甲子年八月二十一日 未时",
    "trueSolarTime": "1984-10-15 14:42",
    "birthplace": "浙江省 杭州市 西湖区"
  },
  "mingGong": { "position": "午", "stemBranch": "庚午" },
  "shenGong": { "position": "辰", "stemBranch": "戊辰" },
  "wuXingJu": "土五局",
  "suiXian": { "direction": "逆行", "startAge": 5 },
  "palaces": [
    {
      "palaceName": "命宫", "position": "午", "heavenlyStem": "庚",
      "mainStars": ["紫微"], "auxiliaryStars": [], "evilStars": ["地劫"], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "紫微", "state": "庙"}],
      "sanFangSiZheng": {"sanFang": ["财帛宫", "官禄宫"], "duiGong": "迁移宫"}
    },
    {
      "palaceName": "兄弟宫", "position": "巳", "heavenlyStem": "己",
      "mainStars": ["天机"], "auxiliaryStars": [], "evilStars": [], "miscellaneousStars": [],
      "siHua": [{"type": "化科", "star": "天机"}], "miaoWang": [{"star": "天机", "state": "旺"}],
      "sanFangSiZheng": {"sanFang": ["交友宫", "田宅宫"], "duiGong": "交友宫"}
    },
    {
      "palaceName": "夫妻宫", "position": "辰", "heavenlyStem": "戊",
      "mainStars": ["七杀"], "auxiliaryStars": [], "evilStars": ["地空"], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "七杀", "state": "旺"}],
      "sanFangSiZheng": {"sanFang": ["迁移宫", "福德宫"], "duiGong": "官禄宫"}
    },
    {
      "palaceName": "子女宫", "position": "卯", "heavenlyStem": "丁",
      "mainStars": ["太阳", "天梁"], "auxiliaryStars": ["右弼", "文昌"], "evilStars": ["擎羊"], "miscellaneousStars": [],
      "siHua": [{"type": "化忌", "star": "太阳"}], "miaoWang": [{"star": "太阳", "state": "庙"}, {"star": "天梁", "state": "旺"}],
      "sanFangSiZheng": {"sanFang": ["交友宫", "父母宫"], "duiGong": "田宅宫"}
    },
    {
      "palaceName": "财帛宫", "position": "寅", "heavenlyStem": "丙",
      "mainStars": ["武曲", "天相"], "auxiliaryStars": ["禄存", "天马"], "evilStars": ["火星"], "miscellaneousStars": [],
      "siHua": [{"type": "化科", "star": "武曲"}], "miaoWang": [{"star": "武曲", "state": "旺"}, {"star": "天相", "state": "利"}],
      "sanFangSiZheng": {"sanFang": ["命宫", "官禄宫"], "duiGong": "福德宫"}
    },
    {
      "palaceName": "疾厄宫", "position": "丑", "heavenlyStem": "丁",
      "mainStars": ["天同", "巨门"], "auxiliaryStars": ["天魁"], "evilStars": ["陀罗"], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "天同", "state": "庙"}, {"star": "巨门", "state": "陷"}],
      "sanFangSiZheng": {"sanFang": ["父母宫", "兄弟宫"], "duiGong": "父母宫"}
    },
    {
      "palaceName": "迁移宫", "position": "子", "heavenlyStem": "丙",
      "mainStars": ["贪狼"], "auxiliaryStars": [], "evilStars": [], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "贪狼", "state": "旺"}],
      "sanFangSiZheng": {"sanFang": ["官禄宫", "财帛宫"], "duiGong": "命宫"}
    },
    {
      "palaceName": "交友宫", "position": "亥", "heavenlyStem": "乙",
      "mainStars": ["太阴"], "auxiliaryStars": ["左辅", "文曲"], "evilStars": ["铃星"], "miscellaneousStars": [],
      "siHua": [{"type": "化禄", "star": "太阴"}], "miaoWang": [{"star": "太阴", "state": "庙"}],
      "sanFangSiZheng": {"sanFang": ["兄弟宫", "子女宫"], "duiGong": "兄弟宫"}
    },
    {
      "palaceName": "官禄宫", "position": "戌", "heavenlyStem": "甲",
      "mainStars": ["廉贞", "天府"], "auxiliaryStars": [], "evilStars": [], "miscellaneousStars": [],
      "siHua": [{"type": "化禄", "star": "廉贞"}], "miaoWang": [{"star": "廉贞", "state": "庙"}, {"star": "天府", "state": "庙"}],
      "sanFangSiZheng": {"sanFang": ["命宫", "财帛宫"], "duiGong": "夫妻宫"}
    },
    {
      "palaceName": "田宅宫", "position": "酉", "heavenlyStem": "癸",
      "mainStars": [], "auxiliaryStars": [], "evilStars": [], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "(借对宫太阳天梁)", "state": ""}],
      "sanFangSiZheng": {"sanFang": ["福德宫", "迁移宫"], "duiGong": "子女宫"}
    },
    {
      "palaceName": "福德宫", "position": "申", "heavenlyStem": "壬",
      "mainStars": ["破军"], "auxiliaryStars": [], "evilStars": [], "miscellaneousStars": [],
      "siHua": [{"type": "化权", "star": "破军"}], "miaoWang": [{"star": "破军", "state": "平"}],
      "sanFangSiZheng": {"sanFang": ["夫妻宫", "迁移宫"], "duiGong": "财帛宫"}
    },
    {
      "palaceName": "父母宫", "position": "未", "heavenlyStem": "辛",
      "mainStars": [], "auxiliaryStars": ["天钺"], "evilStars": [], "miscellaneousStars": [],
      "siHua": [], "miaoWang": [{"star": "(借对宫天同巨门)", "state": ""}],
      "sanFangSiZheng": {"sanFang": ["疾厄宫", "子女宫"], "duiGong": "疾厄宫"}
    }
  ],
  "shenGongPosition": "夫妻宫",
  "nianGan": "甲",
  "nianZhi": "子",
  "nianSiHua": { "huaLu": "廉贞", "huaQuan": "破军", "huaKe": "武曲", "huaJi": "太阳" },
  "laiYinGong": "官禄宫",
  "daXianList": [
    { "gongName": "命宫", "stemBranch": "庚午", "ageRange": "5-14", "startYear": 1988, "endYear": 1997, "siHua": {"huaLu": "太阳", "huaQuan": "武曲", "huaKe": "太阴", "huaJi": "天同"}, "isCurrent": false },
    { "gongName": "兄弟宫", "stemBranch": "己巳", "ageRange": "15-24", "startYear": 1998, "endYear": 2007, "siHua": {"huaLu": "武曲", "huaQuan": "贪狼", "huaKe": "天梁", "huaJi": "文曲"}, "isCurrent": false },
    { "gongName": "夫妻宫", "stemBranch": "戊辰", "ageRange": "25-34", "startYear": 2008, "endYear": 2017, "siHua": {"huaLu": "贪狼", "huaQuan": "太阴", "huaKe": "右弼", "huaJi": "天机"}, "isCurrent": false },
    { "gongName": "子女宫", "stemBranch": "丁卯", "ageRange": "35-44", "startYear": 2018, "endYear": 2027, "siHua": {"huaLu": "太阴", "huaQuan": "天同", "huaKe": "天机", "huaJi": "巨门"}, "isCurrent": true },
    { "gongName": "财帛宫", "stemBranch": "丙寅", "ageRange": "45-54", "startYear": 2028, "endYear": 2037, "siHua": {"huaLu": "天同", "huaQuan": "天机", "huaKe": "文昌", "huaJi": "廉贞"}, "isCurrent": false },
    { "gongName": "疾厄宫", "stemBranch": "丁丑", "ageRange": "55-64", "startYear": 2038, "endYear": 2047, "siHua": {"huaLu": "太阴", "huaQuan": "天同", "huaKe": "天机", "huaJi": "巨门"}, "isCurrent": false },
    { "gongName": "迁移宫", "stemBranch": "丙子", "ageRange": "65-74", "startYear": 2048, "endYear": 2057, "siHua": {"huaLu": "天同", "huaQuan": "天机", "huaKe": "文昌", "huaJi": "廉贞"}, "isCurrent": false },
    { "gongName": "交友宫", "stemBranch": "乙亥", "ageRange": "75-84", "startYear": 2058, "endYear": 2067, "siHua": {"huaLu": "天机", "huaQuan": "天梁", "huaKe": "紫微", "huaJi": "太阴"}, "isCurrent": false },
    { "gongName": "官禄宫", "stemBranch": "甲戌", "ageRange": "85-94", "startYear": 2068, "endYear": 2077, "siHua": {"huaLu": "廉贞", "huaQuan": "破军", "huaKe": "武曲", "huaJi": "太阳"}, "isCurrent": false },
    { "gongName": "田宅宫", "stemBranch": "癸酉", "ageRange": "95-104", "startYear": 2078, "endYear": 2087, "siHua": {"huaLu": "破军", "huaQuan": "巨门", "huaKe": "太阴", "huaJi": "贪狼"}, "isCurrent": false },
    { "gongName": "福德宫", "stemBranch": "壬申", "ageRange": "105-114", "startYear": 2088, "endYear": 2097, "siHua": {"huaLu": "天梁", "huaQuan": "紫微", "huaKe": "左辅", "huaJi": "武曲"}, "isCurrent": false },
    { "gongName": "父母宫", "stemBranch": "辛未", "ageRange": "115-124", "startYear": 2098, "endYear": 2107, "siHua": {"huaLu": "巨门", "huaQuan": "太阳", "huaKe": "文曲", "huaJi": "文昌"}, "isCurrent": false }
  ],
  "currentDaXian": {
    "gongName": "子女宫", "stemBranch": "丁卯", "ageRange": "35-44",
    "startYear": 2018, "endYear": 2027,
    "siHua": {"huaLu": "太阴", "huaQuan": "天同", "huaKe": "天机", "huaJi": "巨门"}
  },
  "currentLiuNian": {
    "year": 2026, "ganZhi": "丙午", "gongName": "命宫", "stemBranch": "丙午",
    "siHua": {"huaLu": "天同", "huaQuan": "天机", "huaKe": "文昌", "huaJi": "廉贞"}
  },
  "liuYueList": null,
  "analysis": {
    "mingJuLevel": {
      "scores": [
        { "dimension": "格局成格度", "maxScore": 30, "score": 22, "reason": "极向离明格、府相朝垣成格，紫微庙旺得地，但太阳化忌减损" },
        { "dimension": "星曜分布度", "maxScore": 25, "score": 18, "reason": "主星多庙旺，但田宅、父母两宫空宫，根基稍弱" },
        { "dimension": "四化吉凶度", "maxScore": 20, "score": 14, "reason": "化禄入官禄、化权入福德、化科入财帛三吉，化忌入子女一凶" },
        { "dimension": "运势顺畅度", "maxScore": 15, "score": 12, "reason": "大限逆行，35-44行子女宫逢本命化忌，中年有波折" },
        { "dimension": "煞星影响度", "maxScore": 10, "score": 6, "reason": "地劫坐命主虚耗，但紫微帝座可制煞，煞星分散于六亲宫" }
      ],
      "totalScore": 72,
      "level": "中等",
      "levelRange": "55-79",
      "summary": "紫微在午帝坐得地，府相朝垣格局不低，但地劫坐命、太阳化忌，属先贵后磨型，中年有考验"
    },
    "geJuInfo": {
      "patterns": [
        { "name": "极向离明格", "type": "吉格", "formed": true, "level": "上等", "description": "紫微在午独坐，庙旺得地，三方府相朝垣，帝座有辅" },
        { "name": "府相朝垣格", "type": "吉格", "formed": true, "level": "上等", "description": "天府在戌、天相在寅，三合朝命，主富贵双全" },
        { "name": "日月并明格", "type": "吉格", "formed": true, "level": "中等", "description": "太阳在卯、太阴在亥皆庙旺，主名声显达" },
        { "name": "火贪格", "type": "吉格", "formed": false, "level": "下等", "description": "火星与贪狼未同宫，火贪横发格不成立" }
      ],
      "mainPattern": "极向离明格",
      "patternLevel": "上等"
    },
    "starPower": {
      "mingGongStars": [
        { "starName": "紫微", "miaoWang": "庙", "power": "强", "reason": "紫微在午为帝座得地，庙旺，三方府相朝垣，力量强" }
      ],
      "overallStrength": "强"
    },
    "siHuaAnalysis": {
      "nianSiHua": [
        { "type": "化禄", "star": "廉贞", "palace": "官禄宫(戌)", "effect": "吉", "description": "生年化禄入官禄，事业有禄，工作顺遂有财" },
        { "type": "化权", "star": "破军", "palace": "福德宫(申)", "effect": "吉", "description": "化权入福德，内心有主见有冲劲，掌权之象" },
        { "type": "化科", "star": "武曲", "palace": "财帛宫(寅)", "effect": "吉", "description": "化科入财帛，理财有名声，求财稳健" },
        { "type": "化忌", "star": "太阳", "palace": "子女宫(卯)", "effect": "凶", "description": "化忌入子女，子女缘有亏，或投资合伙易损" }
      ],
      "currentDaXianSiHua": [
        { "type": "化禄", "star": "太阴", "palace": "交友宫(亥)", "effect": "吉", "description": "大限化禄入交友，人际财源广" },
        { "type": "化权", "star": "天同", "palace": "疾厄宫(丑)", "effect": "中性", "description": "大限化权入疾厄，身体有劲但也劳心" },
        { "type": "化科", "star": "天机", "palace": "兄弟宫(巳)", "effect": "吉", "description": "大限化科入兄弟，同辈有助" },
        { "type": "化忌", "star": "巨门", "palace": "疾厄宫(丑)", "effect": "凶", "description": "大限化忌入疾厄，巨门落陷，健康与口舌是非需防" }
      ],
      "currentLiuNianSiHua": [
        { "type": "化禄", "star": "天同", "palace": "疾厄宫(丑)", "effect": "吉", "description": "流年化禄入疾厄，身体有福但易懒" },
        { "type": "化权", "star": "天机", "palace": "兄弟宫(巳)", "effect": "吉", "description": "流年化权入兄弟，同辈变动有力" },
        { "type": "化科", "star": "文昌", "palace": "子女宫(卯)", "effect": "吉", "description": "流年化科入子女，子女学业有成名" },
        { "type": "化忌", "star": "廉贞", "palace": "官禄宫(戌)", "effect": "凶", "description": "流年化忌冲官禄，事业有压，需防官非口舌" }
      ],
      "siHuaInteraction": "生年化禄坐官禄为体，流年化忌入官禄为用，禄忌同宫于官禄，事业先有机后受阻，2026年事业宜守不宜攻。大限化忌入疾厄叠巨门落陷，健康与情绪为本大限重点课题。"
    },
    "palaceAssessment": {
      "命宫": { "mainStar": "紫微", "strength": "强", "auspiciousness": "吉", "keyFindings": "紫微庙旺独坐，帝座有威，三方府相朝垣，格局不低，主尊贵有领导力；地劫同宫主虚耗，需防眼高手低" },
      "兄弟宫": { "mainStar": "天机", "strength": "中", "auspiciousness": "中性", "keyFindings": "天机旺坐兄弟，手足聪明多变动，助力一般" },
      "夫妻宫": { "mainStar": "七杀", "strength": "中", "auspiciousness": "凶", "keyFindings": "七杀坐夫妻，感情波折，配偶刚强，宜晚婚；地空同宫易空虚失落" },
      "子女宫": { "mainStar": "太阳、天梁", "strength": "强", "auspiciousness": "中性", "keyFindings": "太阳庙化忌，子女有成就但缘薄，天梁为荫，右弼文昌同宫主子女有文才" },
      "财帛宫": { "mainStar": "武曲、天相", "strength": "强", "auspiciousness": "吉", "keyFindings": "武曲化科，理财有方，天相辅财，禄存天马同宫主流动财，财源稳健" },
      "疾厄宫": { "mainStar": "天同、巨门", "strength": "弱", "auspiciousness": "凶", "keyFindings": "巨门落陷叠大限化忌，脾胃口腔呼吸需防，本大限健康为课题" },
      "迁移宫": { "mainStar": "贪狼", "strength": "中", "auspiciousness": "中性", "keyFindings": "贪狼旺坐迁移，外出多应酬机遇，但也多欲望诱惑" },
      "交友宫": { "mainStar": "太阴", "strength": "强", "auspiciousness": "吉", "keyFindings": "太阴庙叠大限化禄，朋友多女性贵人，人际财源佳" },
      "官禄宫": { "mainStar": "廉贞、天府", "strength": "强", "auspiciousness": "吉", "keyFindings": "生年化禄坐此，事业有禄有财，天府库稳，宜管理金融体制内" },
      "田宅宫": { "mainStar": "(借对宫太阳天梁)", "strength": "弱", "auspiciousness": "中性", "keyFindings": "空宫借星，田宅根基需后天经营，置产宜稳" },
      "福德宫": { "mainStar": "破军", "strength": "中", "auspiciousness": "中性", "keyFindings": "破军平叠化权，内心躁动有冲劲，福报在开创，劳心劳力" },
      "父母宫": { "mainStar": "(借对宫天同巨门)", "strength": "弱", "auspiciousness": "中性", "keyFindings": "空宫借星，天钺同宫主长辈贵人，父母缘一般，助力有限" }
    },
    "sanFangSiZheng": {
      "命宫": { "sanFang": ["财帛宫", "官禄宫"], "duiGong": "迁移宫", "combinedStars": ["紫微", "武曲", "天相", "廉贞", "天府", "贪狼"], "assessment": "府相朝垣，紫微帝座得辅，三方吉星汇聚，格局清纯有力，主富贵双全" },
      "财帛宫": { "sanFang": ["命宫", "官禄宫"], "duiGong": "福德宫", "combinedStars": ["武曲", "天相", "紫微", "廉贞", "天府", "破军"], "assessment": "财帛武曲化科，三方帝座府库，求财有道有库" },
      "官禄宫": { "sanFang": ["命宫", "财帛宫"], "duiGong": "夫妻宫", "combinedStars": ["廉贞", "天府", "紫微", "武曲", "天相", "七杀"], "assessment": "官禄生年化禄，三方府相朝命，事业格局高" },
      "夫妻宫": { "sanFang": ["迁移宫", "福德宫"], "duiGong": "官禄宫", "combinedStars": ["七杀", "贪狼", "破军"], "assessment": "夫妻七杀，三方杀破狼动星汇聚，感情多变不稳，宜晚婚稳婚" }
    },
    "daXianEvaluations": [
      { "gongName": "命宫", "stemBranch": "庚午", "ageRange": "5-14", "rating": "吉", "score": 78, "dimensions": {"career": 80, "wealth": 75, "health": 82, "relationship": 70}, "keyEvents": ["早年得长辈荫庇", "学业顺遂，根基稳固"] },
      { "gongName": "兄弟宫", "stemBranch": "己巳", "ageRange": "15-24", "rating": "平", "score": 60, "dimensions": {"career": 58, "wealth": 55, "health": 65, "relationship": 62}, "keyEvents": ["求学变动期", "同辈关系起伏"] },
      { "gongName": "夫妻宫", "stemBranch": "戊辰", "ageRange": "25-34", "rating": "平", "score": 55, "dimensions": {"career": 50, "wealth": 55, "health": 60, "relationship": 50}, "keyEvents": ["七杀坐大限命，感情事业多变", "婚恋波折，宜晚婚"] },
      { "gongName": "子女宫", "stemBranch": "丁卯", "ageRange": "35-44", "isCurrent": true, "rating": "平", "score": 58, "dimensions": {"career": 55, "wealth": 60, "health": 50, "relationship": 60}, "keyEvents": ["大限化忌入疾厄，健康情绪承压", "流年2026化忌冲官禄，事业波动", "投资合伙易损，宜守不宜攻"] },
      { "gongName": "财帛宫", "stemBranch": "丙寅", "ageRange": "45-54", "rating": "吉", "score": 75, "dimensions": {"career": 78, "wealth": 82, "health": 70, "relationship": 72}, "keyEvents": ["武曲化科财帛宫当令，财运上升", "中年事业财运双收，为人生高峰期"] },
      { "gongName": "疾厄宫", "stemBranch": "丁丑", "ageRange": "55-64", "rating": "平", "score": 56, "dimensions": {"career": 55, "wealth": 58, "health": 48, "relationship": 60}, "keyEvents": ["化忌入疾厄，健康为重点", "宜退居二线，注重养生"] },
      { "gongName": "迁移宫", "stemBranch": "丙子", "ageRange": "65-74", "rating": "吉", "score": 70, "dimensions": {"career": 65, "wealth": 68, "health": 72, "relationship": 72}, "keyEvents": ["贪狼坐大限命，晚年活跃", "外出社交多，心态年轻"] },
      { "gongName": "交友宫", "stemBranch": "乙亥", "ageRange": "75-84", "rating": "吉", "score": 72, "dimensions": {"career": 65, "wealth": 70, "health": 70, "relationship": 78}, "keyEvents": ["太阴庙化禄，晚年人际福厚", "得晚辈朋友照料"] },
      { "gongName": "官禄宫", "stemBranch": "甲戌", "ageRange": "85-94", "rating": "吉", "score": 76, "dimensions": {"career": 72, "wealth": 75, "health": 70, "relationship": 75}, "keyEvents": ["生年化禄叠大限命，晚年有声望", "事业余荫犹存"] },
      { "gongName": "田宅宫", "stemBranch": "癸酉", "ageRange": "95-104", "rating": "平", "score": 58, "dimensions": {"career": 50, "wealth": 60, "health": 55, "relationship": 65}, "keyEvents": ["空宫借星，晚年田宅为主", "宜安养静养"] },
      { "gongName": "福德宫", "stemBranch": "壬申", "ageRange": "105-114", "rating": "平", "score": 55, "dimensions": {"career": 50, "wealth": 55, "health": 52, "relationship": 60}, "keyEvents": ["破军化禄，心境开豁", "精神层面富足"] },
      { "gongName": "父母宫", "stemBranch": "辛未", "ageRange": "115-124", "rating": "平", "score": 52, "dimensions": {"career": 48, "wealth": 50, "health": 50, "relationship": 58}, "keyEvents": ["空宫借星，颐养天年"] }
    ],
    "liuNianAssessments": [
      { "year": 2024, "ganZhi": "甲辰", "gongName": "夫妻宫", "rating": "吉", "score": 72, "riskLevel": "低", "keyMonths": [{"month": 3, "rating": "吉", "advice": "春季事业有机"}, {"month": 8, "rating": "平", "advice": "秋季守成为宜"}] },
      { "year": 2025, "ganZhi": "乙巳", "gongName": "兄弟宫", "rating": "吉", "score": 70, "riskLevel": "低", "keyMonths": [{"month": 3, "rating": "吉", "advice": "春季同辈助力，合作有机"}, {"month": 9, "rating": "平", "advice": "秋季守成为宜，勿冒进"}] },
      { "year": 2026, "ganZhi": "丙午", "gongName": "命宫", "rating": "平", "score": 58, "riskLevel": "中", "keyMonths": [{"month": 4, "rating": "凶", "advice": "流月化忌冲官禄，事业有压，不宜跳槽"}, {"month": 8, "rating": "吉", "advice": "贵人入命，把握合作机遇"}] },
      { "year": 2027, "ganZhi": "丁未", "gongName": "父母宫", "rating": "平", "score": 55, "riskLevel": "中", "keyMonths": [{"month": 2, "rating": "平", "advice": "长辈健康需关注"}, {"month": 10, "rating": "吉", "advice": "人际有贵人"}] },
      { "year": 2028, "ganZhi": "戊申", "gongName": "福德宫", "rating": "吉", "score": 68, "riskLevel": "低", "keyMonths": [{"month": 2, "rating": "吉", "advice": "贪狼化禄，人际财源开"}, {"month": 11, "rating": "平", "advice": "岁末收敛，注意情绪"}] }
    ],
    "shenShaClassification": {
      "auspicious": [
        { "name": "天魁", "palace": "疾厄宫", "level": "甲级" },
        { "name": "天钺", "palace": "父母宫", "level": "甲级" },
        { "name": "禄存", "palace": "财帛宫", "level": "甲级" },
        { "name": "左辅", "palace": "交友宫", "level": "乙级" },
        { "name": "右弼", "palace": "子女宫", "level": "乙级" },
        { "name": "文昌", "palace": "子女宫", "level": "乙级" },
        { "name": "文曲", "palace": "交友宫", "level": "乙级" },
        { "name": "天马", "palace": "财帛宫", "level": "乙级" }
      ],
      "inauspicious": [
        { "name": "地空", "palace": "夫妻宫", "level": "甲级" },
        { "name": "地劫", "palace": "命宫", "level": "甲级" },
        { "name": "擎羊", "palace": "子女宫", "level": "乙级" },
        { "name": "陀罗", "palace": "疾厄宫", "level": "乙级" },
        { "name": "火星", "palace": "财帛宫", "level": "乙级" },
        { "name": "铃星", "palace": "交友宫", "level": "乙级" }
      ]
    },
    "personalityAnalysis": {
      "coreTraits": [
        "紫微坐命，天生具领导气质，自尊心强，好面子",
        "行事稳重有章法，格局宏大，有主见",
        "地劫同宫，偶有空想虚耗，需防眼高手低"
      ],
      "strengths": ["领导力强，统御能力佳", "责任感重，处事公正", "贵人运强，善借力"],
      "weaknesses": ["刚愎自用，独断专行", "虚荣心重，过度在意形象", "易因空亡星陷入不切实际的幻想"],
      "innerNature": "福德宫破军化权，内心躁动不安分，渴望开创与突破，不甘平庸",
      "outerBehavior": "命宫紫微，外在稳重威严，举止有帝王气度，重视秩序与体面"
    },
    "careerAssessment": {
      "suitableIndustries": ["管理咨询", "金融理财", "体制内/大型企业管理", "文化创意"],
      "careerStyle": "紫微+武曲天府官禄化禄，宜稳健型领导岗，非冒险创业型；擅统筹资源、带团队",
      "peakPeriod": "45-54岁财帛宫大限，武曲化科当令，事业财运双高峰",
      "advice": ["35-44大限宜积累蓄势，勿冒进", "善用天魁天钺贵人，借力上位", "2026流年化忌冲官禄，不宜跳槽创业"]
    },
    "wealthAssessment": {
      "wealthPattern": "财帛武曲天相+化科，求财稳健有名声，天府坐官禄化禄为财库，属正财格局",
      "incomeSource": "正职薪俸+管理理财为主，非偏财横财型",
      "wealthLevel": "中上",
      "riskFactors": ["地劫坐命，易有虚耗破财", "流年化忌冲官禄时收入波动"],
      "advice": ["以正财为本，避免高风险投机", "置产聚财，天府库性宜守不宜散"]
    },
    "healthAssessment": {
      "vulnerableSystems": ["脾胃(紫微土+天同巨门疾厄)", "口腔/呼吸道(巨门落陷)", "心血管(破军福德化权劳心)"],
      "fiveElementBalance": "命宫庚午土金，紫微土旺，巨门水陷疾厄，土克水，脾胃与泌尿消化需调",
      "riskPeriods": ["35-44大限化忌入疾厄，本大限健康为课题", "2026-2027流年疾厄宫受冲"],
      "advice": ["定期检查脾胃与口腔", "避免过度劳心，福德破军化权需适度放松", "健康仅作趋势提示，异常请咨询专业医师"]
    },
    "relationshipAssessment": {
      "marriageProspect": "夫妻宫七杀独坐，感情多变波折，宜晚婚(28岁后)，早婚易离",
      "partnerCharacteristics": "配偶刚强独立，有个性有主见，可能从事军警或竞争性行业",
      "riskFactors": ["七杀坐夫妻主刑克", "地空坐夫妻宫，感情易有空虚失落", "三方杀破狼动星，婚姻不稳"],
      "advice": ["晚婚稳婚，选择包容性强的伴侣", "婚后保持独立空间，避免硬碰硬", "2026-2027感情考验期，多沟通忍让"]
    }
  }
}
```

---

## 五、字段变更记录

本规范为紫微斗数排盘JSON的首版定义，主要字段如下：

| 字段路径 | 说明 |
|---|---|
| `chartType` | 固定值 `"紫微斗数"` |
| `basicInfo` | 基础信息（姓名/性别/公历/农历/真太阳时/出生地） |
| `mingGong` / `shenGong` | 命宫、身宫的宫位与干支 |
| `wuXingJu` | 五行局（水二/木三/金四/土五/火六） |
| `suiXian` | 大限行运方向与起运年龄 |
| `palaces` | 十二宫完整星曜结构（主星/辅星/煞星/杂曜/四化/庙旺/三方四正） |
| `shenGongPosition` | 身宫落于哪一宫 |
| `nianGan` / `nianZhi` | 生年天干、地支 |
| `nianSiHua` | 生年四化（禄权科忌所落主星） |
| `laiYinGong` | 来因宫（生年天干所在宫） |
| `daXianList` | 大限列表（12步，含各步四化） |
| `currentDaXian` / `currentLiuNian` | 当前大限、当前流年 |
| `liuYueList` | 流月列表（可选） |
| `analysis` | 预计算分析结果（含14个子字段） |
| `analysis.mingJuLevel` | 命局层次评分（五维度） |
| `analysis.geJuInfo` | 格局信息（吉凶格局列表+主格+层次） |
| `analysis.starPower` | 星曜力量（命宫主星庙旺与强弱） |
| `analysis.siHuaAnalysis` | 四化分析（生年/大限/流年三层+交互作用） |
| `analysis.palaceAssessment` | 十二宫逐宫评估 |
| `analysis.sanFangSiZheng` | 关键宫三方四正组合分析 |
| `analysis.daXianEvaluations` | 大限预计算评估（四领域评分+关键事件） |
| `analysis.liuNianAssessments` | 流年预计算评估（含关键月份） |
| `analysis.shenShaClassification` | 神煞分类（吉神/凶煞+等级+落宫） |
| `analysis.personalityAnalysis` | 性格分析（核心特质/优劣/内外） |
| `analysis.careerAssessment` | 事业评估 |
| `analysis.wealthAssessment` | 财富评估 |
| `analysis.healthAssessment` | 健康评估 |
| `analysis.relationshipAssessment` | 感情评估 |

---

## 六、字段必填说明

| 层级 | 字段 | 必填条件 |
|---|---|---|
| **必填** | `chartType`, `basicInfo`, `mingGong`, `shenGong`, `wuXingJu`, `suiXian`, `palaces`, `shenGongPosition`, `nianGan`, `nianZhi`, `nianSiHua`, `laiYinGong`, `daXianList` | 基础排盘数据，必须提供 |
| **条件必填** | `currentDaXian` | 命主已到起运年龄时必填，否则为 `null` |
| **条件必填** | `currentLiuNian` | 排盘时指定流年时必填，否则为 `null` |
| **可选** | `liuYueList` | 用户选中流月分析时提供，否则为 `null` |
| **强烈建议** | `analysis` 及其全部14个子字段 | 确保不同模型输出一致性的核心。缺失时模型将按SKILL.md嵌入规则自行计算，可能导致不同模型结论分歧 |

> **`analysis` 最高优先级**：当排盘JSON包含 `analysis` 字段时，其中预计算结果优先于一切规则，模型必须直接使用，不得自行重新计算或推翻。宫位评估必须覆盖全部12宫，大限评估必须覆盖全部12步，流年评估至少覆盖当前大限内关键年份。

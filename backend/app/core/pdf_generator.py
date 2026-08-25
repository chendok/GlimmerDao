"""
基于 fpdf2 的 Markdown → PDF 生成器

独立于 HTML 实现，直接解析 Markdown 内容，使用 fpdf2 原生 API 渲染。
通过可配置样式方案（StyleConfig），精确匹配 HTML 报告视觉效果。

核心架构：
- ReportPDF(FPDF) 子类 → 重写 header()/footer() 确保每页自动绘制页眉页脚
- MarkdownPDFGenerator → 解析 Markdown 并调用 ReportPDF 原生 API 渲染
- 全部手动换页控制（禁用 auto_page_break），避免 fpdf2 自动换页导致的渲染异常
"""

from __future__ import annotations

import re
import math
import logging
from dataclasses import dataclass
from pathlib import Path
from fpdf import FPDF
from typing import Optional

logger = logging.getLogger("uvicorn")

# ── 字体路径 ──
_FONTS_DIR = Path("C:/Windows/Fonts")
_FONT_HEI = _FONTS_DIR / "simhei.ttf"
_FONT_SONG = _FONTS_DIR / "STSONG.TTF"
_FONT_KAI = _FONTS_DIR / "simkai.ttf"

# ── 页面布局常量 ──
PAGE_W_PORTRAIT = 210
PAGE_H_PORTRAIT = 297
PAGE_W_LANDSCAPE = 297
PAGE_H_LANDSCAPE = 210
MARGIN_LEFT = 20
MARGIN_RIGHT = 20
MARGIN_TOP = 25
MARGIN_BOTTOM = 22
CONTENT_WIDTH = PAGE_W_PORTRAIT - MARGIN_LEFT - MARGIN_RIGHT  # 170mm
CONTENT_WIDTH_LANDSCAPE = PAGE_W_LANDSCAPE - MARGIN_LEFT - MARGIN_RIGHT  # 257mm
CONTENT_TOP = MARGIN_TOP + 5   # 正文起始 Y（页眉下方）
CONTENT_BOTTOM = PAGE_H_PORTRAIT - MARGIN_BOTTOM

# fpdf2 字号 → mm 转换系数（1pt ≈ 0.3528mm，但中文实际渲染稍大）
# 通过实测：simhei 10.5pt 的 multi_cell 实际行高 ≈ 字号 * 0.42
PT_TO_MM_FACTOR = 0.42

# CJK 行首禁则字符：这些字符不应出现在行首，宁可溢出到上行末尾
_CJK_NO_LINE_START = set("。，、》）〕］！？；：」』〉】〞〟・｡･ﾟﾞ,.;:!?)]}%")


# ═══════════════════════════════════════════════════════════════
# 样式配置
# ═══════════════════════════════════════════════════════════════

@dataclass
class StyleConfig:
    """PDF 排版样式配置，所有颜色为 (R,G,B) 0-255 元组"""

    # ── 封面标题 ──
    header_title_color: tuple = (44, 62, 80)
    header_border_color: tuple = (91, 140, 192)
    header_meta_color: tuple = (153, 153, 153)

    # ── 标题 ──
    h2_color: tuple = (44, 62, 80)
    h2_bg: tuple = (240, 244, 248)
    h2_border: tuple = (91, 140, 192)
    h3_color: tuple = (68, 68, 68)
    h3_border: tuple = (123, 155, 106)
    h4_color: tuple = (85, 85, 85)

    # ── 正文 ──
    body_color: tuple = (51, 51, 51)
    strong_color: tuple = (44, 62, 80)
    em_color: tuple = (91, 140, 192)

    # ── 表格 ──
    table_header_bg: tuple = (232, 237, 243)
    table_header_color: tuple = (44, 62, 80)
    table_header_border: tuple = (213, 220, 230)
    table_cell_border: tuple = (232, 236, 241)
    table_cell_color: tuple = (51, 51, 51)
    table_alt_row_bg: tuple = (248, 249, 251)

    # ── 引用块 ──
    blockquote_border: tuple = (123, 155, 106)
    blockquote_bg: tuple = (246, 249, 244)
    blockquote_color: tuple = (85, 85, 85)

    # ── 代码块 ──
    pre_bg: tuple = (44, 62, 80)
    pre_color: tuple = (236, 240, 241)

    # ── 行内代码 ──
    inline_code_bg: tuple = (240, 241, 244)
    inline_code_color: tuple = (192, 57, 43)

    # ── 分隔线 ──
    hr_color: tuple = (221, 221, 221)

    # ── 免责声明 ──
    disclaimer_bg: tuple = (254, 249, 239)
    disclaimer_border: tuple = (230, 168, 23)
    disclaimer_color: tuple = (138, 109, 59)

    # ── 页眉页脚 ──
    page_header_color: tuple = (140, 140, 140)
    page_header_line: tuple = (210, 210, 210)

    # ── 链接 ──
    link_color: tuple = (60, 100, 180)

    # ── 字号（pt）── 统一为三档：标题 / 正文 / 表格
    body_size: float = 10.5
    h1_size: float = 18.0
    h2_size: float = 12.0
    h3_size: float = 10.5
    h4_size: float = 10.5
    table_size: float = 10.0
    table_header_size: float = 10.0
    blockquote_size: float = 10.0
    code_size: float = 9.0
    inline_code_size: float = 10.0
    disclaimer_size: float = 9.0
    meta_size: float = 9.0
    page_header_size: float = 8.0

    # ── 行距乘数（相对于 PT_TO_MM_FACTOR） ──
    body_line_mult: float = 1.35     # 10.5pt → 10.5*0.42*1.35 ≈ 5.95mm
    table_line_mult: float = 1.2     # 9pt → 9*0.42*1.2 ≈ 4.54mm
    blockquote_line_mult: float = 1.25
    code_line_mult: float = 1.1
    list_line_mult: float = 1.3

    # ── 段间距（mm）── 统一规范，所有块级元素间距一致
    para_spacing: float = 2.5
    h1_spacing_before: float = 8.0
    h2_spacing_before: float = 6.0
    h3_spacing_before: float = 4.0
    h4_spacing_before: float = 3.0
    heading_spacing_after: float = 2.5   # 标题后间距（与 para_spacing 一致）
    hr_spacing: float = 4.0
    list_spacing: float = 2.0            # 列表项之间间距（略紧于段落间距）
    table_spacing_before: float = 2.5    # 表格前间距（与 para_spacing 一致）
    table_spacing_after: float = 2.5     # 表格后间距（与 para_spacing 一致）

    # ── 标题内边距（mm） ──
    h2_padding_v: float = 3.5      # h2 上下内边距
    h3_padding_v: float = 2.0      # h3 上下内边距
    h2_indent_left: float = 8.0    # h2 文字左侧缩进
    h3_indent_left: float = 6.0    # h3 文字左侧缩进

    def line_height(self, font_size: float, mult: float) -> float:
        """计算行高（mm）"""
        return font_size * PT_TO_MM_FACTOR * mult


# ── 预设样式 ──

STYLE_BAZI = StyleConfig(
    header_title_color=(44, 62, 80),
    header_border_color=(91, 140, 192),
    h2_color=(44, 62, 80),
    h2_bg=(240, 244, 248),
    h2_border=(91, 140, 192),
    h3_color=(68, 68, 68),
    h3_border=(123, 155, 106),
    h4_color=(85, 85, 85),
    body_color=(51, 51, 51),
    strong_color=(44, 62, 80),
    em_color=(91, 140, 192),
    table_header_bg=(232, 237, 243),
    table_header_color=(44, 62, 80),
    table_header_border=(213, 220, 230),
    table_cell_border=(232, 236, 241),
    table_cell_color=(51, 51, 51),
    table_alt_row_bg=(248, 249, 251),
    blockquote_border=(123, 155, 106),
    blockquote_bg=(246, 249, 244),
    blockquote_color=(85, 85, 85),
    pre_bg=(44, 62, 80),
    pre_color=(236, 240, 241),
    inline_code_bg=(240, 241, 244),
    inline_code_color=(192, 57, 43),
    hr_color=(221, 221, 221),
    disclaimer_bg=(254, 249, 239),
    disclaimer_border=(230, 168, 23),
    disclaimer_color=(138, 109, 59),
    page_header_color=(140, 140, 140),
    page_header_line=(210, 210, 210),
)

STYLE_MAYI = StyleConfig(
    header_title_color=(74, 55, 40),
    header_border_color=(139, 115, 85),
    h2_color=(74, 55, 40),
    h2_bg=(245, 240, 232),
    h2_border=(139, 115, 85),
    h3_color=(85, 85, 85),
    h3_border=(160, 135, 106),
    h4_color=(85, 85, 85),
    body_color=(51, 51, 51),
    strong_color=(74, 55, 40),
    em_color=(139, 115, 85),
    table_header_bg=(237, 227, 213),
    table_header_color=(74, 55, 40),
    table_header_border=(213, 200, 181),
    table_cell_border=(232, 221, 208),
    table_cell_color=(51, 51, 51),
    table_alt_row_bg=(250, 247, 243),
    blockquote_border=(160, 135, 106),
    blockquote_bg=(248, 244, 240),
    blockquote_color=(85, 85, 85),
    pre_bg=(62, 53, 46),
    pre_color=(245, 240, 232),
    inline_code_bg=(242, 237, 231),
    inline_code_color=(139, 69, 19),
    hr_color=(221, 221, 221),
    disclaimer_bg=(254, 249, 239),
    disclaimer_border=(230, 168, 23),
    disclaimer_color=(138, 109, 59),
    page_header_color=(160, 140, 120),
    page_header_line=(210, 205, 195),
)

STYLE_DEFAULT = STYLE_BAZI

_STYLE_MAP = {
    "八字": STYLE_BAZI, "bazi": STYLE_BAZI, "四柱八字": STYLE_BAZI,
    "麻衣神相": STYLE_MAYI, "mayi": STYLE_MAYI, "面相": STYLE_MAYI, "手相": STYLE_MAYI,
    "紫微": STYLE_BAZI, "紫微斗数": STYLE_BAZI, "ziwei": STYLE_BAZI,
    "黄历择吉": STYLE_BAZI, "huangli": STYLE_BAZI,
}


def get_style(chart_type: str) -> StyleConfig:
    return _STYLE_MAP.get(chart_type, STYLE_DEFAULT)


# ═══════════════════════════════════════════════════════════════
# FPDF 子类 — 自动页眉/页脚
# ═══════════════════════════════════════════════════════════════

class ReportPDF(FPDF):
    """自定义 PDF 类，重写 header()/footer() 实现每页自动绘制页眉页脚"""

    def __init__(self, generator: "MarkdownPDFGenerator"):
        super().__init__(orientation="P", unit="mm", format="A4")
        self._gen = generator
        # 禁用 auto_page_break，全部由 MarkdownPDFGenerator._check_space() 手动控制
        # 这避免了 fpdf2 自动换页与自定义 header/footer 之间的冲突
        self.set_auto_page_break(auto=False)
        self.set_left_margin(MARGIN_LEFT)
        self.set_right_margin(MARGIN_RIGHT)
        self.set_top_margin(CONTENT_TOP)

    def header(self):
        """每页自动绘制页眉（add_page 时由 fpdf2 自动调用）"""
        if not self._gen or self.page_no() == 1:
            return  # 第一页用封面头，后续页用页眉
        s = self._gen.style
        self.set_font(self._gen._font_hei(), "", s.page_header_size)
        self.set_text_color(*s.page_header_color)

        title_text = self._gen.title[:35]
        # 动态内容宽度：根据当前页面尺寸计算（兼容横向页面）
        dyn_content_w = self.w - MARGIN_LEFT - MARGIN_RIGHT
        self.set_y(MARGIN_TOP - 10)

        if self._gen.date_str:
            # 标题靠左，日期靠右，各占一半宽度不重叠
            half_w = dyn_content_w / 2
            self.set_x(MARGIN_LEFT)
            self.cell(half_w, 5, title_text, align="L")
            self.set_font(self._gen._font_song(), "", s.page_header_size)
            self.set_x(MARGIN_LEFT + half_w)
            self.cell(half_w, 5, self._gen.date_str, align="R")
        else:
            self.set_x(MARGIN_LEFT)
            self.cell(dyn_content_w, 5, title_text, align="L")

        # 分隔线
        self.set_y(MARGIN_TOP - 2)
        self.set_draw_color(*s.page_header_line)
        self.set_line_width(0.3)
        self.line(MARGIN_LEFT, self.get_y(),
                  self.w - MARGIN_RIGHT, self.get_y())

    def footer(self):
        """每页自动绘制页脚"""
        if not self._gen:
            return
        s = self._gen.style
        self.set_y(-MARGIN_BOTTOM + 6)
        self.set_font(self._gen._font_song(), "", s.page_header_size)
        self.set_text_color(*s.page_header_color)
        dyn_content_w = self.w - MARGIN_LEFT - MARGIN_RIGHT
        self.cell(dyn_content_w, 5, f"第 {self.page_no()} 页", align="C")


# ═══════════════════════════════════════════════════════════════
# Markdown → PDF 生成器
# ═══════════════════════════════════════════════════════════════

class MarkdownPDFGenerator:
    """Markdown 到 PDF 的转换器"""

    def __init__(
        self,
        title: str = "解盘报告",
        date_str: str = "",
        chart_type: str = "",
        chart_name: str = "",
        skill_name: str = "",
        style: Optional[StyleConfig] = None,
    ):
        self.title = title
        self.date_str = date_str
        self.chart_type = chart_type
        self.chart_name = chart_name
        self.skill_name = skill_name
        self.style = style or get_style(chart_type)

        self.pdf = ReportPDF(self)
        self._register_fonts()

        # 表格状态
        self._in_table = False
        self._table_cols: list[float] = []
        self._table_header: list[str] = []
        self._table_rows: list[list[str]] = []
        self._table_aligns: list[str] = []

        # 是否已渲染封面头
        self._cover_rendered = False

        # 是否禁止 _write_inline_text 内部触发换页（表格单元格渲染时启用）
        self._suppress_page_break = False

    # ── 字体 ──

    def _register_fonts(self):
        for name, path in [("simhei", _FONT_HEI), ("simsong", _FONT_SONG), ("simkai", _FONT_KAI)]:
            if path.exists():
                self.pdf.add_font(name, "", str(path))
            else:
                logger.warning("字体未找到: %s", path)

    def _has_font(self, name: str) -> bool:
        return name.lower() in getattr(self.pdf, "fonts", {})

    def _font_hei(self) -> str:
        return "simhei" if self._has_font("simhei") else "helvetica"

    def _font_song(self) -> str:
        return "simsong" if self._has_font("simsong") else "helvetica"

    def _font_kai(self) -> str:
        return "simkai" if self._has_font("simkai") else self._font_song()

    # ── 辅助：文本宽度与行数计算 ──

    def _text_width(self, text: str, font: str, size: float) -> float:
        """计算文本在指定字体和字号下的宽度（mm）"""
        self.pdf.set_font(font, "", size)
        return self.pdf.get_string_width(text)

    def _strip_inline_markdown(self, text: str) -> str:
        """去除行内 Markdown 标记，用于估算纯文本宽度"""
        return re.sub(r'\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\)', r'\1\2\3\4', text)

    def _text_lines(self, text: str, font: str, size: float, max_w: float) -> int:
        """计算文本在指定宽度下需要的行数"""
        if max_w <= 0:
            return 1
        w = self._text_width(text, font, size)
        if w <= max_w:
            return 1
        return max(1, int(w / max_w) + 1)

    def _estimate_para_height(self, text: str, font: str, size: float,
                               line_height: float, max_w: float = CONTENT_WIDTH) -> float:
        """估算段落渲染所需高度（mm）"""
        lines = self._text_lines(text, font, size, max_w)
        return lines * line_height + 2  # +2mm 余量

    # ── 换页控制 ──

    def _check_space(self, needed_mm: float):
        """检查剩余空间，不足则手动换页。
        
        由于禁用了 auto_page_break，所有换页都由本方法控制。
        在渲染任何块级元素前调用，确保内容不会被截断。
        使用 self.pdf.h 动态获取当前页面高度，兼容横向页面。
        """
        effective_bottom = self.pdf.h - MARGIN_BOTTOM
        if self.pdf.get_y() + needed_mm > effective_bottom:
            self.pdf.add_page()

    def _ensure_space(self, needed_mm: float):
        """确保有足够空间，不足则换页并返回新页起始 Y"""
        self._check_space(needed_mm)
        return self.pdf.get_y()

    # ── 行内格式 ──

    def _parse_inline(self, text: str) -> list[dict]:
        """解析行内 Markdown：**加粗**、*斜体*、`代码`、[链接](url)"""
        segments: list[dict] = []
        pattern = re.compile(
            r'(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))'
        )
        last_end = 0
        for m in pattern.finditer(text):
            if m.start() > last_end:
                segments.append({"text": text[last_end:m.start()], "style": ""})
            if m.group(2) is not None:
                segments.append({"text": m.group(2), "style": "B"})
            elif m.group(3) is not None:
                segments.append({"text": m.group(3), "style": "I"})
            elif m.group(4) is not None:
                segments.append({"text": m.group(4), "style": "code"})
            elif m.group(5) is not None:
                segments.append({"text": m.group(5), "style": "link", "url": m.group(6)})
            last_end = m.end()
        if last_end < len(text):
            segments.append({"text": text[last_end:], "style": ""})
        if not segments:
            segments.append({"text": text, "style": ""})
        return segments

    def _write_styled_text(
        self, text: str, font: str, size: float, color: tuple,
        line_height: float, max_w: float = CONTENT_WIDTH
    ):
        """写入一段带样式的文本（单一样式，使用 multi_cell）"""
        self.pdf.set_font(font, "", size)
        self.pdf.set_text_color(*color)
        self.pdf.set_x(MARGIN_LEFT)
        self.pdf.multi_cell(max_w, line_height, text, align="L")

    def _apply_inline_style(self, style: str, font_size: float):
        """根据行内样式设置字体和颜色，返回实际使用的 line_height 调整因子"""
        s = self.style
        if style == "B":
            self.pdf.set_font(self._font_hei(), "", font_size)
            self.pdf.set_text_color(*s.strong_color)
            return 1.0
        elif style == "I":
            self.pdf.set_font(self._font_song(), "", font_size)
            self.pdf.set_text_color(*s.em_color)
            return 1.0
        elif style == "code":
            self.pdf.set_font(self._font_song(), "", s.inline_code_size)
            self.pdf.set_text_color(*s.inline_code_color)
            return 1.0
        elif style == "link":
            self.pdf.set_font(self._font_song(), "", font_size)
            self.pdf.set_text_color(*s.link_color)
            return 1.0
        else:
            self.pdf.set_font(self._font_song(), "", font_size)
            self.pdf.set_text_color(*s.body_color)
            return 1.0

    def _write_inline_text(
        self, text: str, x: float, y: float, max_w: float, line_h: float,
        font_size: float, align: str = "L"
    ) -> float:
        """在指定区域内渲染带行内格式的文本，返回最终 Y 坐标（文本底部）。

        支持 **加粗**、*斜体*、`代码`、[链接](url) 等行内格式。
        文本自动换行，遇页面底部自动换页。
        
        使用 set_char_spacing(0.3pt) 为字符间添加微小间距，防止 CJK 字体
        渲染时因字体度量精度问题导致的字符边界重叠。
        
        中英文混排时，英文单词作为整体处理，避免在单词中间断行。
        """
        s = self.style
        segments = self._parse_inline(text)
        max_x = x + max_w
        self.pdf.set_xy(x, y)
        start_x = x

        self.pdf.set_char_spacing(0.3)

        for seg in segments:
            t = seg["text"]
            style = seg.get("style", "")
            self._apply_inline_style(style, font_size)

            # 将文本拆分为 token 序列：CJK 字符逐个处理，拉丁单词作为整体
            tokens = self._tokenize_for_wrap(t)
            for token in tokens:
                token_w = self.pdf.get_string_width(token)
                # 如果当前行放不下整个 token，先换行
                if self.pdf.get_x() + token_w > max_x and self.pdf.get_x() > start_x + 0.1:
                    if not self._suppress_page_break and self.pdf.get_y() + line_h * 2 > self.pdf.h - MARGIN_BOTTOM:
                        self.pdf.add_page()
                        self._apply_inline_style(style, font_size)
                    # 注意：ln() 会将 x 重置为左边距，必须在 ln() 之后重新 set_x
                    self.pdf.ln(line_h)
                    self.pdf.set_x(start_x)
                # 渲染 token（单个 CJK 字符或完整拉丁单词）
                for char in token:
                    cw = self.pdf.get_string_width(char)
                    if self.pdf.get_x() + cw > max_x:
                        # CJK 行首禁则：标点符号不应出现在行首，宁可溢出到上行末尾
                        if char in _CJK_NO_LINE_START and self.pdf.get_x() > start_x + 0.1:
                            pass  # 允许溢出，不换行
                        else:
                            if not self._suppress_page_break and self.pdf.get_y() + line_h * 2 > self.pdf.h - MARGIN_BOTTOM:
                                self.pdf.add_page()
                                self._apply_inline_style(style, font_size)
                            # 注意：ln() 会将 x 重置为左边距，必须在 ln() 之后重新 set_x
                            self.pdf.ln(line_h)
                            self.pdf.set_x(start_x)
                    self.pdf.cell(cw, line_h, char)

        # 注意：ln() 会将 x 重置为左边距，必须在 ln() 之后重新 set_x
        self.pdf.ln(line_h)
        self.pdf.set_x(start_x)

        self.pdf.set_char_spacing(0)

        self.pdf.set_font(self._font_song(), "", font_size)
        self.pdf.set_text_color(*s.body_color)
        return self.pdf.get_y()

    @staticmethod
    def _tokenize_for_wrap(text: str) -> list[str]:
        """将文本拆分为换行友好的 token 序列。
        
        - CJK 字符（含中文、日文、韩文）：每个字符一个 token
        - 拉丁字母/数字序列：连续字母数字作为一个 token（单词）
        - 空格/标点：每个字符一个 token
        """
        tokens = []
        buf = ""
        for ch in text:
            # 判断是否为拉丁字母或数字
            is_latin = ch.isascii() and (ch.isalnum() or ch in "'-")
            if is_latin:
                buf += ch
            else:
                if buf:
                    tokens.append(buf)
                    buf = ""
                tokens.append(ch)
        if buf:
            tokens.append(buf)
        return tokens

    def _write_inline_paragraph(self, text: str, font_size: float, line_height: float):
        """渲染带行内格式的段落（全宽），支持自动换行和换页"""
        self._write_inline_text(
            text, MARGIN_LEFT, self.pdf.get_y(), CONTENT_WIDTH, line_height, font_size
        )

    # ── 标题 ──

    def _render_heading(self, text: str, level: int):
        level = max(1, min(level, 4))
        if level == 1:
            self._render_h1(text)
        elif level == 2:
            self._render_h2(text)
        elif level == 3:
            self._render_h3(text)
        else:
            self._render_h4(text)

    def _render_h1(self, text: str):
        s = self.style
        self.pdf.ln(s.h1_spacing_before)
        self._check_space(20)
        self.pdf.set_font(self._font_hei(), "", s.h1_size)
        self.pdf.set_text_color(*s.header_title_color)
        self.pdf.cell(CONTENT_WIDTH, 10, text, align="C")
        self.pdf.ln(12)
        # 装饰线
        line_y = self.pdf.get_y()
        line_w = CONTENT_WIDTH * 0.6
        line_x = MARGIN_LEFT + (CONTENT_WIDTH - line_w) / 2
        self.pdf.set_draw_color(*s.header_border_color)
        self.pdf.set_line_width(0.8)
        self.pdf.line(line_x, line_y, line_x + line_w, line_y)
        self.pdf.ln(6)

    def _heading_block_height(self, text: str, font_size: float, padding_v: float,
                               indent_left: float) -> float:
        """计算标题块的总高度（背景 + 边框 + 文字）"""
        avail_w = CONTENT_WIDTH - indent_left - 4  # 文字可用宽度
        line_h = font_size * PT_TO_MM_FACTOR * 1.4  # 标题行高稍大
        lines = self._text_lines(text, self._font_hei(), font_size, avail_w)
        return lines * line_h + padding_v * 2

    def _render_h2(self, text: str):
        """h2：带背景色 + 粗左边框，精确计算高度避免截断"""
        s = self.style
        self.pdf.ln(s.h2_spacing_before)

        block_h = self._heading_block_height(text, s.h2_size, s.h2_padding_v, s.h2_indent_left)
        self._check_space(block_h + 4)
        start_y = self.pdf.get_y()

        # 背景
        self.pdf.set_fill_color(*s.h2_bg)
        self.pdf.set_draw_color(*s.h2_bg)
        self.pdf.rect(MARGIN_LEFT, start_y, CONTENT_WIDTH, block_h, style="DF")

        # 左边框
        self.pdf.set_draw_color(*s.h2_border)
        self.pdf.set_line_width(1.5)
        self.pdf.line(MARGIN_LEFT + 2, start_y + 1, MARGIN_LEFT + 2, start_y + block_h - 1)

        # 标题文本
        line_h = s.h2_size * PT_TO_MM_FACTOR * 1.4
        text_x = MARGIN_LEFT + s.h2_indent_left
        text_y = start_y + s.h2_padding_v
        text_w = CONTENT_WIDTH - s.h2_indent_left - 4
        self.pdf.set_xy(text_x, text_y)
        self.pdf.set_font(self._font_hei(), "", s.h2_size)
        self.pdf.set_text_color(*s.h2_color)
        self.pdf.multi_cell(text_w, line_h, text, align="L")

        self.pdf.set_y(start_y + block_h + s.heading_spacing_after)
        self.pdf.set_text_color(*s.body_color)

    def _render_h3(self, text: str):
        """h3：带细左边框，精确计算高度"""
        s = self.style
        self.pdf.ln(s.h3_spacing_before)

        block_h = self._heading_block_height(text, s.h3_size, s.h3_padding_v, s.h3_indent_left)
        self._check_space(block_h + 2)
        start_y = self.pdf.get_y()

        # 左边框
        self.pdf.set_draw_color(*s.h3_border)
        self.pdf.set_line_width(1.0)
        self.pdf.line(MARGIN_LEFT + 2, start_y + 1, MARGIN_LEFT + 2, start_y + block_h - 1)

        # 标题文本
        line_h = s.h3_size * PT_TO_MM_FACTOR * 1.4
        text_x = MARGIN_LEFT + s.h3_indent_left
        text_y = start_y + s.h3_padding_v
        text_w = CONTENT_WIDTH - s.h3_indent_left - 4
        self.pdf.set_xy(text_x, text_y)
        self.pdf.set_font(self._font_hei(), "", s.h3_size)
        self.pdf.set_text_color(*s.h3_color)
        self.pdf.multi_cell(text_w, line_h, text, align="L")

        self.pdf.set_y(start_y + block_h + s.heading_spacing_after)
        self.pdf.set_text_color(*s.body_color)

    def _render_h4(self, text: str):
        s = self.style
        self.pdf.ln(s.h4_spacing_before)
        line_h = s.h4_size * PT_TO_MM_FACTOR * 1.4
        self._check_space(line_h * 2)
        self._write_styled_text(
            text, self._font_hei(), s.h4_size, s.h4_color, line_h
        )
        self.pdf.ln(s.heading_spacing_after)
        self.pdf.set_text_color(*s.body_color)

    # ── 段落 ──

    def _render_paragraph(self, text: str):
        s = self.style
        if not text.strip():
            self.pdf.ln(3)
            return
        line_h = s.line_height(s.body_size, s.body_line_mult)
        est_h = self._estimate_para_height(text, self._font_song(), s.body_size, line_h)
        self._check_space(est_h)
        self._write_inline_paragraph(text, s.body_size, line_h)
        self.pdf.ln(s.para_spacing)

    # ── 分隔线 ──

    def _render_horizontal_rule(self):
        s = self.style
        self.pdf.ln(s.hr_spacing)
        self._check_space(4)
        y = self.pdf.get_y()
        self.pdf.set_draw_color(*s.hr_color)
        self.pdf.set_line_width(0.4)
        self.pdf.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y)
        self.pdf.ln(s.hr_spacing)

    # ── 引用块 ──

    def _render_blockquote(self, text: str):
        s = self.style
        self.pdf.ln(2)
        line_h = s.line_height(s.blockquote_size, s.blockquote_line_mult)
        est_h = self._estimate_para_height(text, self._font_song(), s.blockquote_size, line_h,
                                            CONTENT_WIDTH - 9)
        self._check_space(est_h + 4)

        start_y = self.pdf.get_y()
        border_x = MARGIN_LEFT + 3

        # 使用行内格式解析渲染引用文本
        end_y = self._write_inline_text(
            text, MARGIN_LEFT + 9, start_y,
            CONTENT_WIDTH - 9, line_h, s.blockquote_size
        )

        # 背景填充（细密横线模拟背景色）
        self.pdf.set_draw_color(*s.blockquote_bg)
        self.pdf.set_line_width(0.06)
        step = 0.5
        cy = start_y
        while cy < end_y:
            self.pdf.line(border_x, cy, MARGIN_LEFT + CONTENT_WIDTH, cy)
            cy += step

        # 左边框
        self.pdf.set_draw_color(*s.blockquote_border)
        self.pdf.set_line_width(1.2)
        self.pdf.line(border_x, start_y, border_x, end_y)

        self.pdf.set_text_color(*s.body_color)
        self.pdf.ln(3)

    # ── 代码块 ──

    def _render_code_block(self, lines: list[str]):
        s = self.style
        self.pdf.ln(2)
        line_h = s.line_height(s.code_size, s.code_line_mult)
        est_h = len(lines) * line_h + 6
        self._check_space(est_h)

        code_text = "\n".join(lines)
        start_y = self.pdf.get_y()

        self.pdf.set_font(self._font_song(), "", s.code_size)
        self.pdf.set_text_color(*s.pre_color)
        self.pdf.set_x(MARGIN_LEFT + 4)
        self.pdf.multi_cell(CONTENT_WIDTH - 8, line_h, code_text, align="L")
        end_y = self.pdf.get_y()

        # 深色背景
        self.pdf.set_draw_color(*s.pre_bg)
        self.pdf.set_line_width(0.06)
        step = 0.5
        cy = start_y
        while cy < end_y:
            self.pdf.line(MARGIN_LEFT, cy, MARGIN_LEFT + CONTENT_WIDTH, cy)
            cy += step

        self.pdf.set_text_color(*s.body_color)
        self.pdf.ln(3)

    # ── 列表 ──

    def _render_list_item(self, text: str, ordered: bool = False, index: int = 0):
        s = self.style
        prefix = f"{index}. " if ordered else "• "
        prefix_w = self._text_width(prefix, self._font_song(), s.body_size) + 2
        indent = 5
        text_w = CONTENT_WIDTH - indent - prefix_w
        line_h = s.line_height(s.body_size, s.list_line_mult)

        est_h = self._estimate_para_height(text, self._font_song(), s.body_size, line_h, text_w)
        self._check_space(est_h + 2)

        self.pdf.set_font(self._font_song(), "", s.body_size)
        self.pdf.set_text_color(*s.body_color)

        self.pdf.set_x(MARGIN_LEFT + indent)
        self.pdf.cell(prefix_w, line_h, prefix)

        # 使用行内格式解析渲染列表文本
        self._write_inline_text(
            text, MARGIN_LEFT + indent + prefix_w, self.pdf.get_y(),
            text_w, line_h, s.body_size
        )
        self.pdf.ln(s.list_spacing)

    # ── 表格 ──

    def _draw_table_row(self, cells: list[str], is_header: bool, row_idx: int,
                         cols: list[float], header: list[str],
                         aligns: list[str]) -> float:
        """绘制单行表格，返回该行实际高度（mm）。
        
        作为独立方法（非嵌套函数），便于递归调用表头重复。
        跨页时自动在重复表头下方添加细分隔线，与第一页表头区分。
        """
        s = self.style
        font = self._font_hei() if is_header else self._font_song()
        size = s.table_header_size if is_header else s.table_size
        line_h = s.line_height(size, s.table_line_mult)

        # 计算每列需要的行数（去除 ** 标记后估算，考虑 0.3pt 字符间距）
        # 字符间距会让每个字符额外增加 0.3pt * 0.3528 ≈ 0.106mm 宽度
        # get_string_width 不包含 char_spacing，需手动补偿
        char_spacing_mm = 0.3 * 0.3528
        cell_lines = []
        max_lines = 1
        # 宽表（8+列）使用更小内边距（3mm），最大化可用文字宽度
        num_cells = len(cells)
        if num_cells >= 8:
            cell_padding = 3
        elif num_cells >= 6:
            cell_padding = 4
        else:
            cell_padding = 4
        for i, cell_text in enumerate(cells):
            col_w = cols[i] if i < len(cols) else cols[-1]
            clean_text = self._strip_inline_markdown(cell_text)
            char_count = len(clean_text)
            effective_w = self._text_width(clean_text, font, size) + char_count * char_spacing_mm
            avail_w = max(col_w - cell_padding, 8)
            lines = math.ceil(effective_w / avail_w) if effective_w > avail_w else 1
            cell_lines.append(lines)
            max_lines = max(max_lines, lines)

        effective_h = max_lines * line_h + cell_padding  # 上下内边距

        # 跨页检测：如果当前行放不下，换页并重复表头
        is_repeated_header = False
        if self.pdf.get_y() + effective_h > self.pdf.h - MARGIN_BOTTOM:
            self.pdf.add_page()
            if not is_header:
                # 重复表头（递归调用，但表头行不应再触发换页）
                # 表头高度可能不同于数据行，重新计算
                header_h = self._draw_table_row(header, is_header=True, row_idx=-1,
                                     cols=cols, header=header, aligns=aligns)
                # 在重复表头下方添加细分隔线，与第一页表头区分
                sep_y = self.pdf.get_y()
                self.pdf.set_draw_color(*s.table_header_border)
                self.pdf.set_line_width(0.5)
                self.pdf.line(MARGIN_LEFT, sep_y, MARGIN_LEFT + sum(cols), sep_y)
                self.pdf.set_line_width(0.2)  # 恢复默认线宽
                is_repeated_header = True

        y_before = self.pdf.get_y()

        # 背景色
        if is_header:
            bg = s.table_header_bg
        elif row_idx % 2 == 0:
            bg = s.table_alt_row_bg
        else:
            bg = (255, 255, 255)

        # 绘制每个单元格
        x_start = MARGIN_LEFT
        self._suppress_page_break = True  # 禁止单元格内换页，由行级 _draw_table_row 统一管理
        for i, cell_text in enumerate(cells):
            col_w = cols[i] if i < len(cols) else cols[-1]
            align = aligns[i] if i < len(aligns) else "L"

            border_color = s.table_header_border if is_header else s.table_cell_border
            self.pdf.set_fill_color(*bg)
            self.pdf.set_draw_color(*border_color)
            self.pdf.rect(x_start, y_before, col_w, effective_h, style="DF")

            # 表头：黑体加粗，无 ** 标记；数据行：使用行内格式解析
            if is_header:
                self.pdf.set_font(self._font_hei(), "", size)
                self.pdf.set_text_color(*s.table_header_color)
                self.pdf.set_xy(x_start + 2, y_before + 1.5)
                # 表头已由 Markdown ** 标记，需解析行内格式
                self._write_inline_text(
                    cell_text, x_start + 2, y_before + 1.5,
                    col_w - 4, line_h, size
                )
            else:
                # 数据行：解析行内格式（**加粗**、*斜体*等）
                self._write_inline_text(
                    cell_text, x_start + 2, y_before + 1.5,
                    col_w - 4, line_h, size
                )
            x_start += col_w
        self._suppress_page_break = False

        self.pdf.set_xy(MARGIN_LEFT, y_before + effective_h)
        return effective_h

    def _render_table(self):
        """渲染表格：支持跨页 + 表头重复 + 交替行色 + 垂直居中

        所有表格统一使用竖版页面渲染。对于宽表（7+ 列），通过智能列宽
        分配和字号调整在竖版页面内适配，确保页面方向一致性。
        """
        s = self.style
        if not self._table_header:
            return

        self.pdf.ln(s.table_spacing_before)
        cols = self._table_cols
        header = self._table_header
        rows = self._table_rows
        aligns = self._table_aligns or ["L"] * len(cols)

        # 确保列宽有效
        if not cols or sum(cols) <= 0:
            cols = self._calculate_table_cols(header, rows)
            self._table_cols = cols

        # 宽表适配：列数 ≥ 7 时，按比例压缩列宽到竖版内容宽度内
        total_w = sum(cols)
        if total_w > CONTENT_WIDTH:
            scale = CONTENT_WIDTH / total_w
            cols = [max(15, w * scale) for w in cols]
            self._table_cols = cols

        # 估算表格总高度，提前检查是否需要换页
        line_h = s.line_height(s.table_size, s.table_line_mult)
        est_header_h = max(1, max(
            self._text_lines(c, self._font_hei(), s.table_header_size, max(w - 4, 10))
            for c, w in zip(header, cols)
        )) * line_h + 3
        est_total = est_header_h + sum(
            max(1, max(
                self._text_lines(c, self._font_song(), s.table_size, max(w - 4, 10))
                for c, w in zip(row, cols)
            )) * line_h + 3
            for row in rows
        )

        # 如果表格总高度超过一页的 80%，表头前先确保有足够空间
        effective_bottom = self.pdf.h - MARGIN_BOTTOM
        if est_total > (effective_bottom - CONTENT_TOP) * 0.8:
            self._check_space(est_header_h + 10)

        # 表头
        self._draw_table_row(header, is_header=True, row_idx=-1,
                             cols=cols, header=header, aligns=aligns)

        # 数据行
        for idx, row in enumerate(rows):
            self._draw_table_row(row, is_header=False, row_idx=idx,
                                 cols=cols, header=header, aligns=aligns)

        self.pdf.ln(s.table_spacing_after)
        self._reset_table()

    def _reset_table(self):
        self._in_table = False
        self._table_cols = []
        self._table_header = []
        self._table_rows = []
        self._table_aligns = []

    def _parse_table_row(self, line: str) -> list[str]:
        line = line.strip()
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        return [c.strip() for c in line.split("|")]

    def _is_separator_row(self, line: str) -> bool:
        return bool(re.match(r'^\|?[\s\-:|]+\|?$', line.strip()))

    def _parse_aligns(self, sep_line: str) -> list[str]:
        aligns = []
        for c in self._parse_table_row(sep_line):
            c = c.strip()
            if c.startswith(":") and c.endswith(":"):
                aligns.append("C")
            elif c.endswith(":"):
                aligns.append("R")
            else:
                aligns.append("L")
        return aligns

    def _calculate_table_cols(self, header: list[str], rows: list[list[str]]) -> list[float]:
        """智能计算表格列宽：基于内容宽度按比例分配，保证最小列宽

        宽表策略（列数 ≥ 6）：
        - 降低最小列宽（12mm），让长内容列获得更多空间
        - 按内容比例分配，短内容列窄、长内容列宽
        """
        if not header:
            return []

        num_cols = len(header)

        # 计算每列最大文本宽度（包含表头和数据行）
        all_rows = [header] + rows
        col_widths = [0.0] * num_cols

        for row in all_rows:
            for i, cell in enumerate(row):
                if i < len(col_widths):
                    # 使用表头字体（黑体）测表头，数据字体（宋体）测数据
                    font = self._font_hei() if row is header else self._font_song()
                    size = self.style.table_header_size if row is header else self.style.table_size
                    w = self._text_width(cell, font, size)
                    col_widths[i] = max(col_widths[i], w)

        # 为每列增加内边距（左右各 2mm = 4mm）
        col_widths = [w + 4 for w in col_widths]

        total_w = sum(col_widths)
        if total_w <= 0:
            return [CONTENT_WIDTH / max(num_cols, 1)] * max(num_cols, 1)

        # 根据列数动态调整最小列宽
        if num_cols >= 8:
            min_col_w = 12.0   # 8+ 列：最小 12mm
        elif num_cols >= 6:
            min_col_w = 15.0   # 6-7 列：最小 15mm
        else:
            min_col_w = 20.0   # 5 列以下：最小 20mm

        # 如果总宽度在内容宽度内，按比例放大
        if total_w <= CONTENT_WIDTH:
            scale = CONTENT_WIDTH / total_w
            return [max(min_col_w, w * scale) for w in col_widths]

        # 总宽度超出，需要压缩
        cols = []
        # 为每列预留最小宽度
        reserved = min_col_w * num_cols
        if reserved >= CONTENT_WIDTH:
            # 列太多，均分
            return [CONTENT_WIDTH / num_cols] * num_cols

        extra = CONTENT_WIDTH - reserved
        # 按超出部分的比例分配额外空间
        overflows = [max(0, w - min_col_w) for w in col_widths]
        total_overflow = sum(overflows)
        if total_overflow <= 0:
            return [CONTENT_WIDTH / num_cols] * num_cols

        for i, w in enumerate(col_widths):
            col_w = min_col_w + (overflows[i] / total_overflow) * extra
            cols.append(col_w)

        return cols

    def _flush_table(self):
        if self._in_table and self._table_header:
            if not self._table_cols:
                self._table_cols = self._calculate_table_cols(
                    self._table_header, self._table_rows
                )
            self._render_table()

    # ── 免责声明 ──

    def _render_disclaimer(self, text: str):
        s = self.style
        self.pdf.ln(6)
        line_h = s.line_height(s.disclaimer_size, s.body_line_mult)
        est_h = self._estimate_para_height(text, self._font_song(), s.disclaimer_size, line_h,
                                            CONTENT_WIDTH - 9)
        self._check_space(est_h + 8)

        start_y = self.pdf.get_y()
        border_x = MARGIN_LEFT + 3

        self.pdf.set_font(self._font_hei(), "", s.disclaimer_size)
        self.pdf.set_text_color(*s.disclaimer_color)
        self.pdf.set_x(MARGIN_LEFT + 9)
        self.pdf.multi_cell(CONTENT_WIDTH - 9, line_h, text, align="L")
        end_y = self.pdf.get_y()

        self.pdf.set_draw_color(*s.disclaimer_bg)
        self.pdf.set_line_width(0.06)
        step = 0.5
        cy = start_y
        while cy < end_y:
            self.pdf.line(border_x, cy, MARGIN_LEFT + CONTENT_WIDTH, cy)
            cy += step

        self.pdf.set_draw_color(*s.disclaimer_border)
        self.pdf.set_line_width(1.5)
        self.pdf.line(border_x, start_y, border_x, end_y)

        self.pdf.set_text_color(*s.body_color)
        self.pdf.ln(4)

    # ── 封面 ──

    def _render_report_header(self):
        """首页封面头"""
        s = self.style
        self._cover_rendered = True

        self.pdf.set_font(self._font_hei(), "", s.h1_size)
        self.pdf.set_text_color(*s.header_title_color)
        self.pdf.ln(8)
        self.pdf.cell(CONTENT_WIDTH, 10, self.title, align="C")
        self.pdf.ln(12)

        # 装饰线
        line_y = self.pdf.get_y()
        line_w = CONTENT_WIDTH * 0.6
        line_x = MARGIN_LEFT + (CONTENT_WIDTH - line_w) / 2
        self.pdf.set_draw_color(*s.header_border_color)
        self.pdf.set_line_width(0.8)
        self.pdf.line(line_x, line_y, line_x + line_w, line_y)
        self.pdf.ln(5)

        # 元信息
        self.pdf.set_font(self._font_song(), "", s.meta_size)
        self.pdf.set_text_color(*s.header_meta_color)
        parts = []
        if self.chart_name:
            parts.append(f"命主：{self.chart_name}")
        if self.date_str:
            parts.append(f"生成日期：{self.date_str}")
        if self.skill_name:
            parts.append(f"解盘技能：{self.skill_name}")
        self.pdf.cell(CONTENT_WIDTH, 5, " ｜ ".join(parts), align="C")
        self.pdf.ln(8)

        # 分隔线
        self.pdf.set_draw_color(*s.hr_color)
        self.pdf.set_line_width(0.5)
        line_y2 = self.pdf.get_y()
        self.pdf.line(MARGIN_LEFT, line_y2, MARGIN_LEFT + CONTENT_WIDTH, line_y2)
        self.pdf.ln(8)
        self.pdf.set_text_color(*s.body_color)

    def _render_report_footer(self):
        self._check_space(30)
        disclaimer = (
            "[免责声明]\n"
            "本报告基于中国传统命理学理论框架，仅供文化研究和娱乐参考。"
            "命理分析不构成任何科学结论，不应用于医疗、投资、法律、婚姻等重大决策。"
            "人生在于自身的努力和选择，命理分析仅为参考工具。"
        )
        self._render_disclaimer(disclaimer)

    # ── Markdown 预处理 ──

    def _normalize_markdown(self, content: str) -> str:
        """预处理 Markdown 内容，修复常见格式问题，防止标记符号泄漏到 PDF。

        处理项：
        1. 标题缺少空格：##标题 -> ## 标题
        2. 标题尾部 # 号：## 标题 ## -> ## 标题
        3. 超过 4 级标题：##### 标题 -> #### 标题
        4. 行首多余空格的标题：  ## 标题 -> ## 标题
        5. 段落中粘连的部分标题：…正文。## 第X部分 XXX -> 拆分为独立标题行
        """
        lines = content.split("\n")
        normalized: list[str] = []
        in_code_block = False

        for line in lines:
            stripped = line.strip()

            # 不处理代码块内的内容
            if stripped.startswith("```"):
                in_code_block = not in_code_block
                normalized.append(line)
                continue
            if in_code_block:
                normalized.append(line)
                continue

            # 拆分段落中粘连的部分级标题（LLM 偶发将 "## 第X部分" 直接接在正文末尾）
            if "## 第" in stripped and not stripped.startswith("#"):
                parts = re.split(r'(?=## 第[一二三四五六七八九十百]+部分)', stripped)
                if len(parts) > 1:
                    normalized.append(parts[0].rstrip())
                    for p in parts[1:]:
                        p = p.strip()
                        if p:
                            # 规范为 "## 标题"（确保 # 后有空格，供主循环识别）
                            p = re.sub(r'^(#{1,4})\s*', r'\1 ', p)
                            normalized.append(p)
                    continue

            # 匹配行首的 # 号（允许前面有空格）
            # 覆盖：##标题(无空格)、## 标题(标准)、##  标题(多空格)
            #       ##### 标题(超过4级)、## 标题 ##(尾部#号)、  ## 标题(行首空格)
            heading_match = re.match(r'^(#{1,})\s*(.+?)\s*#*\s*$', stripped)
            if heading_match:
                hashes = heading_match.group(1)
                text = heading_match.group(2).strip()
                # 排除纯 # 号行（如 #######），标题文本必须含非 # 字符
                if not text or all(c == '#' for c in text):
                    normalized.append(line)
                    continue
                # 限制最多 4 级
                level = min(len(hashes), 4)
                normalized.append(f"{'#' * level} {text}")
            else:
                normalized.append(line)

        return "\n".join(normalized)

    # ── 主入口 ──

    def generate(self, markdown_content: str) -> bytes:
        # 预处理 Markdown，修复格式问题
        markdown_content = self._normalize_markdown(markdown_content)

        # 设置 PDF 元数据
        self.pdf.set_title(self.title)
        self.pdf.set_author("GlimmerDao")
        self.pdf.set_creator("GlimmerDao Report Generator")
        if self.chart_type:
            self.pdf.set_subject(f"{self.chart_type} 解盘报告")
        self.pdf.set_keywords(f"{self.chart_type}, 命理, 解盘报告")

        self.pdf.add_page()
        self._render_report_header()

        lines = markdown_content.split("\n")
        i = 0
        in_code_block = False
        code_lines: list[str] = []

        while i < len(lines):
            line = lines[i]

            # 代码块
            if line.strip().startswith("```"):
                if in_code_block:
                    if code_lines:
                        self._flush_table()
                        self._render_code_block(code_lines)
                    code_lines = []
                    in_code_block = False
                else:
                    self._flush_table()
                    in_code_block = True
                    code_lines = []
                i += 1
                continue

            if in_code_block:
                code_lines.append(line)
                i += 1
                continue

            # 空行 → 结束表格
            if not line.strip():
                self._flush_table()
                self.pdf.ln(2)
                i += 1
                continue

            # 表格行
            if line.strip().startswith("|") and "|" in line.strip()[1:]:
                if self._is_separator_row(line):
                    if self._in_table:
                        self._table_aligns = self._parse_aligns(line)
                    i += 1
                    continue
                cells = self._parse_table_row(line)
                if not self._in_table:
                    self._flush_table()
                    self._in_table = True
                    self._table_header = cells
                    self._table_rows = []
                else:
                    self._table_rows.append(cells)
                i += 1
                continue

            # 非表格行 → 结束表格并计算列宽
            if self._in_table:
                self._table_cols = self._calculate_table_cols(
                    self._table_header, self._table_rows
                )
                self._flush_table()

            # 标题
            m = re.match(r'^(#{1,4})\s+(.+)$', line)
            if m:
                self._render_heading(m.group(2).strip(), len(m.group(1)))
                i += 1
                continue

            # 分隔线
            if re.match(r'^[-*_]{3,}$', line.strip()) or re.match(r'^━+$', line.strip()):
                self._render_horizontal_rule()
                i += 1
                continue

            # 引用
            if line.startswith("> "):
                qlines = [line[2:].strip()]
                i += 1
                while i < len(lines) and lines[i].startswith("> "):
                    qlines.append(lines[i][2:].strip())
                    i += 1
                self._render_blockquote(" ".join(qlines))
                continue

            # 无序列表
            ul = re.match(r'^(\s*)[-*+]\s+(.+)$', line)
            if ul:
                self._render_list_item(ul.group(2), ordered=False)
                i += 1
                continue

            # 有序列表
            ol = re.match(r'^(\s*)\d+\.\s+(.+)$', line)
            if ol:
                num = int(re.match(r'\d+', line.strip()).group())  # type: ignore[union-attr]
                self._render_list_item(ol.group(2), ordered=True, index=num)
                i += 1
                continue

            # 段落
            plines = [line]
            i += 1
            while (
                i < len(lines)
                and lines[i].strip()
                and not lines[i].strip().startswith("|")
                and not re.match(r'^(#{1,4})\s+', lines[i])
                and not lines[i].startswith("> ")
                and not re.match(r'^(\s*)[-*+]\s+', lines[i])
                and not re.match(r'^(\s*)\d+\.\s+', lines[i])
                and not re.match(r'^[-*_]{3,}$', lines[i].strip())
                and not re.match(r'^━+$', lines[i].strip())
                and not lines[i].strip().startswith("```")
            ):
                plines.append(lines[i])
                i += 1
            para_text = " ".join(p.strip() for p in plines if p.strip())
            self._render_paragraph(para_text)

        self._flush_table()
        self._render_report_footer()

        return bytes(self.pdf.output())


# ═══════════════════════════════════════════════════════════════
# 便捷函数
# ═══════════════════════════════════════════════════════════════

def generate_pdf_from_markdown(
    markdown_content: str,
    title: str = "解盘报告",
    date_str: str = "",
    chart_type: str = "",
    chart_name: str = "",
    skill_name: str = "",
) -> bytes:
    generator = MarkdownPDFGenerator(
        title=title,
        date_str=date_str,
        chart_type=chart_type,
        chart_name=chart_name,
        skill_name=skill_name,
    )
    return generator.generate(markdown_content)
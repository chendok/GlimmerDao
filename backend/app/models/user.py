"""用户认证相关数据库模型"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=True)
    phone = Column(String(20), unique=True, nullable=True)
    email = Column(String(128), unique=True, nullable=True)
    password_hash = Column(String(256), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    gender = Column(String(10), nullable=True, default="unknown")
    wechat_openid = Column(String(128), unique=True, nullable=True)
    wechat_unionid = Column(String(128), unique=True, nullable=True)
    wechat_nickname = Column(String(128), nullable=True)
    wechat_avatar = Column(String(512), nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    theme_preference = Column(String(20), default="dark")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    identifier = Column(String(128), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    success = Column(Boolean, default=False)
    attempted_at = Column(DateTime, default=datetime.utcnow)


class LoginLog(Base):
    """登录日志 — 记录用户登录、登出、登录失败等身份验证事件"""
    __tablename__ = "login_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True, comment="用户ID（登录失败且用户不存在时为NULL）")
    username = Column(String(128), nullable=True, comment="登录账号（邮箱/手机）")
    ip_address = Column(String(45), nullable=True, comment="登录IP")
    device = Column(String(512), nullable=True, comment="登录设备（User-Agent解析）")
    status = Column(String(20), nullable=False, comment="登录状态: success/failure/logout")
    failure_reason = Column(String(128), nullable=True, comment="失败原因")
    created_at = Column(DateTime, default=datetime.utcnow, index=True, comment="登录时间")


class SmsVerificationCode(Base):
    __tablename__ = "sms_verification_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone = Column(String(20), nullable=False, index=True)
    code = Column(String(6), nullable=False)
    purpose = Column(String(20), nullable=False, default="login")
    used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(128), nullable=False, index=True)
    code = Column(String(6), nullable=False)
    purpose = Column(String(20), nullable=False, default="register")
    used = Column(Boolean, default=False)
    attempt_count = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class BaziArchive(Base):
    __tablename__ = "bazi_archives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(64), nullable=False, index=True)
    gender = Column(String(10), nullable=False)
    birth_datetime = Column(String(32), nullable=False)
    birthplace = Column(String(64), nullable=True)
    calendar_type = Column(String(10), nullable=False, default="公历")
    group_name = Column(String(20), nullable=True, default="全部")
    bazi_result = Column(Text, nullable=True)
    supplemental_info = Column(Text, nullable=True, comment="个人补充信息")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BaziReport(Base):
    """解盘报告档案"""
    __tablename__ = "bazi_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    archive_id = Column(Integer, nullable=True, index=True, comment="关联的排盘档案ID（bazi_archives.id）")
    title = Column(String(128), nullable=False, comment="报告标题")
    chart_type = Column(String(20), nullable=False, default="八字", comment="排盘类型：八字/紫微/麻衣神相")
    chart_name = Column(String(64), nullable=True, comment="排盘对象姓名")
    skill_name = Column(String(64), nullable=True, comment="使用的解盘Skill名称")
    report_format = Column(String(10), nullable=False, default="html", comment="报告格式：html/word")
    report_content = Column(Text, nullable=False, comment="报告内容（Markdown）")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PhysiognomyArchive(Base):
    """麻衣神相档案 — 面相/手相图像采集记录与特征数据"""
    __tablename__ = "physiognomy_archives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    archive_id = Column(Integer, nullable=True, index=True, comment="关联的八字档案ID（bazi_archives.id），删除时置空")
    name = Column(String(64), nullable=True, comment="档案名称（未关联八字档案时需手动输入）")
    gender = Column(String(10), nullable=True, comment="性别")
    analysis_type = Column(String(50), nullable=False, comment="分析类型：face/hand/combined")
    capture_method = Column(String(50), nullable=True, comment="采集方式：camera/upload")

    # 图像存储
    image_path = Column(String(500), nullable=True, comment="原始图像在 uploads/ 下的相对路径")
    thumbnail_path = Column(String(500), nullable=True, comment="缩略图路径（200x200）")
    annotated_image_path = Column(String(500), nullable=True, comment="标注图路径（含关键点标注）")

    # 特征数据
    feature_data = Column(Text, nullable=True, comment="JSON 格式的完整特征数据")
    feature_summary = Column(Text, nullable=True, comment="特征摘要文本（序列化后传给 LLM 的 context_data）")

    # 分析结果
    analysis_result = Column(Text, nullable=True, comment="即时分析结果文本")
    report_id = Column(String(255), nullable=True, comment="关联的深度报告ID")

    # 元数据
    face_confidence = Column(Float, nullable=True, comment="面部检测置信度")
    hand_confidence = Column(Float, nullable=True, comment="手部检测置信度")
    image_width = Column(Integer, nullable=True, comment="原始图像宽度")
    image_height = Column(Integer, nullable=True, comment="原始图像高度")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChartInfoRecord(Base):
    """排盘信息快照 — 特定时间维度组合（大运/流年/流月/流日/流时）下的排盘信息"""
    __tablename__ = "chart_info_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    archive_id = Column(Integer, nullable=True, index=True, comment="关联的排盘档案ID（bazi_archives.id）")
    title = Column(String(128), nullable=False, comment="记录标题（含时间维度信息）")
    chart_type = Column(String(20), nullable=False, default="八字", comment="排盘类型：八字/紫微/麻衣神相")
    chart_name = Column(String(64), nullable=True, comment="排盘对象姓名")
    # 选中的时间维度快照（独立字段便于列表展示与筛选）
    selected_dayun = Column(String(32), nullable=True, comment="选中的大运干支，如 '丙午(2026-2035)'")
    selected_liunian = Column(String(16), nullable=True, comment="选中的流年，如 '2026丙午年'")
    selected_liuyue = Column(String(16), nullable=True, comment="选中的流月，如 '3月甲子'")
    selected_liuri = Column(String(16), nullable=True, comment="选中的流日，如 '15日戊辰'")
    selected_liushi = Column(String(16), nullable=True, comment="选中的流时，如 '子时壬子'")
    has_focus = Column(Boolean, nullable=False, default=False, comment="是否含任何时间维度焦点")
    info_content = Column(Text, nullable=False, comment="排盘信息Markdown正文")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

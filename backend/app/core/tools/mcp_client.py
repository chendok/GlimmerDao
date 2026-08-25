"""
MCP (Model Context Protocol) 客户端

连接外部 MCP 服务，自动发现其提供的工具，并包装为 LangChain BaseTool
注入 Agent Harness，实现工具的可扩展集成。

特性：
- 支持 stdio 与 sse 两种传输方式
- 从 mcp_servers.yaml 加载服务配置
- 自动发现服务端工具并转换为 LangChain StructuredTool（含参数 schema）
- 优雅降级：mcp 包未安装或无服务配置时返回空工具列表，不影响主流程

启用步骤：
1. pip install mcp
2. 在 mcp_servers.yaml 中取消注释并配置服务
3. 重启后端，日志会打印发现的 MCP 工具
"""

import asyncio
import logging
from pathlib import Path
from typing import Any

from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)

# 配置文件路径：backend/mcp_servers.yaml
CONFIG_PATH = Path(__file__).resolve().parents[3] / "mcp_servers.yaml"


class MCPServerConfig:
    """单个 MCP 服务的连接配置"""

    def __init__(self, name: str, transport: str, **kwargs):
        self.name = name
        self.transport = transport  # "stdio" | "sse"
        self.command = kwargs.get("command")
        self.args = kwargs.get("args", [])
        self.url = kwargs.get("url")
        self.env = kwargs.get("env")


def _json_type_to_python(json_type: str) -> type:
    """JSON Schema 类型 → Python 类型"""
    mapping = {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
        "array": list,
        "object": dict,
    }
    return mapping.get(json_type, str)


def _schema_to_pydantic(model_name: str, schema: dict):
    """将 MCP 工具的 inputSchema (JSON Schema) 转换为 Pydantic 模型，用作工具参数 schema"""
    from pydantic import create_model, Field

    properties = (schema or {}).get("properties", {})
    required = set((schema or {}).get("required", []))
    fields: dict[str, Any] = {}
    for prop_name, prop_schema in properties.items():
        py_type = _json_type_to_python(prop_schema.get("type", "string"))
        desc = prop_schema.get("description", "")
        if prop_name in required:
            fields[prop_name] = (py_type, Field(..., description=desc))
        else:
            fields[prop_name] = (py_type, Field(default=None, description=desc))
    return create_model(model_name, **fields) if fields else None


class MCPClient:
    """MCP 客户端 - 管理与服务端的连接及工具发现"""

    def __init__(self):
        self._servers: dict[str, Any] = {}        # 服务名 -> ClientSession
        self._tools: list[StructuredTool] = []     # 已发现的 LangChain 工具
        self._contexts: list[Any] = []             # 保持存活的异步上下文管理器
        self._connected: bool = False

    def load_config(self) -> list[MCPServerConfig]:
        """从 mcp_servers.yaml 加载服务配置"""
        if not CONFIG_PATH.exists():
            return []
        try:
            import yaml
            data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
            servers = data.get("servers", []) or []
            configs: list[MCPServerConfig] = []
            for s in servers:
                if not isinstance(s, dict) or "name" not in s or "transport" not in s:
                    logger.warning("[mcp] 跳过无效服务配置: %s", s)
                    continue
                extras = {k: v for k, v in s.items() if k not in ("name", "transport")}
                configs.append(MCPServerConfig(s["name"], s["transport"], **extras))
            return configs
        except Exception as e:
            logger.warning("[mcp] 配置加载失败: %s", e)
            return []

    async def connect_all(self) -> None:
        """连接所有已配置的 MCP 服务并发现工具"""
        configs = self.load_config()
        if not configs:
            logger.info("[mcp] 无 MCP 服务配置，跳过连接")
            return

        try:
            import mcp  # noqa: F401  仅为检测可用性
        except ImportError:
            logger.warning(
                "[mcp] mcp 包未安装，MCP 集成已禁用。运行 `pip install mcp` 后在 "
                "mcp_servers.yaml 配置服务即可启用。"
            )
            return

        for cfg in configs:
            try:
                await self._connect_server(cfg)
            except Exception as e:
                logger.warning("[mcp] 连接服务 %s 失败: %s", cfg.name, e)

        self._connected = True
        logger.info(
            "[mcp] 已连接 %d 个服务，共发现 %d 个 MCP 工具",
            len(self._servers), len(self._tools),
        )

    async def _connect_server(self, cfg: MCPServerConfig) -> None:
        """连接单个 MCP 服务并发现其工具"""
        from mcp.client.session import ClientSession

        if cfg.transport == "stdio":
            from mcp.client.stdio import stdio_client, StdioServerParameters
            params = StdioServerParameters(
                command=cfg.command, args=list(cfg.args), env=cfg.env
            )
            ctx = stdio_client(params)
        elif cfg.transport == "sse":
            from mcp.client.sse import sse_client
            ctx = sse_client(cfg.url)
        else:
            logger.warning("[mcp] 未知传输类型: %s (服务 %s)", cfg.transport, cfg.name)
            return

        # 保持传输层与会话上下文存活（生命周期与应用一致）
        read, write = await ctx.__aenter__()
        self._contexts.append(ctx)
        session = ClientSession(read, write)
        await session.__aenter__()
        self._contexts.append(session)

        await session.initialize()
        self._servers[cfg.name] = session

        # 发现工具
        resp = await session.list_tools()
        for t in resp.tools:
            lc_tool = self._wrap_tool(cfg.name, t, session)
            if lc_tool is not None:
                self._tools.append(lc_tool)
                logger.info("[mcp] 发现工具: %s (服务 %s)", lc_tool.name, cfg.name)

    def _wrap_tool(self, server_name: str, mcp_tool, session) -> StructuredTool | None:
        """将单个 MCP 工具包装为 LangChain StructuredTool"""
        tool_name = f"mcp_{server_name}_{mcp_tool.name}"
        mcp_tool_name = mcp_tool.name
        input_schema = getattr(mcp_tool, "inputSchema", None) or {}

        try:
            args_schema = _schema_to_pydantic(f"{tool_name}_args", input_schema)
        except Exception as e:
            logger.warning("[mcp] 工具 %s schema 转换失败: %s", tool_name, e)
            args_schema = None

        async def _acall(**kwargs) -> str:
            result = await session.call_tool(mcp_tool_name, kwargs)
            # MCP 返回 CallToolResult，提取文本内容
            contents = getattr(result, "content", [])
            texts = []
            for c in contents:
                text = getattr(c, "text", None)
                if text:
                    texts.append(text)
            return "\n".join(texts) if texts else str(result)

        try:
            return StructuredTool.from_function(
                coroutine=_acall,
                name=tool_name,
                description=getattr(mcp_tool, "description", None) or f"MCP tool {mcp_tool_name}",
                args_schema=args_schema,
            )
        except Exception as e:
            logger.warning("[mcp] 包装工具 %s 失败: %s", tool_name, e)
            return None

    def to_langchain_tools(self) -> list:
        """返回所有已发现的 MCP 工具（LangChain 格式）"""
        return list(self._tools)

    async def close_all(self) -> None:
        """关闭所有连接，释放资源"""
        for ctx in reversed(self._contexts):
            try:
                await ctx.__aexit__(None, None, None)
            except Exception:
                pass
        self._servers.clear()
        self._tools.clear()
        self._contexts.clear()
        self._connected = False


# 全局单例
mcp_client = MCPClient()

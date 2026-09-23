"""Verify the configured Blender MCP bridge and run the reproducible city tile prototype."""

import asyncio
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main() -> None:
    source = Path(__file__).with_name("blender-city-kit-tile.py")
    output = source.resolve().parents[1] / "Assets" / "city" / "kit-prototype"
    code = f"CITY_KIT_OUTPUT_DIR = {str(output)!r}\n" + source.read_text(encoding="utf-8")
    server = StdioServerParameters(
        command=str(Path.home() / ".local" / "bin" / "uvx.exe"),
        args=["mcp-for-blender"],
        env={"BLENDER_MCP_DISABLE_TELEMETRY": "1"},
    )
    async with stdio_client(server) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            available = {tool.name for tool in (await session.list_tools()).tools}
            assert {"get_scene_info", "execute_blender_code"} <= available, available
            scene = await session.call_tool("get_scene_info", {"user_prompt": "Check the open Blender scene before making a modular wall tile."})
            assert not scene.isError, scene.content
            print("MCP connected to the open Blender scene")
            result = await session.call_tool(
                "execute_blender_code",
                {"code": code, "user_prompt": "Build and save a small low-poly modular city wall tile kit in this Blender scene."},
            )
            assert not result.isError, result.content
            for item in result.content:
                if item.type == "text":
                    print(item.text[:2000])


if __name__ == "__main__":
    asyncio.run(main())

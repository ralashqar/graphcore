"""Run reproducible City authoring scripts through the local Blender MCP bridge.

uv run --with mcp python scripts/city-blender-mcp.py [script.py ...]
With no scripts this only reads the current scene.
"""
import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    root = Path(__file__).resolve().parents[1]
    params = StdioServerParameters(command=str(Path.home()/'.local/bin/uvx.exe'), args=['mcp-for-blender'], env={'BLENDER_MCP_DISABLE_TELEMETRY':'1'})
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer, read_timeout_seconds=1800) as session:
            await session.initialize()
            result = await session.call_tool('get_scene_info', {'user_prompt':'Inspect the active scene before authoring the New York City kit.'})
            if getattr(result, 'is_error', getattr(result, 'isError', False)): raise RuntimeError(result.content)
            for item in result.content:
                if item.type == 'text': print(item.text[:3000], flush=True)
            for filename in sys.argv[1:]:
                path = (root/filename).resolve()
                source = f"CITY_STUDIO_ROOT={str(root)!r}\nCITY_STUDIO_VERSION=4\n__file__={str(path)!r}\n" + path.read_text(encoding='utf-8')
                code = "import bpy\n_city_previous_scene = bpy.context.window.scene\ntry:\n    exec(compile(" + repr(source) + ", " + repr(str(path)) + ", 'exec'), globals())\nfinally:\n    bpy.context.window.scene = _city_previous_scene\n"
                result = await session.call_tool('execute_blender_code', {'code':code,'user_prompt':f'Build the versioned New York architecture pack using {path.name}; preserve unrelated scenes.'})
                for item in result.content:
                    if item.type == 'text': print(item.text[-5000:], flush=True)
                if getattr(result, 'is_error', getattr(result, 'isError', False)): raise RuntimeError(result.content)
                if any(item.type=='text' and item.text.startswith(('Error','Traceback')) for item in result.content): raise RuntimeError(result.content)

if __name__ == '__main__': asyncio.run(main())

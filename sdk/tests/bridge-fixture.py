"""Real local aiohttp server used by SDK integration tests."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bridge'))
from drone_bridge import create_app
from aiohttp import web

async def run():
    runner = web.AppRunner(create_app(publisher_token='pub-test', read_token='read-test'))
    await runner.setup()
    server = web.TCPSite(runner, '127.0.0.1', 0)
    await server.start()
    print(server._server.sockets[0].getsockname()[1], flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()

asyncio.run(run())

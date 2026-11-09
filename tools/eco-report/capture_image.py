import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get("ECO_WECHAT_HTML", "file:///C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan/reports/2026-11-06/wechat.html")
OUT = os.environ.get("ECO_WECHAT_IMAGE", str(Path(__file__).parent / "wechat-boards.png"))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="msedge", headless=True)
        ctx = await b.new_context(viewport={"width": 760, "height": 1000}, device_scale_factor=2)
        pg = await ctx.new_page()
        await pg.goto(URL, wait_until="networkidle")
        await pg.add_style_tag(content=".bar{display:none!important}.stage{padding:0!important}.paper{box-shadow:none!important;border-radius:0!important;max-width:none!important}body{background:#fff!important}")
        await pg.wait_for_timeout(500)
        el = pg.locator("#wx-article")
        box = await el.bounding_box()
        await el.screenshot(path=OUT)
        print("saved", OUT, "css_box", round(box["width"]), "x", round(box["height"]))
        await b.close()

asyncio.run(main())
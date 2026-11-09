import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
URL = os.environ.get("ECO_WECHAT_HTML", "file:///C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan/reports/2026-11-06/wechat.html")
OUTDIR = Path(os.environ.get("ECO_WECHAT_OUT", str(HERE)))
MAX_PX = 6000  # WeChat long-image ceiling per file
STRIP = ".bar{display:none!important}.stage{padding:0!important}.paper{box-shadow:none!important;border-radius:0!important;max-width:none!important}body{background:#fff!important}"

async def open_page(browser, dpr):
    ctx = await browser.new_context(viewport={"width": 760, "height": 1000}, device_scale_factor=dpr)
    pg = await ctx.new_page()
    await pg.goto(URL, wait_until="networkidle")
    await pg.add_style_tag(content=STRIP)
    await pg.wait_for_timeout(300)
    return ctx, pg

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="msedge", headless=True)
        ctx, pg = await open_page(b, 1)
        boxes = {}
        for name in ("wx-potential", "wx-ranking"):
            boxes[name] = await pg.locator("#" + name).bounding_box()
        heights = {k: round(v["height"]) for k, v in boxes.items()}
        need = max(heights.values())
        dpr = 2 if need * 2 <= MAX_PX else round(max(1.0, (MAX_PX - 10) / need), 2)
        await ctx.close()

        ctx, pg = await open_page(b, dpr)
        out = {}
        for name in ("wx-potential", "wx-ranking"):
            path = OUTDIR / (name.replace("wx-", "wechat-") + ".png")
            await pg.locator("#" + name).screenshot(path=str(path))
            box = await pg.locator("#" + name).bounding_box()
            out[path.name] = {"css": round(box["height"]), "px": round(box["height"] * dpr), "dpr": dpr}
            print("saved", path, "css", round(box["height"]), "px", round(box["height"] * dpr), "dpr", dpr)
        await b.close()
        print(json.dumps({"dpr": dpr, "maxPx": MAX_PX, "images": out, "underLimit": all(v["px"] <= MAX_PX for v in out.values())}, ensure_ascii=False))

asyncio.run(main())

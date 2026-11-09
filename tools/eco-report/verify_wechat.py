import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
URL = os.environ.get("ECO_WECHAT_HTML", "file:///C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan/reports/2026-11-06/wechat.html")
rank = json.loads((HERE / "full-ranking.json").read_text(encoding="utf-8"))
pot = json.loads((HERE / "potential-v4.json").read_text(encoding="utf-8"))
DATE = rank["date"]
mainRows = [r for r in rank["rows"] if not r["archived"]]
expect = [r["repo"] for r in [mainRows[0], mainRows[9], mainRows[19]]] + [r["repoId"] for r in [pot["ranked"][0], pot["ranked"][9], pot["ranked"][19]]]

errors = []

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="msedge", headless=True)
        ctx = await browser.new_context(
            viewport={"width": 760, "height": 1000},
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(400)

        info = await page.evaluate("""() => {
            const a = document.getElementById('wx-article');
            return {
                exists: !!a,
                classInArticle: a.querySelectorAll('[class]').length,
                scriptInArticle: a.querySelectorAll('script').length,
                imgInArticle: a.querySelectorAll('img').length,
                styleBlocks: a.querySelectorAll('style').length,
                inlineStyled: a.querySelectorAll('[style]').length,
                cards: a.querySelectorAll('section').length,
                text: a.innerText,
            };
        }""")
        text = info.pop("text")
        for name in expect:
            if name not in text:
                errors.append("missing repo in article: " + name)
        if DATE not in text:
            errors.append("missing snapshot date: " + DATE)
        if info["cards"] < 42:
            errors.append(f"too few sections: {info['cards']}")
        for bad in ("classInArticle", "scriptInArticle", "imgInArticle", "styleBlocks"):
            if info[bad]:
                errors.append(f"{bad} must be 0, got {info[bad]}")

        await page.screenshot(path=str(HERE / "wechat-preview-top.png"), full_page=False)
        await page.screenshot(path=str(HERE / "wechat-preview-full.png"), full_page=True)

        await page.click("#copy")
        await page.wait_for_timeout(500)
        status = await page.inner_text("#status")
        clip = ""
        try:
            clip = await page.evaluate("async () => { const items = await navigator.clipboard.read(); for (const it of items) { if (it.types.includes('text/html')) { return await (await it.getType('text/html')).text(); } } return ''; }")
        except Exception as e:
            clip = "READ_ERR:" + str(e)

        await page.click("#copyPlain")
        await page.wait_for_timeout(300)
        status2 = await page.inner_text("#status")

        if not status.startswith("✓"):
            errors.append("rich copy status: " + status)
        if not status2.startswith("✓"):
            errors.append("plain copy status: " + status2)
        if "wx-article" not in clip:
            errors.append("clipboard html missing article")
        if len(clip) < 20000:
            errors.append(f"clipboard html too small: {len(clip)}")

        print(json.dumps({
            "date": DATE, "info": info, "expectedRepos": expect,
            "copyStatus": status, "clipboardHtmlBytes": len(clip),
            "clipboardHasArticle": "wx-article" in clip,
            "clipboardClassCount": clip.count("class="),
            "plainStatus": status2, "errors": errors,
        }, ensure_ascii=False, indent=1))
        await browser.close()
        if errors:
            print("FAIL wechat verified")
            sys.exit(1)
        print("OK wechat verified")

asyncio.run(main())

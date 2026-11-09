import asyncio, json, os
from playwright.async_api import async_playwright

URL = os.environ.get("ECO_WECHAT_HTML", "file:///C:/Users/lenovo/.zcode/workspace/default/dsh-plugin-eco-scan/reports/2026-11-06/wechat.html")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="msedge", headless=True)
        ctx = await browser.new_context(
            viewport={"width": 760, "height": 1000},
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(400)

        # structural checks on the article that gets copied
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
                text: a.innerText.length,
                title: a.querySelector('p') ? a.innerText.slice(0,40) : ''
            };
        }""")

        await page.screenshot(path="wechat-preview-top.png", full_page=False)
        await page.screenshot(path="wechat-preview-full.png", full_page=True)

        # click rich copy
        await page.click("#copy")
        await page.wait_for_timeout(500)
        status = await page.inner_text("#status")
        # read back clipboard html if permitted
        clip = ""
        try:
            clip = await page.evaluate("async () => { const items = await navigator.clipboard.read(); for (const it of items) { if (it.types.includes('text/html')) { return await (await it.getType('text/html')).text(); } } return ''; }")
        except Exception as e:
            clip = "READ_ERR:" + str(e)

        # plain copy
        await page.click("#copyPlain")
        await page.wait_for_timeout(300)
        status2 = await page.inner_text("#status")

        print(json.dumps({
            "info": info,
            "copyStatus": status,
            "clipboardHtmlBytes": len(clip),
            "clipboardHasArticle": "wx-article" in clip,
            "clipboardClassCount": clip.count("class="),
            "plainStatus": status2,
            "errors": errors,
        }, ensure_ascii=False, indent=1))
        await browser.close()

asyncio.run(main())
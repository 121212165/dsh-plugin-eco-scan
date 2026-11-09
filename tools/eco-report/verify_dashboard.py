# -*- coding: utf-8 -*-
# Dashboard smoke gate. Run: PYTHONIOENCODING=utf-8 py -3.12 verify_dashboard.py
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
URL = (HERE / "dashboard.html").as_uri()
COUNTS = json.loads((HERE / "full-ranking.json").read_text(encoding="utf-8"))["counts"]

def total_of(txt):
    m = re.search(r"共\s*([\d,]+)\s*个", txt)
    return int(m.group(1).replace(",", "")) if m else -1

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel="msedge", headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1000})
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until="load")
        await pg.wait_for_selector("#tbody tr")

        base = await pg.evaluate("""() => ({
            kpis: document.querySelectorAll('#kpis .kpi').length,
            heatRows: document.querySelectorAll('#heat tbody tr').length,
            heatWeeks: document.querySelectorAll('#heat thead th.wk').length,
            lanes: document.querySelectorAll('#lanes .lane').length,
            chips: document.querySelectorAll('#chips .chip').length,
            tableRows: document.querySelectorAll('#tbody tr').length,
            totalRows: document.getElementById('totalRows').textContent,
            firstRepo: document.querySelector('#tbody tr .repo')?.textContent || '',
            pager: document.getElementById('pager').textContent.trim(),
            velNote: document.getElementById('velNote').textContent.trim(),
            velCards: document.querySelectorAll('#velocity .lane').length
        })""")
        assert base["kpis"] == 7, base
        assert base["heatWeeks"] == 26 and base["heatRows"] > 0, base
        assert base["lanes"] > 0 and base["chips"] >= 40, base
        assert base["tableRows"] == 50, base
        assert base["totalRows"].replace(",", "") == str(COUNTS["repos"]), base
        assert total_of(base["pager"]) == COUNTS["mainRows"], base
        assert base["velNote"], base
        assert base["velCards"] > 0 or "数据积累中" in base["velNote"], base

        # main list head must not contain a 0-star repo, and every row shows coverage
        head = await pg.evaluate("""() => Array.from(document.querySelectorAll('#tbody tr')).map(tr => ({
            stars: parseInt(tr.children[5].textContent.replace(/,/g,'') || '0', 10),
            cov: tr.children[4].textContent.trim()
        }))""")
        assert all(h["stars"] > 0 for h in head), [h for h in head if h["stars"] <= 0][:3]
        assert all(h["cov"].endswith("%") for h in head), head[:3]

        # low-signal view: dedicated filter, total matches counts.lowSignal
        await pg.check("#lowsig")
        await pg.wait_for_timeout(300)
        lowTotal = total_of(await pg.evaluate("document.querySelector('#pager .count').textContent"))
        assert lowTotal == COUNTS["lowSignal"], (lowTotal, COUNTS["lowSignal"])
        lowBadges = await pg.evaluate("document.querySelectorAll('#tbody .repo .arch').length")
        assert lowBadges > 0, lowBadges
        await pg.uncheck("#lowsig")
        await pg.wait_for_timeout(200)
        assert total_of(await pg.evaluate("document.querySelector('#pager .count').textContent")) == COUNTS["mainRows"]

        await pg.screenshot(path=str(HERE / "dash-top.png"), full_page=False)

        # search narrows
        await pg.fill("#q", "video")
        await pg.wait_for_timeout(300)
        searchCount = total_of(await pg.evaluate("document.querySelector('#pager .count').textContent"))
        assert 0 < searchCount < COUNTS["repos"], searchCount
        await pg.fill("#q", "")
        await pg.wait_for_timeout(200)

        # tag chip filters and toggles off
        await pg.click("#chips .chip")
        await pg.wait_for_timeout(300)
        chipOn = await pg.evaluate("document.querySelectorAll('#chips .chip.on').length")
        chipCount = total_of(await pg.evaluate("document.querySelector('#pager .count').textContent"))
        assert chipOn == 1 and 0 < chipCount < COUNTS["repos"], (chipOn, chipCount)
        await pg.click("#chips .chip.on")
        await pg.wait_for_timeout(200)

        # sort by stars: first row has max stars among main (signal-bearing) rows
        await pg.select_option("#sort", "stars")
        await pg.wait_for_timeout(300)
        topStars = int((await pg.evaluate("document.querySelector('#tbody tr td:nth-child(6)').textContent")).replace(",", ""))
        expectTop = await pg.evaluate("Math.max(...window.__DATA__.rows.filter(r=>!r[8] && r[11]>=0.4).map(r=>r[2]))")
        assert topStars == expectTop, (topStars, expectTop)

        # pagination: next then jump to last page
        await pg.click("#next")
        await pg.wait_for_timeout(300)
        assert (await pg.evaluate("document.getElementById('pg').value")) == "2"
        await pg.select_option("#sort", "score")
        await pg.wait_for_timeout(200)
        pages = await pg.evaluate("document.getElementById('pg').max")
        await pg.fill("#pg", pages)
        await pg.dispatch_event("#pg", "change")
        await pg.wait_for_timeout(300)
        lastRank = int(await pg.evaluate("document.querySelector('#tbody tr td').textContent"))
        assert COUNTS["mainRows"] - 50 <= lastRank <= COUNTS["repos"], lastRank

        assert not errs, errs[:5]
        print(json.dumps({"baseTotal": total_of(base["pager"]), "searchCount": searchCount,
                          "chipCount": chipCount, "topStars": topStars, "pages": pages,
                          "lastPageFirstRank": lastRank, "errors": errs}, ensure_ascii=False))
        await b.close()
    print("OK dashboard verified")

asyncio.run(main())
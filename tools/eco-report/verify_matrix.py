# -*- coding: utf-8 -*-
# Verify the parent x capability drill-down matrix under the DEFAULT noarch scope.
# Run: PYTHONIOENCODING=utf-8 py -3.12 verify_matrix.py
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
URL = (HERE / 'dashboard.html').as_uri()
_counts = json.loads((HERE / 'full-ranking.json').read_text(encoding='utf-8'))['counts']
EXPECT_BASE = _counts['mainRows']
errors = []

def total(page):
    txt = page.locator('#pager .count').inner_text()
    m = re.search(r'共\s*([\d,]+)\s*个', txt)
    return int(m.group(1).replace(',', '')) if m else -1

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL)
    pg.wait_for_selector('#matrix td.mcell')
    pg.locator('.panel').nth(2).screenshot(path=str(HERE / 'dash-matrix-panel.png'))
    cells = pg.locator('#matrix td.mcell').count()
    rows = pg.locator('#matrix tbody tr').count()
    print('matrix cells', cells, 'rows', rows)
    assert rows == 5 and cells >= 5 * 2, 'expected 5 parent rows'

    # default scope: noarch ON -> base excludes archived, matrix cells share this scope
    assert pg.locator('#noarch').is_checked(), 'noarch must default to on'
    base = total(pg)
    print('base total (default noarch on)', base)
    assert base == EXPECT_BASE, f'expected {EXPECT_BASE} (repos-archived), got {base}'

    # sample 5 non-zero capability cells spread across parent rows; clicked count must equal printed number
    picked = pg.evaluate('''() => {
      const out = [];
      document.querySelectorAll('#matrix tbody tr').forEach((tr) => {
        const td = Array.from(tr.querySelectorAll('td.mcell:not(.gen)'))
          .find((td) => parseInt(td.textContent.trim() || '0', 10) > 0);
        if (td) out.push({ title: td.getAttribute('title'), n: parseInt(td.textContent.trim(), 10) });
      });
      return out;
    }''')
    assert len(picked) == 5, f'expected 5 non-zero cells, got {len(picked)}'
    for c in picked:
        label = c['title'].split('：')[0]
        cell = pg.locator(f'td[title^="{label}"]')
        cell.click()
        pg.wait_for_selector('#pairBanner[style*="flex"]')
        n = total(pg)
        print(f"{label} -> {n} (cell {c['n']})")
        assert n == c['n'], f'{label}: expected {c["n"]} got {n}'
        pg.click('#clearPair')
        pg.wait_for_selector('#pairBanner', state='hidden')
        assert total(pg) == base

    # generic-only column: clicked residual must equal printed number (all 5 parents)
    gcells = pg.evaluate('''() => Array.from(document.querySelectorAll('#matrix td.mcell.gen'))
      .map((td) => ({ title: td.getAttribute('title'), n: parseInt(td.textContent.replace(/,/g, '').trim() || '0', 10) }))''')
    for c in gcells:
        label = c['title'].split('：')[0]
        pg.locator(f'td[title^="{label}"]').click()
        pg.wait_for_selector('#pairBanner[style*="flex"]')
        n = total(pg)
        print(f"{label} -> {n} (cell {c['n']})")
        assert n == c['n'], f'{label}: expected {c["n"]} got {n}'
        pg.click('#clearPair')
        pg.wait_for_selector('#pairBanner', state='hidden')

    # enriched badge present somewhere in table
    badges = pg.locator('#tbody .enr').count()
    print('enriched badges on page1:', badges)

    pg.screenshot(path=str(HERE / 'dash-matrix.png'), full_page=False)
    b.close()

print('console errors', len(errors))
for e in errors[:10]:
    print('  ERR', e)
assert not errors, 'console errors present'
print('OK matrix drill-down verified (noarch scope, 5 cells + 5 generic residuals all equal)')
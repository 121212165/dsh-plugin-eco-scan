/** repo ↔ npm mapping with explicit precedence and confidence:
 *   manual (world-readable YAML, PR-maintained) 1.0
 *   awesome index (cross-checked list)          0.95
 *   registry (package.json repository URL)      1.0
 *   heuristic (normalized name similarity)      0.3–0.85
 * Heuristics only fill repos that no authoritative source covers, and every
 * unmatched repo is reported so a human can extend the manual table. */
import { parse as parseYaml } from 'yaml';
import { isRecord, normalizeRepoId } from './util.js';
export function normalizePackageStem(name) {
    return name
        .toLowerCase()
        .replace(/^@[^/]+\//, '')
        .replace(/^create-/, '')
        .replace(/^(dsh-plugin|dsh-plugins|dsh|plugin)-/, '')
        .replace(/-plugin$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
export function normalizeRepoStem(repoId) {
    const name = repoId.split('/')[1] ?? repoId;
    return normalizePackageStem(name);
}
export function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
            const insertion = (current[j - 1] ?? 0) + 1;
            const deletion = (previous[j] ?? 0) + 1;
            current[j] = Math.min(substitution, insertion, deletion);
        }
        previous = current;
    }
    return previous[b.length] ?? Math.max(a.length, b.length);
}
/** Confidence for one repo/package pair, or 0 when they are unrelated. */
export function heuristicConfidence(repoId, packageName) {
    const repo = normalizeRepoStem(repoId);
    const pkg = normalizePackageStem(packageName);
    if (!repo || !pkg)
        return 0;
    if (repo === pkg)
        return 0.85;
    const shorter = repo.length <= pkg.length ? repo : pkg;
    const longer = repo.length <= pkg.length ? pkg : repo;
    if (shorter.length >= 4 && longer.includes(shorter))
        return 0.6;
    if (shorter.length >= 5) {
        const distance = levenshtein(repo, pkg);
        if (distance <= 2)
            return 0.4;
    }
    const repoTokens = new Set(repo.split('-').filter(Boolean));
    const pkgTokens = pkg.split('-').filter(Boolean);
    if (repoTokens.size && pkgTokens.length && pkgTokens.every((token) => repoTokens.has(token)))
        return 0.5;
    return 0;
}
export function parseManualMapping(text) {
    const document = parseYaml(text);
    if (document === null || document === undefined)
        return [];
    const pairs = [];
    if (Array.isArray(document)) {
        for (const entry of document) {
            if (!isRecord(entry))
                continue;
            const repo = typeof entry.repo === 'string' ? entry.repo : null;
            if (!repo)
                continue;
            const names = Array.isArray(entry.npm) ? entry.npm : typeof entry.npm === 'string' ? [entry.npm] : [];
            for (const name of names) {
                if (typeof name !== 'string' || !name)
                    continue;
                pairs.push({
                    repoId: normalizeRepoId(repo),
                    npmName: name,
                    confidence: typeof entry.confidence === 'number' ? entry.confidence : 1,
                    source: entry.source === 'awesome' || entry.source === 'registry' || entry.source === 'heuristic' ? entry.source : 'manual',
                });
            }
        }
        return pairs;
    }
    if (isRecord(document)) {
        for (const [repo, value] of Object.entries(document)) {
            const names = Array.isArray(value) ? value : [value];
            for (const name of names) {
                if (typeof name !== 'string' || !name)
                    continue;
                pairs.push({ repoId: normalizeRepoId(repo), npmName: name, confidence: 1, source: 'manual' });
            }
        }
    }
    return pairs;
}
const GITHUB_URL = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;
const NPM_URL = /npmjs\.com\/package\/(@[A-Za-z0-9_.-]+\/)?([A-Za-z0-9_.-]+)/g;
/** Best-effort extraction from an awesome-list style markdown: one repo and
 * one or more npm links per line/table row. */
export function parseAwesomeReadme(text) {
    const pairs = [];
    for (const line of text.split(/\r?\n/)) {
        const repoMatch = GITHUB_URL.exec(line);
        if (!repoMatch)
            continue;
        const repoId = normalizeRepoId(`${repoMatch[1] ?? ''}/${(repoMatch[2] ?? '').replace(/\.git$/, '')}`);
        const names = [];
        for (const match of line.matchAll(NPM_URL)) {
            names.push(`${match[1] ?? ''}${match[2] ?? ''}`);
        }
        for (const name of names) {
            if (!name)
                continue;
            pairs.push({ repoId, npmName: name, confidence: 0.95, source: 'awesome' });
        }
    }
    return pairs;
}
/** Parse a package.json-style repository URL into owner/repo. */
export function repoFromRepositoryUrl(url) {
    if (!url)
        return null;
    const cleaned = url.replace(/^git\+/, '').replace(/^git@github\.com:/, 'github.com/').replace(/^github:/, 'github.com/');
    const match = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?]|$)/.exec(cleaned);
    if (!match)
        return null;
    return normalizeRepoId(`${match[1] ?? ''}/${match[2] ?? ''}`);
}
export function registryMappings(packages) {
    const pairs = [];
    for (const pkg of packages) {
        const repoId = repoFromRepositoryUrl(pkg.repository);
        if (!repoId)
            continue;
        pairs.push({ repoId, npmName: pkg.name, confidence: 1, source: 'registry' });
    }
    return pairs;
}
export function buildMappings(input) {
    const repos = new Set(input.repoIds.map(normalizeRepoId));
    const floor = input.heuristicFloor ?? 0.3;
    const authoritative = [...(input.manual ?? []), ...(input.awesome ?? []), ...registryMappings(input.packages)].filter((pair) => repos.has(pair.repoId));
    const byRepo = new Map();
    const push = (pair) => {
        if (!repos.has(pair.repoId))
            return;
        const list = byRepo.get(pair.repoId) ?? [];
        if (list.some((row) => row.npmName === pair.npmName))
            return;
        list.push({ repoId: pair.repoId, npmName: pair.npmName, confidence: pair.confidence, source: pair.source });
        byRepo.set(pair.repoId, list);
    };
    for (const pair of authoritative)
        push(pair);
    const ambiguous = [];
    const packageNames = [...new Set(input.packages.map((pkg) => pkg.name))];
    for (const repoId of repos) {
        if (byRepo.has(repoId))
            continue;
        const scored = packageNames
            .map((name) => ({ name, confidence: heuristicConfidence(repoId, name) }))
            .filter((candidate) => candidate.confidence >= floor)
            .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
        const best = scored[0];
        if (!best)
            continue;
        const ties = scored.filter((candidate) => candidate.confidence === best.confidence);
        if (ties.length > 1)
            ambiguous.push({ repoId, candidates: ties.map((tie) => tie.name) });
        push({ repoId, npmName: best.name, confidence: best.confidence, source: 'heuristic' });
    }
    const mapping = [...byRepo.values()].flat().sort((a, b) => a.repoId.localeCompare(b.repoId) || b.confidence - a.confidence);
    const unmatched = [...repos].filter((repoId) => !byRepo.has(repoId)).sort();
    void input.now;
    return { mapping, unmatched, ambiguous };
}
/** Primary package per repo: highest confidence, then manual first. */
export function primaryPackage(rows) {
    let best = null;
    const rank = (source) => (source === 'manual' ? 3 : source === 'registry' ? 2 : source === 'awesome' ? 2 : 1);
    for (const row of rows) {
        if (!best || row.confidence > best.confidence || (row.confidence === best.confidence && rank(row.source) > rank(best.source)))
            best = row;
    }
    return best;
}
//# sourceMappingURL=mapping.js.map
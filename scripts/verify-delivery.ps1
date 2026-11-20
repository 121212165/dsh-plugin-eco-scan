<#
.SYNOPSIS
  一条命令校验交付：commit / 远端 tree 文件 / issue 列表 / .gitignore check-ignore。
  替代手工拼 git + gh + gh api。所有递归搜索都显式限定在 -Workdir 内（不在 C:\Users\lenovo 全盘扫）。

.EXAMPLE
  pwsh -File scripts/verify-delivery.ps1 -Repo 121212165/dsh-plugin-eco-scan -Branch batch3-docs-process

.EXAMPLE
  # 推送前本地自测：跳过远端 commit/tree 检查
  pwsh -File scripts/verify-delivery.ps1 -LocalOnly -RequiredFiles data/reports/_TEMPLATE.md

.NOTES
  gh api 传参数必须显式 --method GET，否则裸 -f 会被 gh 翻成 POST 导致 404（Windows 环境备忘）。
#>
[CmdletBinding()]
param(
  [string]$Repo = '121212165/dsh-plugin-eco-scan',
  [string]$Branch = 'batch3-docs-process',
  [string]$Workdir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int[]]$ExpectedIssues = @(5, 7, 8, 9, 10, 11, 14, 21),
  [string[]]$RequiredFiles = @(
    'README.md',
    'CONTRIBUTING.md',
    'data/eco-data.json',
    'data/AGENT_BRIEF.md',
    'data/DATA-DICTIONARY.md',
    'data/digest.md',
    'data/runbook.md',
    'data/heat.mjs',
    'data/reports/_TEMPLATE.md',
    'data/reports/MANIFEST.md',
    'data/reports/FINAL-SUMMARY.md',
    'data/reports/RETRO.md',
    'scripts/check-reports.mjs',
    'scripts/verify-delivery.ps1'
  ),
  [switch]$LocalOnly
)

# pwsh -File 不会把 "a,b,c" 解析成数组，这里统一拆开，交互调用与 -File 调用都兼容。
$RequiredFiles = @($RequiredFiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$failures = [System.Collections.Generic.List[string]]::new()
function Assert-Check {
  param([bool]$Ok, [string]$Label, [string]$Detail = '')
  if ($Ok) { Write-Host "  [PASS] $Label" -ForegroundColor Green }
  else {
    Write-Host "  [FAIL] $Label $Detail" -ForegroundColor Red
    $script:failures.Add(($Label + ' ' + $Detail).Trim())
  }
}
function Get-Out {
  # 统一把原生命令输出（含 stderr）收敛成去空白的字符串，避免数组/标量差异。
  param([scriptblock]$Block)
  return ((& $Block 2>&1 | Out-String).Trim())
}

Write-Host "== verify-delivery: repo=$Repo branch=$Branch workdir=$Workdir ==" -ForegroundColor Cyan

# ---- 1. 本地仓库与 commit ----
Write-Host "[1] 本地仓库 / commit"
Assert-Check (Test-Path -LiteralPath (Join-Path $Workdir '.git')) 'worktree 存在'
$head = Get-Out { git -C $Workdir rev-parse HEAD }
$curBranch = Get-Out { git -C $Workdir rev-parse --abbrev-ref HEAD }
Assert-Check ($head -match '^[0-9a-f]{40}$') '本地 HEAD 是完整 SHA' "got='$head'"
Assert-Check ($curBranch -eq $Branch) "当前分支为 $Branch" "got='$curBranch'"
Write-Host "      HEAD=$head"

# ---- 2. .gitignore：锚定 + 例外 + check-ignore ----
Write-Host "[2] .gitignore 锚定与报告目录例外"
$giRaw = Get-Content -LiteralPath (Join-Path $Workdir '.gitignore') -Encoding UTF8 -Raw
Assert-Check ($giRaw -match '(?m)^/reports/\s*$') '.gitignore 使用 /reports/（已锚定）'
Assert-Check ($giRaw -match '(?m)^!data/reports/') '.gitignore 保留 !data/reports/ 例外'
Assert-Check ($giRaw -match '(?m)^!data/reports/\*\*\s*$') '.gitignore 保留 !data/reports/** 例外'
$ci = Get-Out { git -C $Workdir check-ignore -v 'data/reports/FINAL-SUMMARY.md' }
Assert-Check ([string]::IsNullOrWhiteSpace($ci)) 'check-ignore data/reports/FINAL-SUMMARY.md 无输出' "got='$ci'"

# ---- 3. 递归搜索范围：只在工作目录内 ----
Write-Host "[3] 递归搜索范围限定到 -Workdir"
$dataDir = Join-Path $Workdir 'data'
$scoped = @(Get-ChildItem -LiteralPath $dataDir -Recurse -File -ErrorAction SilentlyContinue)
$outside = @($scoped | Where-Object { -not $_.FullName.StartsWith($Workdir, [System.StringComparison]::OrdinalIgnoreCase) })
Assert-Check ($scoped.Count -gt 0) '工作目录内可见 data/ 文件' "count=$($scoped.Count)"
Assert-Check ($outside.Count -eq 0) '递归结果全部落在 -Workdir 内' "outside=$($outside.Count)"

if (-not $LocalOnly) {
  # ---- 4. 远端 commit ----
  Write-Host "[4] 远端分支 commit"
  $remoteSha = Get-Out { gh api "repos/$Repo/branches/$Branch" --jq '.commit.sha' }
  Assert-Check ($remoteSha -eq $head) '本地 HEAD = 远端分支 SHA' "local=$head remote=$remoteSha"

  # ---- 5. 远端 tree 文件（gh api --method GET -f recursive=1）----
  Write-Host "[5] 远端 tree 必备文件"
  $treeRaw = Get-Out { gh api "repos/$Repo/git/trees/$Branch" --method GET -f 'recursive=1' --jq '.tree[].path' }
  $treePaths = @($treeRaw -split "`r?`n" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() })
  Assert-Check ($treePaths.Count -gt 0) '远端 tree 可读取' "count=$($treePaths.Count)"
  foreach ($f in $RequiredFiles) {
    Assert-Check ($treePaths -contains $f) "tree 含 $f"
  }
} else {
  Write-Host "[4/5] 已跳过远端检查（-LocalOnly）" -ForegroundColor DarkGray
  foreach ($f in $RequiredFiles) {
    Assert-Check (Test-Path -LiteralPath (Join-Path $Workdir $f)) "本地含 $f"
  }
}

# ---- 6. issue 列表 ----
Write-Host "[6] issue 列表"
$issuesRaw = Get-Out { gh issue list --repo $Repo --state all --limit 200 --json number --jq '.[].number' }
$issueNums = @($issuesRaw -split "`r?`n" | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
Assert-Check ($issueNums.Count -gt 0) 'issue 列表可读取' "count=$($issueNums.Count)"
foreach ($n in $ExpectedIssues) {
  Assert-Check ($issueNums -contains $n) "issue #$n 存在"
}

Write-Host ""
if ($failures.Count -gt 0) {
  Write-Host "FAILED: $($failures.Count) 项校验未通过" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}
Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
exit 0

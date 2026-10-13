$gitIndex = Join-Path $PSScriptRoot ".git\temp_index"
if (Test-Path $gitIndex) { Remove-Item -Force $gitIndex }
$env:GIT_INDEX_FILE = $gitIndex

git --work-tree=frontend/dist add -A
$tree = (git write-tree).Trim()
Remove-Item -Force $gitIndex
Remove-Item Env:\GIT_INDEX_FILE

$parent = (git rev-parse origin/gh-pages).Trim()
$commit = (git commit-tree $tree -p $parent -m "deploy: Step 4 full rectangular camera frame with centered face guide HUD").Trim()
git update-ref refs/heads/gh-pages $commit
Write-Host "gh-pages branch successfully updated to commit: $commit"
git push origin gh-pages

# Accessibility helper for the Blinkling element locator (Windows).
# Reads {"cmd": "tree"|"focus"|"selection", "window": {app, title, pid, bounds}}
# on stdin and prints one JSON document in the shape the Linux helper uses:
#   tree      -> {found, nodes: [{i, p, role, secure, name, text, bounds}]}
#   focus     -> {found, secure, app, title}
#   selection -> {found, text, bounds}
# Coordinates are physical pixels. Password fields are reported with
# "secure": true and never with a name or text.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$MaxNodes = 600
$MaxText = 4000
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$spec = $request.window

function Get-Rect($element) {
  $r = $element.Current.BoundingRectangle
  if ($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0) { return $null }
  return @{ x = [math]::Round($r.X); y = [math]::Round($r.Y); width = [math]::Round($r.Width); height = [math]::Round($r.Height) }
}

function Test-Near($rect, $bounds, $tolerance) {
  return ([math]::Abs($rect.x - $bounds.x) -le $tolerance) -and
         ([math]::Abs($rect.y - $bounds.y) -le $tolerance) -and
         ([math]::Abs($rect.width - $bounds.width) -le $tolerance) -and
         ([math]::Abs($rect.height - $bounds.height) -le $tolerance)
}

function Find-Window($spec) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  $best = $null
  $bestScore = 0
  foreach ($w in $windows) {
    $score = 0
    $rect = Get-Rect $w
    if ($rect -and $spec.bounds -and (Test-Near $rect $spec.bounds 12)) { $score += 4 }
    if ($spec.pid -and $w.Current.ProcessId -eq $spec.pid) { $score += 2 }
    if ($spec.title -and $w.Current.Name -eq $spec.title) { $score += 2 }
    if ($score -gt $bestScore) { $best = $w; $bestScore = $score }
  }
  if ($bestScore -ge 3) { return $best }
  return $null
}

function Get-Text($element) {
  try {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      return [string]$pattern.Current.Value
    }
    if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      return [string]$pattern.DocumentRange.GetText($MaxText)
    }
  } catch { }
  return ''
}

function Get-Tree($spec) {
  $window = Find-Window $spec
  if (-not $window) { return @{ found = $false; nodes = @() } }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $nodes = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push(@($window, -1))
  while ($stack.Count -gt 0 -and $nodes.Count -lt $MaxNodes) {
    $item = $stack.Pop()
    $element = $item[0]
    $rect = Get-Rect $element
    if (-not $rect) { continue }
    $secure = [bool]$element.Current.IsPassword
    $index = $nodes.Count
    $text = ''
    if (-not $secure) { $text = Get-Text $element }
    if ($text.Length -gt $MaxText) { $text = $text.Substring(0, $MaxText) }
    [void]$nodes.Add(@{
      i = $index; p = $item[1]
      role = $element.Current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
      secure = $secure
      name = $(if ($secure) { '' } else { [string]$element.Current.Name })
      text = $text
      bounds = $rect
    })
    $child = $walker.GetLastChild($element)
    while ($child) {
      $stack.Push(@($child, $index))
      $child = $walker.GetPreviousSibling($child)
    }
  }
  return @{ found = $true; nodes = $nodes }
}

function Get-FocusInfo {
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (-not $element) { return @{ found = $false } }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $top = $element
  while ($true) {
    $parent = $walker.GetParent($top)
    if (-not $parent -or $parent -eq [System.Windows.Automation.AutomationElement]::RootElement) { break }
    $top = $parent
  }
  $app = ''
  try { $app = (Get-Process -Id $top.Current.ProcessId).ProcessName } catch { }
  return @{ found = $true; secure = [bool]$element.Current.IsPassword; app = $app; title = [string]$top.Current.Name }
}

function Get-SelectionInfo($spec) {
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (-not $element -or $element.Current.IsPassword) { return @{ found = $false } }
  $pattern = $null
  if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) { return @{ found = $false } }
  $ranges = $pattern.GetSelection()
  if ($ranges.Length -eq 0) { return @{ found = $false } }
  $text = $ranges[0].GetText($MaxText)
  $rects = $ranges[0].GetBoundingRectangles()
  if (-not $text -or $rects.Length -lt 4) { return @{ found = $false } }
  return @{ found = $true; text = $text; bounds = @{ x = [math]::Round($rects[0]); y = [math]::Round($rects[1]); width = [math]::Round($rects[2]); height = [math]::Round($rects[3]) } }
}

$answer = switch ($request.cmd) {
  'tree' { Get-Tree $spec }
  'focus' { Get-FocusInfo }
  'selection' { Get-SelectionInfo $spec }
  default { @{ found = $false } }
}
$answer | ConvertTo-Json -Depth 6 -Compress

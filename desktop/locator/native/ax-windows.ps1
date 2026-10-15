# Prints the UI Automation tree of the top-level window at a screen point as one
# JSON object, the same shape ax-linux.py prints (pixels, "p" is the parent index):
#   { frame: {name,x,y,width,height}, nodes: [{p,role,name,text,x,y,w,h,secure}] }
# A password field is printed with no name and no text: IsPassword is checked
# before anything else is read, so its value never leaves this script.
#
# usage: ax-windows.ps1 X Y TITLE [MAX_NODES] [BUDGET_MS]
param(
  [int]$X,
  [int]$Y,
  [string]$Title = "",
  [int]$Max = 800,
  [int]$BudgetMs = 900
)
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
$AE = [System.Windows.Automation.AutomationElement]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$clock = [System.Diagnostics.Stopwatch]::StartNew()

$hit = $AE::FromPoint((New-Object System.Windows.Point($X, $Y)))
$top = $hit
while ($top -ne $null) {
  $parent = $walker.GetParent($top)
  if ($parent -eq $null -or $parent -eq $AE::RootElement) { break }
  $top = $parent
}
if ($top -eq $null) { '{"frame":null,"nodes":[]}'; exit 0 }

$box = $top.Current.BoundingRectangle
$nodes = New-Object System.Collections.ArrayList
$queue = New-Object System.Collections.Queue
$queue.Enqueue(@($top, -1, 0))
while ($queue.Count -gt 0 -and $nodes.Count -lt $Max -and $clock.ElapsedMilliseconds -lt $BudgetMs) {
  $item = $queue.Dequeue()
  $el = $item[0]; $parent = $item[1]; $depth = $item[2]
  $cur = $el.Current
  if ($cur.IsOffscreen) { continue }
  $rect = $cur.BoundingRectangle
  $index = $parent
  if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
    $secure = [bool]$cur.IsPassword
    $text = ""
    if (-not $secure) {
      $pattern = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        $text = [string]$pattern.Current.Value
        if ($text.Length -gt 4000) { $text = $text.Substring(0, 4000) }
      }
    }
    $index = $nodes.Count
    [void]$nodes.Add([ordered]@{
      p = $parent
      role = $cur.ControlType.ProgrammaticName
      name = $(if ($secure) { "" } else { [string]$cur.Name })
      text = $text
      x = [int]$rect.X; y = [int]$rect.Y; w = [int]$rect.Width; h = [int]$rect.Height
      secure = $secure
    })
  }
  if ($depth -lt 40) {
    $child = $walker.GetFirstChild($el)
    while ($child -ne $null) {
      $queue.Enqueue(@($child, $index, ($depth + 1)))
      $child = $walker.GetNextSibling($child)
    }
  }
}
[ordered]@{
  frame = [ordered]@{ name = [string]$top.Current.Name; x = [int]$box.X; y = [int]$box.Y; width = [int]$box.Width; height = [int]$box.Height }
  nodes = $nodes
} | ConvertTo-Json -Compress -Depth 5

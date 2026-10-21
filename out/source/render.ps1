param([string]$Pptx, [string]$OutDir, [string]$Pdf = "", [string]$SaveEmbedded = "")
# Renders every slide of $Pptx to PNG (1920x1080) in $OutDir, optionally a PDF and a font-embedded copy.
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open($Pptx, $true, $false, $false)  # read-only, untitled=false, no window
  $n = $pres.Slides.Count
  for ($i = 1; $i -le $n; $i++) {
    $p = Join-Path $OutDir ("slide-{0:D2}.png" -f $i)
    $pres.Slides.Item($i).Export($p, "PNG", 1920, 1080)
  }
  if ($Pdf -ne "") { $pres.SaveAs($Pdf, 32) }            # 32 = ppSaveAsPDF (fonts embedded)
  $pres.Close()
  if ($SaveEmbedded -ne "") {
    $pres2 = $app.Presentations.Open($Pptx, $false, $false, $false)
    $pres2.SaveAs($SaveEmbedded, 24, -1)                 # 24 = ppSaveAsOpenXMLPresentation, EmbedTrueTypeFonts = true
    $pres2.Close()
  }
  "RENDERED $n slides"
} finally {
  $app.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}

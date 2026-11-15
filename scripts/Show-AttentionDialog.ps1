[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Message = 'Task completed.',

    [Parameter()]
    [string] $Options,

    [Parameter()]
    [string] $SoundPath,

    [Parameter()]
    [switch] $Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$player = $null
if (-not $Silent) {
    try {
        $sound = if ([string]::IsNullOrWhiteSpace($SoundPath)) { Join-Path $PSScriptRoot '..\hey_listen.mp3' } else { $SoundPath }
        $resolved = Resolve-Path -LiteralPath $sound -ErrorAction Stop
        Add-Type -AssemblyName PresentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $player.Open([Uri]::new($resolved.Path))
        $player.Play()
    } catch {
        Write-Warning "Could not play attention sound: $($_.Exception.Message)"
    }
}

$naviImage = $null
$naviIcon = $null
try {
    $imagePath = Join-Path $PSScriptRoot '..\navi.png' | Resolve-Path -ErrorAction Stop
    $naviImage = [System.Drawing.Image]::FromFile($imagePath.Path)
    $iconBitmap = New-Object System.Drawing.Bitmap $naviImage, (New-Object System.Drawing.Size 32, 32)
    $naviIcon = [System.Drawing.Icon]::FromHandle($iconBitmap.GetHicon())
} catch {
    Write-Warning "Could not load navi image: $($_.Exception.Message)"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'hey, listen!'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.AutoSize = $true
$form.AutoSizeMode = [System.Windows.Forms.AutoSizeMode]::GrowAndShrink
$form.Padding = New-Object System.Windows.Forms.Padding 15
if ($null -ne $naviIcon) { $form.Icon = $naviIcon }

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.AutoSize = $true
$layout.AutoSizeMode = [System.Windows.Forms.AutoSizeMode]::GrowAndShrink
$layout.ColumnCount = 2
$layout.RowCount = 2
$form.Controls.Add($layout)

if ($null -ne $naviImage) {
    $picture = New-Object System.Windows.Forms.PictureBox
    $picture.Image = $naviImage
    $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $picture.Size = New-Object System.Drawing.Size 64, 64
    $picture.Margin = New-Object System.Windows.Forms.Padding 5, 5, 15, 5
    $layout.Controls.Add($picture, 0, 0)
}

$label = New-Object System.Windows.Forms.Label
$label.Text = $Message
$label.AutoSize = $true
$label.MaximumSize = New-Object System.Drawing.Size 300, 0
$label.Anchor = [System.Windows.Forms.AnchorStyles]::Left
$label.Margin = New-Object System.Windows.Forms.Padding 5, 20, 5, 5
$layout.Controls.Add($label, 1, 0)

$buttonPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$buttonPanel.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$buttonPanel.AutoSize = $true
$buttonPanel.AutoSizeMode = [System.Windows.Forms.AutoSizeMode]::GrowAndShrink
$buttonPanel.Anchor = [System.Windows.Forms.AnchorStyles]::Right
$buttonPanel.Margin = New-Object System.Windows.Forms.Padding 5, 10, 5, 5
$layout.Controls.Add($buttonPanel, 1, 1)

$script:SelectedOption = $null
$state = [pscustomobject]@{ Selected = $null }

$optionList = @()
if (-not [string]::IsNullOrWhiteSpace($Options)) {
    $optionList = $Options -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}
$buttonLabels = if ($optionList.Count -gt 0) { $optionList } else { @('OK') }

# First option is the default (Enter) and appears leftmost.
$firstButton = $null
foreach ($labelText in ($buttonLabels | Select-Object)) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = $labelText
    $btn.AutoSize = $true
    $btn.Margin = New-Object System.Windows.Forms.Padding 6, 0, 0, 0
    $btn.Tag = $labelText
    $btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $btn.Add_Click({ param($sender, $e) $state.Selected = [string]$sender.Tag }.GetNewClosure())
    $buttonPanel.Controls.Add($btn)
    if ($null -eq $firstButton) { $firstButton = $btn }
}

# First option is the default (Enter).
if ($null -ne $firstButton) { $form.AcceptButton = $firstButton }

$result = $form.ShowDialog()
$script:SelectedOption = $state.Selected

if ($null -ne $player) {
    try { $player.Stop(); $player.Close() } catch { }
}
if ($null -ne $naviIcon) { try { $naviIcon.Dispose() } catch { } }
if ($null -ne $form) { try { $form.Dispose() } catch { } }

if ($result -ne [System.Windows.Forms.DialogResult]::OK -or $null -eq $script:SelectedOption) {
    throw "The attention dialog closed without acknowledgment (result: $result)."
}

Write-Output $script:SelectedOption

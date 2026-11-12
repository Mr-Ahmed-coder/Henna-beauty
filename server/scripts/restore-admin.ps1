# Restore Deployed Administrator Access for Henna & Beauty Salon
# Target: Deployed Render Backend on Atlas database (salon_demo)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$jsScript = Join-Path $scriptDir "restore-admin.js"

Write-Host "Connecting to deployed salon_demo database on Atlas to inspect administrator accounts..." -ForegroundColor Cyan

$adminsJson = node $jsScript --list
if ($LASTEXITCODE -ne 0 -or -not $adminsJson) {
  Write-Error "Failed to retrieve administrator accounts from the database."
  exit 1
}

$admins = $adminsJson | ConvertFrom-Json
if ($admins.Count -eq 0) {
  Write-Error "No active administrator accounts found."
  exit 1
}

Write-Host "`nFound $($admins.Count) active administrator account(s):" -ForegroundColor Green
for ($i = 0; $i -lt $admins.Count; $i++) {
  $acc = $admins[$i]
  Write-Host "  [$($i + 1)] Name: $($acc.name) | Current Email: $($acc.email) | ID: $($acc._id)" -ForegroundColor Yellow
}

$choice = 0
while ($choice -lt 1 -or $choice -gt $admins.Count) {
  $rawChoice = Read-Host "`nSelect an administrator account to restore access for [1-$($admins.Count)]"
  if ($rawChoice -match '^\d+$') {
    $choice = [int]$rawChoice
  }
}

$selected = $admins[$choice - 1]
Write-Host "`nSelected account: '$($selected.name)' (ID: $($selected._id))" -ForegroundColor Cyan

$newEmail = Read-Host "Enter email to use (Press Enter to keep '$($selected.email)')"
if ([string]::IsNullOrWhiteSpace($newEmail)) {
  $newEmail = $selected.email
} else {
  $newEmail = $newEmail.Trim().ToLower()
}

$passwordMatch = $false
while (-not $passwordMatch) {
  $secret1 = Read-Host "Enter new password for $newEmail (12-128 characters)" -AsSecureString
  $pass1 = [System.Net.NetworkCredential]::new('', $secret1).Password
  
  if ($pass1.Length -lt 12 -or $pass1.Length -gt 128) {
    Write-Warning "Password must be between 12 and 128 characters. Please try again."
    if ($secret1) { $secret1.Dispose() }
    continue
  }
  
  $secret2 = Read-Host "Repeat new password" -AsSecureString
  $pass2 = [System.Net.NetworkCredential]::new('', $secret2).Password
  
  if ($pass1 -cne $pass2) {
    Write-Warning "Passwords did not match. Please try again."
  } else {
    $passwordMatch = $true
    $finalPassword = $pass1
  }
  
  if ($secret1) { $secret1.Dispose() }
  if ($secret2) { $secret2.Dispose() }
}

Write-Host "`nUpdating credentials securely on Atlas in a database transaction..." -ForegroundColor Cyan

$updatePayload = @{
  id = $selected._id
  email = $newEmail
  password = $finalPassword
} | ConvertTo-Json -Compress

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$updateResult = $updatePayload | node $jsScript --update

if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to update administrator account."
  exit 1
}

Write-Host "Credentials updated and old sessions revoked successfully!" -ForegroundColor Green

Write-Host "`nNow running live verification against the deployed Render backend..." -ForegroundColor Cyan

$verifyPayload = @{
  email = $newEmail
  password = $finalPassword
} | ConvertTo-Json -Compress

$verifyPayload | node $jsScript --verify-api

if ($LASTEXITCODE -eq 0) {
  Write-Host "`n========================================================" -ForegroundColor Green
  Write-Host " SUCCESS: Deployed Administrator Access is fully restored!" -ForegroundColor Green
  Write-Host " Email:    $newEmail" -ForegroundColor Yellow
  Write-Host " Portal:   https://henna-beauty-demo-api.onrender.com/admin" -ForegroundColor Cyan
  Write-Host "========================================================`n" -ForegroundColor Green
} else {
  Write-Warning "Live API verification encountered an issue. See details above."
}

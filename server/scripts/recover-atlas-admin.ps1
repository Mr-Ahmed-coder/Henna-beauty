param([switch]$InspectOnly)

$recoveryScript = Join-Path $PSScriptRoot 'recover-atlas-admin.js'
$atlasEnv = Join-Path $PSScriptRoot '../.env.atlas'
$nodeArgs = @()
if (Test-Path -LiteralPath $atlasEnv) { $nodeArgs += "--env-file=$atlasEnv" }

node @nodeArgs $recoveryScript --inspect
if ($LASTEXITCODE -ne 0 -or $InspectOnly) { exit $LASTEXITCODE }

$target = Read-Host 'Type the exact verified cluster/database shown above'
$operation = Read-Host 'Type reset or bootstrap as indicated above'
if ($operation -cnotin @('reset', 'bootstrap')) { throw 'Recovery cancelled.' }
$email = Read-Host 'New administrator email'
$name = if ($operation -eq 'bootstrap') { Read-Host 'Administrator display name' }

try {
  $secret = Read-Host 'New password (12–128 characters)' -AsSecureString
  $repeat = Read-Host 'Repeat the new password' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $secret).Password
  if ($password -cne [System.Net.NetworkCredential]::new('', $repeat).Password) {
    throw 'Passwords differ. Recovery cancelled.'
  }
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  @{ confirmTarget = $target; operation = $operation; name = $name; email = $email; password = $password } |
    ConvertTo-Json -Compress |
    node @nodeArgs $recoveryScript --apply
  $recoveryStatus = $LASTEXITCODE
} finally {
  if ($secret) { $secret.Dispose() }
  if ($repeat) { $repeat.Dispose() }
  Remove-Variable password, secret, repeat -ErrorAction SilentlyContinue
}
exit $recoveryStatus

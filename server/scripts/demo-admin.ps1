param([switch]$VerifyOnly)

$email = Read-Host 'Demo administrator email'

try {
  $secret = Read-Host 'Demo password (12-128 characters)' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $secret).Password
  if (-not $VerifyOnly) {
    $repeat = Read-Host 'Repeat the demo password' -AsSecureString
    if ($password -cne [System.Net.NetworkCredential]::new('', $repeat).Password) {
      throw 'Passwords differ. Demo credentials were not changed.'
    }
  }
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  @{ email = $email; password = $password; verifyOnly = $VerifyOnly.IsPresent } |
    ConvertTo-Json -Compress |
    node (Join-Path $PSScriptRoot 'demo-admin.js')
  $status = $LASTEXITCODE
} finally {
  if ($secret) { $secret.Dispose() }
  if ($repeat) { $repeat.Dispose() }
  Remove-Variable password, secret, repeat -ErrorAction SilentlyContinue
}
exit $status

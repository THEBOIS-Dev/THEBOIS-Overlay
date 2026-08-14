<#
.EXAMPLE
  .\reset-telemetry.ps1 -AdminKey "admin-key"

.EXAMPLE
  .\reset-telemetry.ps1 -AdminKey "admin-key" -ApiKey "user-api-key"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AdminKey,

    [string]$ApiKey,

    [string]$ApiBase = "https://overlay.kyizl.is-a.dev",

    [string]$TelemetryPath = "$env:APPDATA\kyra\telemetry.enc",

    [string]$LegacyTelemetryPath = "$env:APPDATA\kyra\telemetry.json",

    [string]$LocalStatePath = "$env:APPDATA\kyra\Local State"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Security

function Get-MaskedKey {
    param([string]$Key)

    if ($Key.Length -gt 6) {
        return "..." + $Key.Substring($Key.Length - 6)
    }

    return $Key
}

function Get-DpapiMasterKey {
    if (-not (Test-Path -LiteralPath $LocalStatePath)) {
        Write-Verbose "No Local State file at `"$LocalStatePath`"."
        return $null
    }

    $localState = Get-Content -LiteralPath $LocalStatePath -Raw | ConvertFrom-Json
    $encodedKey = $localState.os_crypt.encrypted_key

    if ([string]::IsNullOrEmpty($encodedKey)) {
        Write-Verbose "Local State has no os_crypt.encrypted_key."
        return $null
    }

    $keyBytes = [System.Convert]::FromBase64String($encodedKey)

    if ($keyBytes.Length -lt 5) {
        Write-Verbose "encrypted_key is shorter than the expected DPAPI-prefixed layout."
        return $null
    }

    $prefix = [System.Text.Encoding]::ASCII.GetString($keyBytes, 0, 5)

    if ($prefix -ne "DPAPI") {
        Write-Verbose "encrypted_key does not start with the expected DPAPI prefix."
        return $null
    }

    $dpapiBlob = New-Object byte[] ($keyBytes.Length - 5)
    [Array]::Copy($keyBytes, 5, $dpapiBlob, 0, $dpapiBlob.Length)

    return [System.Security.Cryptography.ProtectedData]::Unprotect(
        $dpapiBlob,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
}

function Invoke-BCryptAesGcmDecrypt {
    param(
        [byte[]]$Key,
        [byte[]]$Nonce,
        [byte[]]$Ciphertext,
        [byte[]]$Tag
    )

    if (-not ("Kyra.BCryptGcm" -as [type])) {
        Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Kyra
{
    public static class BCryptGcm
    {
        [DllImport("bcrypt.dll", CharSet = CharSet.Unicode)]
        static extern int BCryptOpenAlgorithmProvider(out IntPtr phAlgorithm, string pszAlgId, string pszImplementation, uint dwFlags);

        [DllImport("bcrypt.dll")]
        static extern int BCryptCloseAlgorithmProvider(IntPtr hAlgorithm, uint dwFlags);

        [DllImport("bcrypt.dll", CharSet = CharSet.Unicode)]
        static extern int BCryptSetProperty(IntPtr hObject, string pszProperty, byte[] pbInput, int cbInput, uint dwFlags);

        [DllImport("bcrypt.dll")]
        static extern int BCryptGenerateSymmetricKey(IntPtr hAlgorithm, out IntPtr phKey, IntPtr pbKeyObject, int cbKeyObject, byte[] pbSecret, int cbSecret, uint dwFlags);

        [DllImport("bcrypt.dll")]
        static extern int BCryptDestroyKey(IntPtr hKey);

        [StructLayout(LayoutKind.Sequential)]
        struct BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO
        {
            public int cbSize;
            public int dwInfoVersion;
            public IntPtr pbNonce;
            public int cbNonce;
            public IntPtr pbAuthData;
            public int cbAuthData;
            public IntPtr pbTag;
            public int cbTag;
            public IntPtr pbMacContext;
            public int cbMacContext;
            public int cbAAD;
            public long cbData;
            public int dwFlags;
        }

        [DllImport("bcrypt.dll")]
        static extern int BCryptDecrypt(IntPtr hKey, byte[] pbInput, int cbInput, ref BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO pPaddingInfo, byte[] pbIV, int cbIV, byte[] pbOutput, int cbOutput, out int pcbResult, uint dwFlags);

        public static byte[] Decrypt(byte[] key, byte[] nonce, byte[] ciphertext, byte[] tag)
        {
            IntPtr hAlg;
            int status = BCryptOpenAlgorithmProvider(out hAlg, "AES", null, 0);
            if (status != 0) throw new InvalidOperationException("BCryptOpenAlgorithmProvider failed: " + status);

            byte[] chainMode = System.Text.Encoding.Unicode.GetBytes("ChainingModeGCM\0");
            status = BCryptSetProperty(hAlg, "ChainingMode", chainMode, chainMode.Length, 0);
            if (status != 0) throw new InvalidOperationException("BCryptSetProperty failed: " + status);

            IntPtr hKey;
            status = BCryptGenerateSymmetricKey(hAlg, out hKey, IntPtr.Zero, 0, key, key.Length, 0);
            if (status != 0) throw new InvalidOperationException("BCryptGenerateSymmetricKey failed: " + status);

            GCHandle nonceHandle = GCHandle.Alloc(nonce, GCHandleType.Pinned);
            GCHandle tagHandle = GCHandle.Alloc(tag, GCHandleType.Pinned);

            try
            {
                var info = new BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO();
                info.cbSize = Marshal.SizeOf(typeof(BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO));
                info.dwInfoVersion = 1;
                info.pbNonce = nonceHandle.AddrOfPinnedObject();
                info.cbNonce = nonce.Length;
                info.pbTag = tagHandle.AddrOfPinnedObject();
                info.cbTag = tag.Length;

                byte[] output = new byte[ciphertext.Length];
                int resultLen;
                status = BCryptDecrypt(hKey, ciphertext, ciphertext.Length, ref info, null, 0, output, output.Length, out resultLen, 0);
                if (status != 0) throw new InvalidOperationException("BCryptDecrypt failed: " + status);

                if (resultLen != output.Length)
                {
                    byte[] trimmed = new byte[resultLen];
                    Array.Copy(output, trimmed, resultLen);
                    return trimmed;
                }

                return output;
            }
            finally
            {
                nonceHandle.Free();
                tagHandle.Free();
                BCryptDestroyKey(hKey);
                BCryptCloseAlgorithmProvider(hAlg, 0);
            }
        }
    }
}
'@
    }

    return [Kyra.BCryptGcm]::Decrypt($Key, $Nonce, $Ciphertext, $Tag)
}

function Invoke-Aes256GcmDecrypt {
    param(
        [byte[]]$Key,
        [byte[]]$Nonce,
        [byte[]]$Ciphertext,
        [byte[]]$Tag
    )

    if (-not ("System.Security.Cryptography.AesGcm" -as [type])) {
        return Invoke-BCryptAesGcmDecrypt -Key $Key -Nonce $Nonce -Ciphertext $Ciphertext -Tag $Tag
    }

    $plaintext = New-Object byte[] $Ciphertext.Length

    try {
        $aesGcm = [System.Security.Cryptography.AesGcm]::new($Key)
    }
    catch {
        $aesGcm = [System.Security.Cryptography.AesGcm]::new($Key, 16)
    }

    try {
        $aesGcm.Decrypt($Nonce, $Ciphertext, $Tag, $plaintext)
    }
    finally {
        $aesGcm.Dispose()
    }

    return $plaintext
}

function Get-DecryptedTelemetryState {
    if (-not (Test-Path -LiteralPath $TelemetryPath)) {
        return $null
    }

    $raw = [System.IO.File]::ReadAllBytes($TelemetryPath)

    if ($raw.Length -lt 3) {
        Write-Verbose "telemetry.enc is too short to inspect."
        return $null
    }

    $prefix = [System.Text.Encoding]::ASCII.GetString($raw, 0, 3)
    if ($prefix -ne "v10") {
        Write-Verbose "telemetry.enc has no v10 prefix, treating as plaintext fallback."
        return [System.Text.Encoding]::UTF8.GetString($raw) | ConvertFrom-Json
    }

    $masterKey = Get-DpapiMasterKey
    if (-not $masterKey) {
        return $null
    }

    $payloadLength = $raw.Length - 3
    $nonceLength = 12
    $tagLength = 16
    $ciphertextLength = $payloadLength - $nonceLength - $tagLength

    if ($ciphertextLength -lt 0) {
        Write-Verbose "telemetry.enc is shorter than the expected v10 layout."
        return $null
    }

    $nonce = New-Object byte[] $nonceLength
    [Array]::Copy($raw, 3, $nonce, 0, $nonceLength)

    $ciphertext = New-Object byte[] $ciphertextLength
    [Array]::Copy($raw, 3 + $nonceLength, $ciphertext, 0, $ciphertextLength)

    $tag = New-Object byte[] $tagLength
    [Array]::Copy($raw, $raw.Length - $tagLength, $tag, 0, $tagLength)

    $plaintextBytes = Invoke-Aes256GcmDecrypt -Key $masterKey -Nonce $nonce -Ciphertext $ciphertext -Tag $tag
    $json = [System.Text.Encoding]::UTF8.GetString($plaintextBytes)

    return $json | ConvertFrom-Json
}

function Reset-BackendRecord {
    param([string]$Key)

    $maskedKey = Get-MaskedKey -Key $Key
    Write-Host "Resetting backend record for apiKey $maskedKey"

    $body = @{ apiKey = $Key } | ConvertTo-Json
    $uri = "$ApiBase/api/telemetry/reset?key=$AdminKey"

    try {
        $response = Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType "application/json"
        Write-Host "Backend reset result: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
    }
    catch {
        Write-Warning "Backend reset request failed: $_"
    }
}

$runningProcess = Get-Process -Name "Kyra Overlay" -ErrorAction SilentlyContinue
if ($runningProcess) {
    Write-Warning "Kyra Overlay looks like it's still running. Close it first, otherwise the app may re-create telemetry state right after this script deletes it."
}

$resolvedApiKey = $null

if ($ApiKey) {
    $resolvedApiKey = $ApiKey
}
else {
    try {
        $decryptedState = Get-DecryptedTelemetryState
        if ($decryptedState -and -not [string]::IsNullOrEmpty($decryptedState.apiKey)) {
            Write-Host "Decrypted local telemetry.enc." -ForegroundColor Yellow
            $resolvedApiKey = $decryptedState.apiKey
        }
    }
    catch {
        Write-Warning "Failed to decrypt telemetry.enc: $_"
    }

    if (-not $resolvedApiKey -and (Test-Path -LiteralPath $LegacyTelemetryPath)) {
        Write-Host "Found a legacy unencrypted telemetry.json, reading apiKey from it." -ForegroundColor Yellow
        $legacyState = Get-Content -LiteralPath $LegacyTelemetryPath -Raw | ConvertFrom-Json
        if (-not [string]::IsNullOrEmpty($legacyState.apiKey)) {
            $resolvedApiKey = $legacyState.apiKey
        }
    }
}

if ($resolvedApiKey) {
    Reset-BackendRecord -Key $resolvedApiKey
}
else {
    Write-Warning "No apiKey available (not supplied, and it could not be decrypted or found locally). The backend record will NOT be reset."
    Write-Warning "Re-run with -ApiKey <key> if you need the backend record cleared."
}

$removedAny = $false

foreach ($path in @($TelemetryPath, $LegacyTelemetryPath)) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
        Write-Host "Removed $path" -ForegroundColor Green
        $removedAny = $true
    }
}

if (-not $removedAny) {
    Write-Host "No local telemetry state found - nothing to remove locally." -ForegroundColor Yellow
}

Write-Host "Done. Relaunch Kyra Overlay to link a fresh Discord account." -ForegroundColor Cyan

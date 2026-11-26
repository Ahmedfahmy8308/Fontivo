#Requires -Version 5.1
<#
.SYNOPSIS
    Safe, transactional Windows System Font & Icon Recovery Script.

.DESCRIPTION
    Recovers missing Windows system font registrations (including Segoe Fluent Icons,
    Marlett, Segoe UI weights, Times New Roman, etc.) and safely quarantines confirmed
    duplicate or conflicting legacy/third-party font files that hijack core families.

    Modes:
      -DryRun (Default) : Strictly read-only preview. Modifies nothing on disk or Registry.
      -Execute          : Live recovery. Requires Administrator privileges AND -ConfirmLiveRecovery.
      -Rollback <Dir>   : Restores Registry backups and quarantined font files from a prior run.

    Safety Guarantees:
      - Never permanently deletes any font file (moves to Quarantine with restoration_manifest.json).
      - Never touches FontSubstitutes or FontLink\SystemLink.
      - Never touches 'Confirmed Windows system font' or 'Unknown — requires manual review' entries.
      - Creates full .reg backups, JSON Registry snapshots, and SHA-256 file manifest before changes.
      - Moves font file BEFORE unregistering its Registry value; skips unregistration if locked.
      - Transactional error handling with automatic rollback on failure.
#>

[CmdletBinding(DefaultParameterSetName = 'DryRun')]
param(
    [Parameter(ParameterSetName = 'DryRun')]
    [switch]$DryRun,

    [Parameter(ParameterSetName = 'Execute', Mandatory = $true)]
    [switch]$Execute,

    [Parameter(ParameterSetName = 'Execute')]
    [switch]$ConfirmLiveRecovery,

    [Parameter(ParameterSetName = 'Rollback', Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Rollback,

    [Parameter(ParameterSetName = 'DryRun')]
    [Parameter(ParameterSetName = 'Execute')]
    [switch]$IncludeNonCoreCollisions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================================
# Constants & Paths
# ============================================================================
$HklmFontsRegPath       = 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$HkcuFontsRegPath       = 'HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$HklmFontSubstRegPath   = 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes'
$HklmFontLinkRegPath    = 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontLink\SystemLink'

$HklmFontsPsPath        = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$HkcuFontsPsPath        = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$HklmSubstPsPath        = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes'
$HklmLinkPsPath         = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontLink\SystemLink'

$WinFontsDir            = Join-Path $env:WINDIR 'Fonts'
$FontCacheDir           = Join-Path $env:WINDIR 'ServiceProfiles\LocalService\AppData\Local\FontCache'
$FontivoLocalDir        = Join-Path $env:LOCALAPPDATA 'Fontivo'

# ============================================================================
# Verified Forensic Data (from forensic_data.md — Windows 11 26H2 Build 26300)
# ============================================================================

# 57 Confirmed Missing Windows System Font Registrations (27 Primary Core + 30 Additional)
$MissingSystemFonts = @(
    # --- 4A. Primary Core Missing Registry Entries (27) ---
    @{ Group = 'PrimaryCore'; ValueName = 'Marlett (TrueType)'; FileName = 'marlett.ttf'; ExpectedSha256 = 'B7397ADF2DCC24CA790348A3C26DEB2122B45E5728FD25FC588DE4CF5A75B469' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe UI Bold (TrueType)'; FileName = 'segoeuib.ttf'; ExpectedSha256 = 'B169E636719880976A97E94E3B1CB3DBE5F4A38EABC037BF9F2A9165154C3AD2' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe UI Bold Italic (TrueType)'; FileName = 'segoeuiz.ttf'; ExpectedSha256 = 'F2ECFF1A943929F07A7B872C948B1DE57FE688AC7D0BAB6FC9F624C95A97DBFE' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe UI Semibold (TrueType)'; FileName = 'seguisb.ttf'; ExpectedSha256 = '6C3FD894B19950B10C34BF64069EF821EAF2F58F959146306FEE5B367472E501' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe UI Semibold Italic (TrueType)'; FileName = 'seguisbi.ttf'; ExpectedSha256 = '16847ED882097CD1C0D45C63B6D75C3021F2133C64DB03796F57DAC198D0B2AD' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe Print Bold (TrueType)'; FileName = 'segoeprb.ttf'; ExpectedSha256 = '3CCED0162DDB9E5F1E63EE1B36FD6E581C090318DCE1A0AF01B77F5EA9952C80' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe Script Bold (TrueType)'; FileName = 'segoescb.ttf'; ExpectedSha256 = '6CD482205E1390B32A2B6327E1E5039424E346172C187074EAC12006BC51935E' },
    @{ Group = 'PrimaryCore'; ValueName = 'Segoe Fluent Icons (TrueType)'; FileName = 'SegoeIcons.ttf'; ExpectedSha256 = '031ADA497DDCC9BF3F2536EFBA2F4BD53F12A0DEAD44460A4A934B06A952DD2B' },
    @{ Group = 'PrimaryCore'; ValueName = 'Arial Bold (TrueType)'; FileName = 'arialbd.ttf'; ExpectedSha256 = '4D59199834E7439C67EA4949407639961060B21B173833F566EB60AC6FD8F5AF' },
    @{ Group = 'PrimaryCore'; ValueName = 'Arial Bold Italic (TrueType)'; FileName = 'arialbi.ttf'; ExpectedSha256 = 'D68BDF8EBFE67A72E6DB02B104E8062DE5E75C358BA9BB7EF5D0E5C70272A1C5' },
    @{ Group = 'PrimaryCore'; ValueName = 'Tahoma Bold (TrueType)'; FileName = 'tahomabd.ttf'; ExpectedSha256 = 'B16ED1A15E0CABEA8D41D9F8899C253CD61AC466AF5E3980D02BD0CF311C2267' },
    @{ Group = 'PrimaryCore'; ValueName = 'Times New Roman (TrueType)'; FileName = 'times.ttf'; ExpectedSha256 = '0BF1B21B27B370039B60ECA23D532C3FE3FB308750D8F13816DB70A6CB666804' },
    @{ Group = 'PrimaryCore'; ValueName = 'Times New Roman Bold (TrueType)'; FileName = 'timesbd.ttf'; ExpectedSha256 = 'CB8F85DEDB0AB01792BAAD20DA28D26773485AC9C21E112BB5C511A8B2001EEE' },
    @{ Group = 'PrimaryCore'; ValueName = 'Times New Roman Italic (TrueType)'; FileName = 'timesi.ttf'; ExpectedSha256 = '11E6AAE7436A5F2442EADA66493D1767C78DDE02ACEDC0AFA6E7D0AFEB0F3A14' },
    @{ Group = 'PrimaryCore'; ValueName = 'Times New Roman Bold Italic (TrueType)'; FileName = 'timesbi.ttf'; ExpectedSha256 = '5D78B5C66AC8E9C3FC94BD4EAD792E1127F5F3FAA29F768FF9B599339AFE95BF' },
    @{ Group = 'PrimaryCore'; ValueName = 'Calibri Bold (TrueType)'; FileName = 'calibrib.ttf'; ExpectedSha256 = '0A8296747536EAD27D5F48F67E911CC3B207742B3F704E66995251D12FD422E5' },
    @{ Group = 'PrimaryCore'; ValueName = 'Calibri Bold Italic (TrueType)'; FileName = 'calibriz.ttf'; ExpectedSha256 = '760539BFEDBE24E7853CA8A621D9CB1F3DE52036C116E81AAE36B33C4AB60A7C' },
    @{ Group = 'PrimaryCore'; ValueName = 'Consolas Bold (TrueType)'; FileName = 'consolab.ttf'; ExpectedSha256 = '7E8DE70C92A891722BD3FBD623DB005CAAB2BFE267E5DAB5BE46B95A44E0C7F1' },
    @{ Group = 'PrimaryCore'; ValueName = 'Consolas Bold Italic (TrueType)'; FileName = 'consolaz.ttf'; ExpectedSha256 = '9BC225EC52AA8F4B88B98BB735B1908BD72C9E31A12139FAFCC1BD6C86BED3B4' },
    @{ Group = 'PrimaryCore'; ValueName = 'Courier New Bold (TrueType)'; FileName = 'courbd.ttf'; ExpectedSha256 = '11E629CEF937CD08F942AA1BD994A71302DBE2819C72C6D4C183A623ACBB421A' },
    @{ Group = 'PrimaryCore'; ValueName = 'Courier New Bold Italic (TrueType)'; FileName = 'courbi.ttf'; ExpectedSha256 = '2D61F452DE49B57D9EF14CE8896BC1CD2ED8285C2E9FB2E73E78A4B23F91D308' },
    @{ Group = 'PrimaryCore'; ValueName = 'Georgia Bold (TrueType)'; FileName = 'georgiab.ttf'; ExpectedSha256 = '72A6CD94FAB6C179392075D3FB361E269CDDDFAD41BB7AB385FA22A37E49A900' },
    @{ Group = 'PrimaryCore'; ValueName = 'Georgia Bold Italic (TrueType)'; FileName = 'georgiaz.ttf'; ExpectedSha256 = '3F9E512F82EAF6F1B7869B82013FB79F6EAF1A41E75A0E7B96F31F35B1022AE4' },
    @{ Group = 'PrimaryCore'; ValueName = 'Cambria Bold (TrueType)'; FileName = 'cambriab.ttf'; ExpectedSha256 = '6685C657A7E292083E28F19BBF1A1E90509CE3E1130DBC4ED1C62BA3F9140543' },
    @{ Group = 'PrimaryCore'; ValueName = 'Cambria Bold Italic (TrueType)'; FileName = 'cambriaz.ttf'; ExpectedSha256 = 'FA90F376AD37F308A819B341C8185F788D30A1012829278592EAB45A41818D1A' },
    @{ Group = 'PrimaryCore'; ValueName = 'Corbel Bold (TrueType)'; FileName = 'corbelb.ttf'; ExpectedSha256 = 'FA008372F8A94945D0DAEF9DAF0BFB9E3FBA3A25FD17F2607D47AC6861BD0303' },
    @{ Group = 'PrimaryCore'; ValueName = 'Corbel Bold Italic (TrueType)'; FileName = 'corbelz.ttf'; ExpectedSha256 = '588F090AE3A6D31370457312683D14EE3A5BFBDAAA0A070B7C80225B55B23E78' },

    # --- 4B. Additional Missing Windows System Font Registry Entries (30) ---
    @{ Group = 'AdditionalSystem'; ValueName = 'Microsoft Sans Serif (TrueType)'; FileName = 'micross.ttf'; ExpectedSha256 = '89B42A12EA0379133FB2F4A1D1BD53058FB61E2343C1D509452D5761ACC85B7A' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Lucida Sans Unicode (TrueType)'; FileName = 'l_10646.ttf'; ExpectedSha256 = '97226E81F19EFF8C8FB191745748BAB920472C005D3EC4E23D9A50A12C471D92' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Verdana (TrueType)'; FileName = 'verdana.ttf'; ExpectedSha256 = '6A8481FE107EE547893C018B13DBA291C2020BEC3DE5DA6525D9AC09F6BC2105' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Verdana Bold (TrueType)'; FileName = 'verdanab.ttf'; ExpectedSha256 = 'F3245F5F38F61BD1CEEFB0F1338A5B88A21E6220832C2F43A38BBC7E1547C36F' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Verdana Italic (TrueType)'; FileName = 'verdanai.ttf'; ExpectedSha256 = '14F2EBCDAA1B77E5993A8533662E4BD3EBFE2C5771B6DAAFD8CCB39B2AD588B9' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Verdana Bold Italic (TrueType)'; FileName = 'verdanaz.ttf'; ExpectedSha256 = 'D71F81C83EC63EAA32D36D5DF7BE1D9E71D3EA9150F47CEBDA2924923CBBF18A' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Trebuchet MS Bold (TrueType)'; FileName = 'trebucbd.ttf'; ExpectedSha256 = 'DFCC306777A594D2815368547DD897E2AC82AFF8073E55D9E682569939E49B81' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Trebuchet MS Bold Italic (TrueType)'; FileName = 'trebucbi.ttf'; ExpectedSha256 = '87942234AB0CC4400088648BEF8D1F7AFC4C44E676C7ED6B32CA31462C18307D' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Comic Sans MS (TrueType)'; FileName = 'comic.ttf'; ExpectedSha256 = 'FC7FBC3FB456A363F1F719B0EC62AE093C78124BB6DA046006AE7E217A6B8575' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Comic Sans MS Bold (TrueType)'; FileName = 'comicbd.ttf'; ExpectedSha256 = '128FDCFDFDD358E1624C15DD1F84A4D0689E59AFCDEFB81F8105EFB2253B9C00' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Comic Sans MS Italic (TrueType)'; FileName = 'comici.ttf'; ExpectedSha256 = '872CDEFEA79E25FF1A8A814109593C23ED66BA46F5BB843815D49E1AB4E0BE3C' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Comic Sans MS Bold Italic (TrueType)'; FileName = 'comicz.ttf'; ExpectedSha256 = '36EB300A76582B7D39F3D34834CE1255F0B9B2830FB2E81485C4B85A5FF7F03B' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Impact (TrueType)'; FileName = 'impact.ttf'; ExpectedSha256 = 'D8BBDB72E3F930157824B2E59677D3A912D4512C14A948E6656A2E3FB0C935AD' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Palatino Linotype (TrueType)'; FileName = 'pala.ttf'; ExpectedSha256 = 'E47D594E2E2BC31B28F87B6F66483D32F925843CEB002F919C7A403ACA48813D' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Palatino Linotype Bold (TrueType)'; FileName = 'palab.ttf'; ExpectedSha256 = '8E14668BBAE03F78ED668DBE3261218881960DCD9FB80AD6C1D1DFB4226A57C3' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Palatino Linotype Italic (TrueType)'; FileName = 'palai.ttf'; ExpectedSha256 = '99F0AF2D1941707FECDA23DA38BAFBED5144A73A3720D773C05B9D4C445920ED' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Palatino Linotype Bold Italic (TrueType)'; FileName = 'palabi.ttf'; ExpectedSha256 = 'D0E722B91FFD5391CC2E7D6E976F274D5AEE9FE0B8D0FEDFFFE093763E695CDE' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara (TrueType)'; FileName = 'candara.ttf'; ExpectedSha256 = '002C1E3378D02ED7DBDB3DF1C94D433413A56F3F2F3AA8315A57720EE851DC45' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara Bold (TrueType)'; FileName = 'candarab.ttf'; ExpectedSha256 = 'EC0DCE5170AAAF2CF485D4BA39D86FBBA1DD1C76D9140CBF75A6B84B50FB20DE' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara Italic (TrueType)'; FileName = 'candarai.ttf'; ExpectedSha256 = 'C165DBBC35BBF1FEFAE865C3E6B02404C8D182074FE04E78E221BAB7D35CE3F8' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara Bold Italic (TrueType)'; FileName = 'candaraz.ttf'; ExpectedSha256 = 'A873581D9F0886441BD45C5E425A734E86E063EF583B9CF8081B1AA03B871F1C' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara Light (TrueType)'; FileName = 'candaral.ttf'; ExpectedSha256 = 'C35742957794A81B6C73AA43D2F19E3D3D0C45A6DAFBC2EFCDDD04AD6B3AEAC8' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Candara Light Italic (TrueType)'; FileName = 'candarali.ttf'; ExpectedSha256 = 'FF22B2841BC0AA0664B50C9215E8440F1DA4F74BEDD27AB33865F63F433B2681' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Constantia (TrueType)'; FileName = 'constan.ttf'; ExpectedSha256 = '495577BF8EF74DEAB6ECC2E7ACF63CD966184148F9BC2044A1068CD58501577E' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Constantia Bold (TrueType)'; FileName = 'constanb.ttf'; ExpectedSha256 = 'B6C66A1858370FE575629E19D53C05350738BF5105E18CEAC07FE9EFC9CD008D' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Constantia Italic (TrueType)'; FileName = 'constani.ttf'; ExpectedSha256 = '2314A03C53506FA79525BC479EA4BE9C036D1EBD86A1FFB5837CA5B43FF51F07' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Constantia Bold Italic (TrueType)'; FileName = 'constanz.ttf'; ExpectedSha256 = '9311AADCBD919746F50D222FA0215FB44266D6993221C14A196F0725FDAE464F' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Ebrima Bold (TrueType)'; FileName = 'ebrimabd.ttf'; ExpectedSha256 = '08E47DF2F8C6D1E94067B4E50680B232FF29C517BC1BFF0C092C69F21C7549CA' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Gadugi Bold (TrueType)'; FileName = 'gadugib.ttf'; ExpectedSha256 = 'C96226CBA7F50E94B534A5F8ADE6A54F48A03BE7C73360524EDA5CBCE4DE34B6' },
    @{ Group = 'AdditionalSystem'; ValueName = 'Malgun Gothic Bold (TrueType)'; FileName = 'malgunbd.ttf'; ExpectedSha256 = 'E8CBC0B2AFCC14FB45DFB6086D5102C0B23A96E7B6E708F3122ACDE1B86C9082' }
)

# 56 Confirmed Quarantine-Eligible Core-Family Entries (5 Confirmed Duplicate + 51 Conflicting Third-Party/Older)
$QuarantineCoreFonts = @(
    @{ ValueName = '103 Tahoma (TrueType)'; FileName = '103 Tahoma.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'arial (2) (TrueType)'; FileName = 'arial (2).ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'arial__0 (TrueType)'; FileName = 'arial__0.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ARIAL_2 (TrueType)'; FileName = 'ARIAL_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'arial_3 (TrueType)'; FileName = 'arial_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ARIAL_4 (TrueType)'; FileName = 'ARIAL_4.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'arial-black-58f9f76b96e42 (TrueType)'; FileName = 'arial-black-58f9f76b96e42.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ariali (2) (TrueType)'; FileName = 'ariali (2).ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ariali_2 (TrueType)'; FileName = 'ariali_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ARIALI_3 (TrueType)'; FileName = 'ARIALI_3.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibri_2 (TrueType)'; FileName = 'calibri_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibrib_2 (TrueType)'; FileName = 'calibrib_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibrii_2 (TrueType)'; FileName = 'calibrii_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibrii_3 (TrueType)'; FileName = 'calibrii_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibril_2 (TrueType)'; FileName = 'calibril_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibrili_2 (TrueType)'; FileName = 'calibrili_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibriz_2 (TrueType)'; FileName = 'calibriz_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'calibriz_3 (TrueType)'; FileName = 'calibriz_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'consola_2 (TrueType)'; FileName = 'consola_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'consolab_2 (TrueType)'; FileName = 'consolab_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'consolai_2 (TrueType)'; FileName = 'consolai_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'consolaz_2 (TrueType)'; FileName = 'consolaz_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'MARLETT_2 (TrueType)'; FileName = 'MARLETT_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'marlett_3 (TrueType)'; FileName = 'marlett_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoepr_2 (TrueType)'; FileName = 'segoepr_2.ttf'; Classification = 'Confirmed duplicate' },
    @{ ValueName = 'segoeprb_2 (TrueType)'; FileName = 'segoeprb_2.ttf'; Classification = 'Confirmed duplicate' },
    @{ ValueName = 'segoesc_2 (TrueType)'; FileName = 'segoesc_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoescb_2 (TrueType)'; FileName = 'segoescb_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeui_2 (TrueType)'; FileName = 'segoeui_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeuib_2 (TrueType)'; FileName = 'segoeuib_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeuii_2 (TrueType)'; FileName = 'segoeuii_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeuil_2 (TrueType)'; FileName = 'segoeuil_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeuisl_2 (TrueType)'; FileName = 'segoeuisl_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'segoeuiz_2 (TrueType)'; FileName = 'segoeuiz_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'SYMBOL_2 (TrueType)'; FileName = 'SYMBOL_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'symbol_3 (TrueType)'; FileName = 'symbol_3.ttf'; Classification = 'Confirmed duplicate' },
    @{ ValueName = 'TAHOMA_2 (TrueType)'; FileName = 'TAHOMA_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'tahoma_3 (TrueType)'; FileName = 'tahoma_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TAHOMA_4 (TrueType)'; FileName = 'TAHOMA_4.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TAHOMABD_2 (TrueType)'; FileName = 'TAHOMABD_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'tahomabd_3 (TrueType)'; FileName = 'tahomabd_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TAHOMABD_4 (TrueType)'; FileName = 'TAHOMABD_4.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TIMES_2 (TrueType)'; FileName = 'TIMES_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'times_3 (TrueType)'; FileName = 'times_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'times_4 (TrueType)'; FileName = 'times_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TIMESBD_2 (TrueType)'; FileName = 'TIMESBD_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'timesbd_3 (TrueType)'; FileName = 'timesbd_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'timesbd_4 (TrueType)'; FileName = 'timesbd_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TIMESBI_2 (TrueType)'; FileName = 'TIMESBI_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'timesbi_3 (TrueType)'; FileName = 'timesbi_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'TIMESI_2 (TrueType)'; FileName = 'TIMESI_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'timesi_3 (TrueType)'; FileName = 'timesi_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'WEBDINGS_2 (TrueType)'; FileName = 'WEBDINGS_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'webdings_3 (TrueType)'; FileName = 'webdings_3.ttf'; Classification = 'Confirmed duplicate' },
    @{ ValueName = 'wingding_2 (TrueType)'; FileName = 'wingding_2.ttf'; Classification = 'Confirmed duplicate' },
    @{ ValueName = 'WINGDING_3 (TrueType)'; FileName = 'WINGDING_3.TTF'; Classification = 'Conflicting third-party/older font' }
)

# 8 Unknown — Requires Manual Review (NEVER auto-quarantined)
$SkippedUnknownFonts = @(
    @{ ValueName = 'ARIALN_2 (TrueType)'; FileName = 'ARIALN_2.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow; verify canonical copy first' },
    @{ ValueName = 'ARIALNB_2 (TrueType)'; FileName = 'ARIALNB_2.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow Bold; verify canonical copy first' },
    @{ ValueName = 'ARIALNBI_2 (TrueType)'; FileName = 'ARIALNBI_2.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow Bold Italic; verify canonical copy first' },
    @{ ValueName = 'ARIALNBI_3 (TrueType)'; FileName = 'ARIALNBI_3.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow Bold Italic; verify canonical copy first' },
    @{ ValueName = 'ARIALNBI_4 (TrueType)'; FileName = 'ARIALNBI_4.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow Bold Italic; verify canonical copy first' },
    @{ ValueName = 'ARIALNI_2 (TrueType)'; FileName = 'ARIALNI_2.TTF'; Reason = 'Unknown - Office/legacy Arial Narrow Italic; verify canonical copy first' },
    @{ ValueName = 'ARIALUNI_2 (TrueType)'; FileName = 'ARIALUNI_2.TTF'; Reason = 'Unknown - Office/legacy Arial Unicode MS (23.2 MB); verify canonical copy first' },
    @{ ValueName = 'SYMBOL_0 (TrueType)'; FileName = 'SYMBOL_0.TTF'; Reason = 'Unknown - Third-party MCS SYMBOL; requires manual review' }
)

# 35 Non-Core Windows System Font Collisions (only processed if -IncludeNonCoreCollisions is explicitly passed)
$NonCoreSystemCollisions = @(
    @{ ValueName = '109 Traditional Arabic (TrueType)'; FileName = '109 Traditional Arabic.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'aldhabi_2 (TrueType)'; FileName = 'aldhabi_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'bahnschrift_2 (TrueType)'; FileName = 'bahnschrift_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'cambriab_2 (TrueType)'; FileName = 'cambriab_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'cambriai_2 (TrueType)'; FileName = 'cambriai_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'cambriaz_2 (TrueType)'; FileName = 'cambriaz_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'corbel_2 (TrueType)'; FileName = 'corbel_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'corbelb_2 (TrueType)'; FileName = 'corbelb_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'corbeli_2 (TrueType)'; FileName = 'corbeli_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'corbelz_2 (TrueType)'; FileName = 'corbelz_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ebrima_2 (TrueType)'; FileName = 'ebrima_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ebrima_3 (TrueType)'; FileName = 'ebrima_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ebrimabd_2 (TrueType)'; FileName = 'ebrimabd_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'ebrimabd_3 (TrueType)'; FileName = 'ebrimabd_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'Gabriola_2 (TrueType)'; FileName = 'Gabriola_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'gadugi_2 (TrueType)'; FileName = 'gadugi_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'gadugi_3 (TrueType)'; FileName = 'gadugi_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'gadugib_2 (TrueType)'; FileName = 'gadugib_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'gadugib_3 (TrueType)'; FileName = 'gadugib_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'GEORGIA_2 (TrueType)'; FileName = 'GEORGIA_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgia_3 (TrueType)'; FileName = 'georgia_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgia_4 (TrueType)'; FileName = 'georgia_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgia_5 (TrueType)'; FileName = 'georgia_5.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'GEORGIAB_2 (TrueType)'; FileName = 'GEORGIAB_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiab_3 (TrueType)'; FileName = 'georgiab_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiab_4 (TrueType)'; FileName = 'georgiab_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiab_5 (TrueType)'; FileName = 'georgiab_5.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiai_2 (TrueType)'; FileName = 'georgiai_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'GEORGIAI_3 (TrueType)'; FileName = 'GEORGIAI_3.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiai_4 (TrueType)'; FileName = 'georgiai_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'GEORGIAZ_2 (TrueType)'; FileName = 'GEORGIAZ_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiaz_3 (TrueType)'; FileName = 'georgiaz_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'georgiaz_4 (TrueType)'; FileName = 'georgiaz_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'himalaya_2 (TrueType)'; FileName = 'himalaya_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'himalaya_3 (TrueType)'; FileName = 'himalaya_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgun_2 (TrueType)'; FileName = 'malgun_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgun_3 (TrueType)'; FileName = 'malgun_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgun_4 (TrueType)'; FileName = 'malgun_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgunbd_2 (TrueType)'; FileName = 'malgunbd_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgunbd_3 (TrueType)'; FileName = 'malgunbd_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgunbd_4 (TrueType)'; FileName = 'malgunbd_4.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgunsl_2 (TrueType)'; FileName = 'malgunsl_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'malgunsl_3 (TrueType)'; FileName = 'malgunsl_3.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'Nirmala_2 (TrueType)'; FileName = 'Nirmala_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'NirmalaB_2 (TrueType)'; FileName = 'NirmalaB_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'NirmalaS_2 (TrueType)'; FileName = 'NirmalaS_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'simhei_2 (TrueType)'; FileName = 'simhei_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'simsunb_2 (TrueType)'; FileName = 'simsunb_2.ttf'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'SYLFAEN_2 (TrueType)'; FileName = 'SYLFAEN_2.TTF'; Classification = 'Conflicting third-party/older font' },
    @{ ValueName = 'sylfaen_3 (TrueType)'; FileName = 'sylfaen_3.ttf'; Classification = 'Conflicting third-party/older font' }
)

# ============================================================================
# Helper Functions
# ============================================================================

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-RegistryValuesMap {
    param([string]$RegistryPsPath)
    $map = New-Object System.Collections.Hashtable([System.StringComparer]::OrdinalIgnoreCase)
    if (-not (Test-Path -LiteralPath $RegistryPsPath)) {
        return $map
    }
    $key = Get-Item -LiteralPath $RegistryPsPath
    foreach ($name in ($key.GetValueNames() | Sort-Object)) {
        $kind = $key.GetValueKind($name).ToString()
        $val  = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $map[$name] = @{
            Name = $name
            Type = $kind
            Data = $val
        }
    }
    return $map
}

function Write-TransactionLog {
    param(
        [string]$LogFile,
        [string]$Action,
        [string]$Target,
        [string]$Status,
        [string]$Details = ''
    )
    if ([string]::IsNullOrWhiteSpace($LogFile)) { return }
    $entry = [ordered]@{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString('o')
        action        = $Action
        target        = $Target
        status        = $Status
        details       = $Details
    } | ConvertTo-Json -Compress
    Add-Content -LiteralPath $LogFile -Value $entry -Encoding UTF8
}

function Export-PreOperationBackup {
    param([string]$BackupDir)
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

    $exports = @(
        @{ Key = $HklmFontsRegPath;     File = 'HKLM_Fonts.reg' },
        @{ Key = $HkcuFontsRegPath;     File = 'HKCU_Fonts.reg' },
        @{ Key = $HklmFontSubstRegPath; File = 'HKLM_FontSubstitutes.reg' },
        @{ Key = $HklmFontLinkRegPath;  File = 'HKLM_FontLink_SystemLink.reg' }
    )
    foreach ($exp in $exports) {
        $outFile = Join-Path $BackupDir $exp.File
        & reg.exe export $exp.Key $outFile /y | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "reg.exe export failed for $($exp.Key) with exit code $LASTEXITCODE"
        }
    }

    $snapshot = [ordered]@{
        created_utc = (Get-Date).ToUniversalTime().ToString('o')
        hklm_fonts  = Get-RegistryValuesMap -RegistryPsPath $HklmFontsPsPath
        hkcu_fonts  = Get-RegistryValuesMap -RegistryPsPath $HkcuFontsPsPath
    }
    $snapshotPath = Join-Path $BackupDir 'fonts_registry_snapshot.json'
    $snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $snapshotPath -Encoding UTF8

    $manifest = Get-ChildItem -LiteralPath $WinFontsDir -File | Sort-Object Name | ForEach-Object {
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        [ordered]@{
            name           = $_.Name
            size_bytes     = $_.Length
            last_write_utc = $_.LastWriteTimeUtc.ToString('o')
            sha256         = $hash
        }
    }
    $manifestPath = Join-Path $BackupDir 'WindowsFonts_Manifest.json'
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

function Send-WmFontChangeBroadcast {
    $signature = @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd,
    uint Msg,
    UIntPtr wParam,
    IntPtr lParam,
    uint fuFlags,
    uint uTimeout,
    out UIntPtr lpdwResult);
'@
    $user32 = Add-Type -MemberDefinition $signature -Name 'Win32FontBroadcast' -Namespace 'Fontivo' -PassThru
    $HWND_BROADCAST = [IntPtr]0xffff
    $WM_FONTCHANGE  = [uint32]0x001D
    $SMTO_ABORTIFHUNG = [uint32]0x0002
    $result = [UIntPtr]::Zero
    $ret = $user32::SendMessageTimeout($HWND_BROADCAST, $WM_FONTCHANGE, [UIntPtr]::Zero, [IntPtr]::Zero, $SMTO_ABORTIFHUNG, 5000, [ref]$result)
    if ($ret -eq [IntPtr]::Zero) {
        Write-Warning "SendMessageTimeout(WM_FONTCHANGE) returned 0 (LastError=$([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
}

function Invoke-FontCacheRebuild {
    Write-Host '[*] Stopping FontCache service...' -ForegroundColor Yellow
    $fc3 = Get-Service -Name 'FontCache3.0.0.0' -ErrorAction SilentlyContinue
    if ($fc3 -and $fc3.Status -eq 'Running') {
        Stop-Service -Name 'FontCache3.0.0.0' -Force -ErrorAction SilentlyContinue
    }

    & net.exe stop FontCache 2>&1 | Out-Null
    $svc = Get-Service -Name 'FontCache' -ErrorAction Stop
    if ($svc.Status -ne 'Stopped') {
        Stop-Service -Name 'FontCache' -Force -ErrorAction Stop
        $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(15))
    }

    if (Test-Path -LiteralPath $FontCacheDir) {
        Get-ChildItem -LiteralPath $FontCacheDir -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host '[*] Starting FontCache service...' -ForegroundColor Yellow
    & net.exe start FontCache 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Start-Service -Name 'FontCache' -ErrorAction Stop
    }
    $svc = Get-Service -Name 'FontCache' -ErrorAction Stop
    if ($svc.Status -ne 'Running') {
        throw "FontCache service failed to reach Running state (current: $($svc.Status))."
    }
}

function Register-PendingDeleteOnReboot {
    param([string]$FilePath)
    $sig = @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, IntPtr lpNewFileName, int dwFlags);
'@
    if (-not ('Fontivo.Win32FileOpsV2' -as [type])) {
        Add-Type -MemberDefinition $sig -Name 'Win32FileOpsV2' -Namespace 'Fontivo' | Out-Null
    }
    $MOVEFILE_DELAY_UNTIL_REBOOT = 4
    return [Fontivo.Win32FileOpsV2]::MoveFileEx($FilePath, [IntPtr]::Zero, $MOVEFILE_DELAY_UNTIL_REBOOT)
}

function Invoke-ExplorerIconCacheReset {
    $explorerDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Explorer'
    if (-not (Test-Path -LiteralPath $explorerDir)) { return }
    Write-Host '[*] Refreshing Windows Explorer icon cache...' -ForegroundColor Yellow
    $wasRunning = [bool](Get-Process -Name 'explorer' -ErrorAction SilentlyContinue)
    if ($wasRunning) {
        Stop-Process -Name 'explorer' -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
    Get-ChildItem -LiteralPath $explorerDir -Filter 'iconcache_*.db' -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
    if ($wasRunning) {
        Start-Process 'explorer.exe'
    }
}

function Test-PostOperationValidation {
    param(
        [array]$ExpectedAddedFonts,
        [array]$ExpectedQuarantinedFonts,
        [hashtable]$InitialSubstitutes,
        [hashtable]$InitialFontLink
    )
    Add-Type -AssemblyName System.Drawing
    $ifc = New-Object System.Drawing.Text.InstalledFontCollection
    $installedFamilies = @{}
    foreach ($fam in $ifc.Families) {
        $installedFamilies[$fam.Name] = $true
    }

    $requiredFamilies = @('Segoe Fluent Icons', 'Segoe UI', 'Arial', 'Tahoma', 'Times New Roman', 'Calibri', 'Consolas', 'Courier New', 'Verdana')
    $missingFamilies = @()
    foreach ($rf in $requiredFamilies) {
        if (-not $installedFamilies.ContainsKey($rf)) {
            $missingFamilies += $rf
        }
    }

    $currentHklm = Get-RegistryValuesMap -RegistryPsPath $HklmFontsPsPath
    $missingReg = @()
    foreach ($item in $ExpectedAddedFonts) {
        if (-not $currentHklm.ContainsKey($item.ValueName) -or ($currentHklm[$item.ValueName].Data -ne $item.FileName)) {
            $missingReg += $item.ValueName
        }
    }

    $remainingQuarantined = @()
    foreach ($item in $ExpectedQuarantinedFonts) {
        if ($currentHklm.ContainsKey($item.ValueName)) {
            $remainingQuarantined += $item.ValueName
        }
    }

    $currentSubst = Get-RegistryValuesMap -RegistryPsPath $HklmSubstPsPath
    $currentLink  = Get-RegistryValuesMap -RegistryPsPath $HklmLinkPsPath
    $substUntouched = ($currentSubst.Count -eq $InitialSubstitutes.Count)
    $linkUntouched  = ($currentLink.Count -eq $InitialFontLink.Count)

    return [ordered]@{
        InstalledFamiliesMissing = $missingFamilies
        MissingRegistryEntries   = $missingReg
        RemainingQuarantined     = $remainingQuarantined
        FontSubstitutesUntouched = $substUntouched
        FontLinkUntouched        = $linkUntouched
        Passed                   = ($missingFamilies.Count -eq 0 -and $missingReg.Count -eq 0 -and $substUntouched -and $linkUntouched)
    }
}

function Invoke-RollbackFromDir {
    param([string]$BackupDir)
    if (-not (Test-IsAdministrator)) {
        Write-Error 'Rollback mode requires Administrator privileges.'
        exit 1
    }
    if (-not (Test-Path -LiteralPath $BackupDir)) {
        Write-Error "Backup directory not found: $BackupDir"
        exit 1
    }

    $hklmRegFile = Join-Path $BackupDir 'HKLM_Fonts.reg'
    $hkcuRegFile = Join-Path $BackupDir 'HKCU_Fonts.reg'
    $manifestFile = Join-Path $BackupDir 'restoration_manifest.json'

    if (Test-Path -LiteralPath $manifestFile) {
        Write-Host "[*] Restoring quarantined font files from $manifestFile..." -ForegroundColor Yellow
        $entries = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
        foreach ($entry in $entries) {
            if ($entry.quarantined_path -and (Test-Path -LiteralPath $entry.quarantined_path)) {
                if (-not (Test-Path -LiteralPath $entry.original_path)) {
                    Move-Item -LiteralPath $entry.quarantined_path -Destination $entry.original_path -Force
                    Write-Host "  [RESTORED FILE] $($entry.file_name)" -ForegroundColor Green
                }
            }
        }
    }

    if (Test-Path -LiteralPath $hklmRegFile) {
        Write-Host "[*] Importing $hklmRegFile..." -ForegroundColor Yellow
        & reg.exe import $hklmRegFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to import $hklmRegFile" }
    }
    if (Test-Path -LiteralPath $hkcuRegFile) {
        Write-Host "[*] Importing $hkcuRegFile..." -ForegroundColor Yellow
        & reg.exe import $hkcuRegFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to import $hkcuRegFile" }
    }

    Invoke-FontCacheRebuild
    Send-WmFontChangeBroadcast
    Write-Host '[+] Rollback complete.' -ForegroundColor Green
}

# ============================================================================
# Main Execution Flow
# ============================================================================

$mode = $PSCmdlet.ParameterSetName
if ($mode -eq 'Rollback') {
    Invoke-RollbackFromDir -BackupDir $Rollback
    exit 0
}

if ($mode -eq 'Execute') {
    if (-not $ConfirmLiveRecovery) {
        Write-Error 'Live execution requires explicit -ConfirmLiveRecovery flag alongside -Execute.'
        exit 1
    }
    if (-not (Test-IsAdministrator)) {
        Write-Error 'Live execution (-Execute) requires Administrator privileges.'
        exit 1
    }
}

$activeQuarantineList = @($QuarantineCoreFonts)
if ($IncludeNonCoreCollisions) {
    $activeQuarantineList += $NonCoreSystemCollisions
}

$currentHklmFonts = Get-RegistryValuesMap -RegistryPsPath $HklmFontsPsPath
$currentHkcuFonts = Get-RegistryValuesMap -RegistryPsPath $HkcuFontsPsPath
$initialSubst     = Get-RegistryValuesMap -RegistryPsPath $HklmSubstPsPath
$initialLink      = Get-RegistryValuesMap -RegistryPsPath $HklmLinkPsPath

# Build itemized plan
$addPlan = @()
foreach ($entry in $MissingSystemFonts) {
    $fullPath = Join-Path $WinFontsDir $entry.FileName
    $existsOnDisk = Test-Path -LiteralPath $fullPath
    $actualSha = if ($existsOnDisk) { (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash } else { $null }
    $shaMatch  = ($actualSha -eq $entry.ExpectedSha256)
    $alreadyRegistered = $currentHklmFonts.ContainsKey($entry.ValueName) -and ($currentHklmFonts[$entry.ValueName].Data -eq $entry.FileName)

    $status = if (-not $existsOnDisk) {
        'SKIP_MISSING_FILE'
    } elseif (-not $shaMatch) {
        'SKIP_SHA256_MISMATCH'
    } elseif ($alreadyRegistered) {
        'SKIP_ALREADY_REGISTERED'
    } else {
        'ADD_REGISTRY'
    }

    $addPlan += [PSCustomObject]@{
        Group         = $entry.Group
        ValueName     = $entry.ValueName
        FileName      = $entry.FileName
        ExpectedSha   = $entry.ExpectedSha256
        ActualSha     = $actualSha
        Sha256Match   = $shaMatch
        Action        = $status
    }
}

$quarantinePlan = @()
foreach ($entry in $activeQuarantineList) {
    $regPresent = $currentHklmFonts.ContainsKey($entry.ValueName)
    $regData    = if ($regPresent) { $currentHklmFonts[$entry.ValueName].Data } else { $entry.FileName }
    $fullPath   = if ($regData -like '*\*') { $regData } else { Join-Path $WinFontsDir $regData }
    $fileExists = Test-Path -LiteralPath $fullPath

    $status = if (-not $regPresent -and -not $fileExists) {
        'SKIP_ABSENT'
    } else {
        'QUARANTINE_AND_UNREGISTER'
    }

    $quarantinePlan += [PSCustomObject]@{
        ValueName      = $entry.ValueName
        FileName       = $entry.FileName
        FullPath       = $fullPath
        Classification = $entry.Classification
        RegPresent     = $regPresent
        FileExists     = $fileExists
        Action         = $status
    }
}

$addReady        = @($addPlan | Where-Object { $_.Action -eq 'ADD_REGISTRY' })
$addAlready      = @($addPlan | Where-Object { $_.Action -eq 'SKIP_ALREADY_REGISTERED' })
$addBlocked      = @($addPlan | Where-Object { $_.Action -in @('SKIP_MISSING_FILE', 'SKIP_SHA256_MISMATCH') })
$quarantineReady = @($quarantinePlan | Where-Object { $_.Action -eq 'QUARANTINE_AND_UNREGISTER' })

Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host "  Fontivo Safe Windows Font Recovery  [Mode: $mode]" -ForegroundColor Cyan
Write-Host '=====================================================================' -ForegroundColor Cyan
Write-Host "  HKLM\...\Fonts current entries : $($currentHklmFonts.Count)"
Write-Host "  HKCU\...\Fonts current entries : $($currentHkcuFonts.Count)"
Write-Host "  FontSubstitutes entries        : $($initialSubst.Count) (READ-ONLY / UNTOUCHED)"
Write-Host "  FontLink\SystemLink entries    : $($initialLink.Count) (READ-ONLY / UNTOUCHED)"
Write-Host ''
Write-Host "  [1] Missing System Font Registrations : $($addReady.Count) to ADD ($($addAlready.Count) already present, $($addBlocked.Count) blocked)" -ForegroundColor Green
Write-Host "  [2] Quarantine + Unregister Targets   : $($quarantineReady.Count) confirmed duplicates/conflicts" -ForegroundColor Yellow
Write-Host "  [3] Skipped Unknown (Manual Review)   : $($SkippedUnknownFonts.Count) (NEVER touched)" -ForegroundColor DarkYellow
if (-not $IncludeNonCoreCollisions) {
    Write-Host "  [4] Non-Core System Collisions        : $($NonCoreSystemCollisions.Count) deferred (pass -IncludeNonCoreCollisions to include)" -ForegroundColor Gray
}
Write-Host ''

if ($mode -eq 'DryRun') {
    Write-Host '--- [DRY-RUN] Itemized Registry Additions (Confirmed Missing System Fonts) ---' -ForegroundColor Cyan
    foreach ($item in $addPlan) {
        $tag = if ($item.Action -eq 'ADD_REGISTRY') { '[ADD]' } else { "[$($item.Action)]" }
        Write-Host ("  {0,-24} {1,-42} -> {2} (SHA256Match={3})" -f $tag, $item.ValueName, $item.FileName, $item.Sha256Match)
    }

    Write-Host ''
    Write-Host '--- [DRY-RUN] Itemized Quarantine + Unregistration (Confirmed Duplicates/Conflicts) ---' -ForegroundColor Yellow
    foreach ($item in $quarantinePlan) {
        Write-Host ("  [QUARANTINE] {0,-42} -> {1} ({2})" -f $item.ValueName, $item.FileName, $item.Classification)
    }

    Write-Host ''
    Write-Host '--- [DRY-RUN] Skipped Unknown Entries (Manual Review Required) ---' -ForegroundColor DarkYellow
    foreach ($item in $SkippedUnknownFonts) {
        Write-Host ("  [SKIP-UNKNOWN] {0,-40} -> {1} ({2})" -f $item.ValueName, $item.FileName, $item.Reason)
    }

    Write-Host ''
    Write-Host '[DRY-RUN COMPLETE] Zero changes made to Registry, C:\Windows\Fonts, or FontCache.' -ForegroundColor Green
    exit 0
}

# ============================================================================
# Live Execution (-Execute -ConfirmLiveRecovery)
# ============================================================================
$timestamp     = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupDir     = Join-Path $FontivoLocalDir "RecoveryBackup_$timestamp"
$quarantineDir = Join-Path $FontivoLocalDir "Quarantine_$timestamp"
$txLogPath     = Join-Path $backupDir 'transaction_log.jsonl'
$restManifest  = @()
$addedRegNames = New-Object System.Collections.Generic.List[string]

Write-Host "[*] Creating full pre-operation Registry backup & SHA-256 manifest in $backupDir..." -ForegroundColor Cyan
Export-PreOperationBackup -BackupDir $backupDir
New-Item -ItemType Directory -Path $quarantineDir -Force | Out-Null
Write-TransactionLog -LogFile $txLogPath -Action 'BACKUP' -Target $backupDir -Status 'SUCCESS'

try {
    # Step 1: Quarantine confirmed duplicates/conflicts (MOVE or COPY + SCHEDULE DELETE ON REBOOT, then unregister)
    $needsReboot = $false
    foreach ($item in $quarantineReady) {
        $destFile = Join-Path $quarantineDir ([IO.Path]::GetFileName($item.FullPath))
        $sha256   = $null
        $movedOk  = $false
        $pendingRebootDelete = $false

        if ($item.FileExists) {
            $sha256 = (Get-FileHash -LiteralPath $item.FullPath -Algorithm SHA256).Hash
            try {
                Move-Item -LiteralPath $item.FullPath -Destination $destFile -Force -ErrorAction Stop
                $movedOk = $true
                Write-TransactionLog -LogFile $txLogPath -Action 'QUARANTINE_FILE' -Target $item.FullPath -Status 'SUCCESS' -Details $destFile
            } catch {
                try {
                    Copy-Item -LiteralPath $item.FullPath -Destination $destFile -Force -ErrorAction Stop
                    $scheduled = Register-PendingDeleteOnReboot -FilePath $item.FullPath
                    if ($scheduled) {
                        $movedOk = $true
                        $pendingRebootDelete = $true
                        $needsReboot = $true
                        Write-Host "  [QUARANTINE-ON-REBOOT] Copied $($item.FileName) to Quarantine & scheduled locked file cleanup on reboot." -ForegroundColor Yellow
                        Write-TransactionLog -LogFile $txLogPath -Action 'QUARANTINE_FILE_ON_REBOOT' -Target $item.FullPath -Status 'SUCCESS' -Details $destFile
                    } else {
                        Write-Warning "Locked/failed scheduling $($item.FullPath). Skipping Registry removal."
                        Write-TransactionLog -LogFile $txLogPath -Action 'QUARANTINE_FILE' -Target $item.FullPath -Status 'FAILED_LOCKED' -Details $_.Exception.Message
                        continue
                    }
                } catch {
                    Write-Warning "Locked/failed copying $($item.FullPath): $($_.Exception.Message). Skipping Registry removal."
                    Write-TransactionLog -LogFile $txLogPath -Action 'QUARANTINE_FILE' -Target $item.FullPath -Status 'FAILED_LOCKED' -Details $_.Exception.Message
                    continue
                }
            }
        } else {
            $movedOk = $true
        }

        if ($movedOk -and $item.RegPresent) {
            $origData = $currentHklmFonts[$item.ValueName].Data
            $origType = $currentHklmFonts[$item.ValueName].Type
            Remove-ItemProperty -LiteralPath $HklmFontsPsPath -Name $item.ValueName -Force -ErrorAction Stop
            if ($currentHkcuFonts.ContainsKey($item.ValueName)) {
                Remove-ItemProperty -LiteralPath $HkcuFontsPsPath -Name $item.ValueName -Force -ErrorAction SilentlyContinue
            }
            Write-TransactionLog -LogFile $txLogPath -Action 'UNREGISTER_FONT' -Target $item.ValueName -Status 'SUCCESS'

            $restManifest += [ordered]@{
                value_name            = $item.ValueName
                registry_type         = $origType
                registry_data         = $origData
                file_name             = $item.FileName
                original_path         = $item.FullPath
                quarantined_path      = if ($item.FileExists) { $destFile } else { $null }
                pending_reboot_delete = $pendingRebootDelete
                sha256                = $sha256
                classification        = $item.Classification
            }
        }
    }

    $restManifestPath = Join-Path $quarantineDir 'restoration_manifest.json'
    ConvertTo-Json -InputObject @($restManifest) -Depth 4 | Set-Content -LiteralPath $restManifestPath -Encoding UTF8
    Copy-Item -LiteralPath $restManifestPath -Destination (Join-Path $backupDir 'restoration_manifest.json') -Force

    # Step 2: Register missing Windows system fonts
    foreach ($item in $addReady) {
        New-ItemProperty -LiteralPath $HklmFontsPsPath -Name $item.ValueName -Value $item.FileName -PropertyType String -Force -ErrorAction Stop | Out-Null
        $addedRegNames.Add($item.ValueName)
        Write-TransactionLog -LogFile $txLogPath -Action 'REGISTER_FONT' -Target $item.ValueName -Status 'SUCCESS' -Details $item.FileName
    }

    # Step 3: Rebuild FontCache, refresh Explorer icon cache & broadcast WM_FONTCHANGE
    Invoke-FontCacheRebuild
    Write-TransactionLog -LogFile $txLogPath -Action 'REBUILD_FONTCACHE' -Target 'FontCache' -Status 'SUCCESS'
    Invoke-ExplorerIconCacheReset
    Write-TransactionLog -LogFile $txLogPath -Action 'RESET_EXPLORER_ICONCACHE' -Target 'Explorer' -Status 'SUCCESS'
    Send-WmFontChangeBroadcast
    Write-TransactionLog -LogFile $txLogPath -Action 'BROADCAST_WM_FONTCHANGE' -Target 'HWND_BROADCAST' -Status 'SUCCESS'

    # Step 4: Post-operation validation
    $validation = Test-PostOperationValidation `
        -ExpectedAddedFonts $addReady `
        -ExpectedQuarantinedFonts $quarantineReady `
        -InitialSubstitutes $initialSubst `
        -InitialFontLink $initialLink

    if (-not $validation.Passed) {
        throw "Post-operation validation failed: $($validation | ConvertTo-Json -Compress)"
    }

    Write-TransactionLog -LogFile $txLogPath -Action 'POST_VALIDATION' -Target 'System' -Status 'SUCCESS'
    Write-Host "[+] Live recovery completed and validated. Backup: $backupDir | Quarantine: $quarantineDir" -ForegroundColor Green
    exit 0
} catch {
    Write-Error "Recovery failed: $($_.Exception.Message). Initiating automatic rollback..."
    Write-TransactionLog -LogFile $txLogPath -Action 'ERROR_ROLLBACK' -Target 'System' -Status 'TRIGGERED' -Details $_.Exception.Message
    Invoke-RollbackFromDir -BackupDir $backupDir
    exit 1
}

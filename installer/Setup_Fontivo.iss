; Inno Setup Script for Fontivo v1.0
; Hardened Installer for Windows 10 / 11 (Least Privilege & Localhost Safety)

[Setup]
AppId={{5B6327E1-8A19-4C2E-9FD4-E48A96F7B301}
AppName=Fontivo
AppVersion=1.1.4
AppVerName=Fontivo 1.1.4
AppPublisher=Eng. Ahmed Fahmy (Fontivo Open Source)
AppPublisherURL=https://ahmedfahmy8308.github.io/Fontivo-Site/
AppSupportURL=https://github.com/Ahmedfahmy8308/Fontivo/issues
AppUpdatesURL=https://github.com/Ahmedfahmy8308/Fontivo/releases
VersionInfoVersion=1.1.4.0
VersionInfoCompany=Eng. Ahmed Fahmy (Fontivo Open Source)
VersionInfoDescription=Fontivo Desktop Font Manager Setup
VersionInfoProductName=Fontivo
VersionInfoProductVersion=1.1.4
VersionInfoCopyright=Copyright (c) 2026 Eng. Ahmed Fahmy & Eng. Mohamed Elashwah (MIT)
DefaultDirName={autopf}\Fontivo
DefaultGroupName=Fontivo
AllowNoIcons=yes
OutputDir=..\release
OutputBaseFilename=Fontivo-Setup
SetupIconFile=..\icon.ico
Compression=lzma2/normal
SolidCompression=no
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=auto

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
Name: "{localappdata}\Fontivo"
Name: "{localappdata}\Fontivo\Fonts"
Name: "{localappdata}\Fontivo\Fonts\Google"
Name: "{localappdata}\Fontivo\Fonts\Packs"
Name: "{localappdata}\Fontivo\Fonts\Custom"
Name: "{localappdata}\Fontivo\Fonts\Imported"
Name: "{localappdata}\Fontivo\Backups"
Name: "{localappdata}\Fontivo\Workspaces"
Name: "{localappdata}\Fontivo\Updates"
Name: "{localappdata}\Fontivo\Downloads"
Name: "{localappdata}\Fontivo\Cache"
Name: "{localappdata}\Fontivo\Cache\PackArchives"
Name: "{localappdata}\Fontivo\WebView2"
Name: "{userappdata}\Fontivo"
Name: "{commonappdata}\Fontivo"; Permissions: users-modify; Check: IsAdminInstallMode

[Files]
Source: "..\release\Fontivo.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src\ui\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKA; Subkey: "Software\Classes\Fontivo"; ValueType: string; ValueName: ""; ValueData: "URL:Fontivo Protocol"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Fontivo"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Fontivo\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\icon.ico,0"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Fontivo\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Fontivo.exe"" ""%1"""; Flags: uninsdeletekey

[Icons]
Name: "{group}\Fontivo"; Filename: "{app}\Fontivo.exe"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{group}\{cm:UninstallProgram,Fontivo}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Fontivo"; Filename: "{app}\Fontivo.exe"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\Fontivo.exe"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,Fontivo}"; Flags: nowait postinstall skipifsilent


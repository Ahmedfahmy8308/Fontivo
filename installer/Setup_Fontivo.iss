; Inno Setup Script for Fontivo v1.0
; Hardened Installer for Windows 10 / 11 (Least Privilege & Localhost Safety)

[Setup]
AppId={{5B6327E1-8A19-4C2E-9FD4-E48A96F7B301}
AppName=Fontivo
AppVersion=1.0.0
AppVerName=Fontivo 1.0.0
AppPublisher=Fontivo Open Source Team
AppPublisherURL=https://github.com/Ahmedfahmy8308/Fontivo
AppSupportURL=https://github.com/Ahmedfahmy8308/Fontivo
AppUpdatesURL=https://github.com/Ahmedfahmy8308/Fontivo/releases
DefaultDirName={autopf}\Fontivo
DefaultGroupName=Fontivo
AllowNoIcons=yes
OutputDir=..\release
OutputBaseFilename=Fontivo-v1.0-Setup
SetupIconFile=..\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
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


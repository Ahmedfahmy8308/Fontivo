//! # Fontivo Desktop Application Entry Point
//!
//! Next-Generation Ultra-Fast Desktop Font Manager & Typography Workstation.
//!
//! This binary boots the desktop runtime, orchestrates the native Tao/Wry window,
//! spawns the embedded REST API server (`127.0.0.1:3920`), starts the Adobe Creative Cloud
//! auto-activation listener (`127.0.0.1:27715`), and routes IPC messages from the React UI.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(dead_code, unused_imports, unused_variables)]

use Fontivo::engine::lifecycle::get_app_data_dir;
use Fontivo::engine::FontActivator;
use Fontivo::scanner::AdobeScanner;
use Fontivo::server::{AdobeListener, ApiServer, AppState, UserEvent};

use std::env;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const API_PORT: u16 = 3920;
const ADOBE_PORT: u16 = 27715;

fn find_dist_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("src/ui/dist"),
        PathBuf::from("ui/dist"),
        PathBuf::from("../ui/dist"),
        PathBuf::from("dist"),
        PathBuf::from("../dist"),
        PathBuf::from("app/ui/dist"),
        PathBuf::from("../app/ui/dist"),
        env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("dist")))
            .unwrap_or_default(),
    ];

    for c in &candidates {
        if c.join("index.html").exists() {
            return c.clone();
        }
    }

    PathBuf::from("ui/dist")
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let log_msg = format!("PANIC: {:?}\n", info);
        let _ = std::fs::write(std::env::temp_dir().join("fontivo_panic.log"), &log_msg);
        eprintln!("{}", log_msg);
    }));

    if let Err(e) = real_main() {
        let err_msg = format!("FATAL STARTUP ERROR: {:?}\n", e);
        let _ = std::fs::write(std::env::temp_dir().join("fontivo_fatal.log"), &err_msg);
        eprintln!("{}", err_msg);
        #[cfg(windows)]
        unsafe {
            use windows::core::w;
            use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
            let wide: Vec<u16> = err_msg.encode_utf16().chain(std::iter::once(0)).collect();
            let _ = MessageBoxW(
                None,
                windows::core::PCWSTR(wide.as_ptr()),
                w!("Fontivo Startup Error"),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}

fn real_main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(windows)]
    unsafe {
        #[link(name = "kernel32")]
        extern "system" {
            fn AttachConsole(dw_process_id: u32) -> i32;
        }
        let _ = AttachConsole(0xFFFFFFFF);

        // Enable Windows Per-Monitor V2 DPI awareness for ultra-crisp typography rendering
        #[link(name = "user32")]
        extern "system" {
            fn SetProcessDpiAwarenessContext(value: isize) -> i32;
        }
        // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
        let _ = SetProcessDpiAwarenessContext(-4);
    }

    let args: Vec<String> = env::args().collect();

    // CLI Mode: Version and build telemetry
    if args
        .iter()
        .any(|a| a == "--version" || a == "-V" || a == "-v")
    {
        println!("{}", Fontivo::BUILD_INFO.display_summary());
        return Ok(());
    }

    // CLI Mode: Help and usage information
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("Fontivo — Next-Generation Ultra-Fast Desktop Font Manager");
        println!();
        println!("USAGE:");
        println!(" Fontivo.exe [OPTIONS]");
        println!();
        println!("OPTIONS:");
        println!(" -V, --version Print version, git commit hash, and build telemetry");
        println!(" -h, --help Print this help text");
        println!(" --daemon, --server Run in headless daemon mode (API on :3920, Adobe bridge on :27715)");
        println!(" --activate <FONT_PATH> Directly activate a font file into RAM (session-based)");
        println!(
            " --inspect <DESIGN_FILE> Inspect and extract font names from PSD/AI/INDD documents"
        );
        println!(" --quick-picker Launch directly into the screen loupe / quick color picker");
        println!(
            " --elevated-restore <PROF> (Internal) UAC elevated worker to restore system fonts"
        );
        println!(
            " --elevated-uninstall <P> (Internal) UAC elevated worker to uninstall system fonts"
        );
        println!(
            " --elevated-undo <ID> (Internal) UAC elevated worker to undo font restore backup"
        );
        return Ok(());
    }

    // Helper to extract `--result-file <path>` for elevated UAC workers
    let result_file_path = args
        .iter()
        .position(|a| a == "--result-file")
        .and_then(|idx| args.get(idx + 1))
        .cloned();

    // On-Demand UAC Elevated Worker: Restore Windows Fonts Profile
    if args.len() >= 3 && args[1] == "--elevated-restore" {
        let profile = &args[2];
        let payload =
            match Fontivo::engine::health::SystemHealthChecker::restore_windows_fonts_with_profile(
                profile,
            ) {
                Ok(res) => serde_json::to_value(&res)
                    .unwrap_or_else(|_| serde_json::json!({ "success": true })),
                Err(e) => serde_json::json!({ "success": false, "error": e }),
            };
        if let Some(ref rf) = result_file_path {
            let _ = std::fs::write(rf, payload.to_string());
        } else {
            println!("{}", payload);
        }
        return Ok(());
    }

    // On-Demand UAC Elevated Worker: Uninstall Windows System Font
    if args.len() >= 3 && args[1] == "--elevated-uninstall" {
        let font_path = &args[2];
        let font_name = args
            .get(3)
            .filter(|a| *a != "--result-file")
            .map(|s| s.as_str());
        let payload = match Fontivo::engine::health::SystemHealthChecker::uninstall_windows_font(
            font_name, font_path,
        ) {
            Ok(msg) => serde_json::json!({ "success": true, "message": msg }),
            Err(e) => serde_json::json!({ "success": false, "error": e }),
        };
        if let Some(ref rf) = result_file_path {
            let _ = std::fs::write(rf, payload.to_string());
        } else {
            println!("{}", payload);
        }
        return Ok(());
    }

    // On-Demand UAC Elevated Worker: Undo Windows Fonts Restore Backup
    if args.len() >= 3 && args[1] == "--elevated-undo" {
        let backup_id = &args[2];
        let payload =
            match Fontivo::engine::health::SystemHealthChecker::undo_restore_backup(backup_id) {
                Ok(count) => serde_json::json!({ "success": true, "restoredCount": count }),
                Err(e) => serde_json::json!({ "success": false, "error": e }),
            };
        if let Some(ref rf) = result_file_path {
            let _ = std::fs::write(rf, payload.to_string());
        } else {
            println!("{}", payload);
        }
        return Ok(());
    }

    // CLI Mode: Direct activation
    if args.len() >= 3 && args[1] == "--activate" {
        let path = &args[2];
        let activator = FontActivator::new();
        match activator.activate_ram(path) {
            Ok(msg) => println!("OK: {}", msg),
            Err(e) => eprintln!("ERR: {}", e),
        }
        return Ok(());
    }

    // CLI Mode: Inspect PSD / AI / INDD
    if args.len() >= 3 && args[1] == "--inspect" {
        let path = Path::new(&args[2]);
        match AdobeScanner::extract_font_names(path) {
            Ok(fonts) => {
                println!("=== Extracted {} fonts from {:?} ===", fonts.len(), path);
                for f in fonts {
                    println!(" - {}", f);
                }
            }
            Err(e) => eprintln!("Error inspecting file: {}", e),
        }
        return Ok(());
    }

    // Initialize State
    let app_state = Arc::new(RwLock::new(AppState::new()));
    let dist_dir = find_dist_dir();

    // Daemon / Headless Mode
    if args
        .iter()
        .any(|a| a == "--daemon" || a == "--headless" || a == "--server")
    {
        AdobeListener::start(Arc::clone(&app_state), ADOBE_PORT);
        ApiServer::start(Arc::clone(&app_state), API_PORT, dist_dir, None);
        Fontivo::updater::AutoUpdater::start_background_loop();

        println!(" Fontivo is running in Headless / Daemon mode.");
        println!(" - REST API: http://127.0.0.1:{}", API_PORT);
        println!(" - Adobe CC Bridge: http://127.0.0.1:{}", ADOBE_PORT);
        println!("Press Ctrl+C to stop...");

        // Keep main thread alive
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
        }
    }

    // GUI Mode: Single-Instance check and Foreground Window Activation
    #[cfg(windows)]
    let _instance_mutex = {
        use windows::core::{w, BOOL};
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS, HWND, LPARAM};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
            ShowWindow, SW_RESTORE, SW_SHOW,
        };

        let mutex =
            unsafe { CreateMutexW(None, true, w!("Local\\Fontivo_Single_Instance_Mutex_v1")) };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe extern "system" fn enum_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
                let mut pid = 0u32;
                let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
                let current_pid = std::process::id();
                if pid != current_pid && pid > 0 && IsWindowVisible(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                    let _ = ShowWindow(hwnd, SW_SHOW);
                    let _ = SetForegroundWindow(hwnd);
                    return BOOL(0);
                }
                BOOL(1)
            }

            unsafe {
                let _ = EnumWindows(Some(enum_proc), LPARAM(0));
            }
            return Ok(());
        }
        mutex
    };

    // GUI Mode: Launch Native Desktop Window using Tao + Wry
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    // Start Adobe CC Auto-Activation Listener on Port 27715
    AdobeListener::start(Arc::clone(&app_state), ADOBE_PORT);

    // Start Fontivo Core API Server on Port 3920 with Window Proxy
    ApiServer::start(
        Arc::clone(&app_state),
        API_PORT,
        dist_dir,
        Some(proxy.clone()),
    );

    // Start Automated Background Self-Updater Loop
    Fontivo::updater::AutoUpdater::start_background_loop();

    // Calculate responsive logical window dimensions based on display resolution
    // Ensures compact 1366x768 screens fit comfortably without window clipping,
    // while full 1080p, 1440p, 4K and Ultrawide displays get the generous 1320x840 canvas.
    let (initial_width, initial_height) = {
        let monitor = event_loop
            .primary_monitor()
            .or_else(|| event_loop.available_monitors().next());
        if let Some(m) = monitor {
            let screen_logical = m.size().to_logical::<f64>(m.scale_factor());
            let max_w = (screen_logical.width * 0.92).max(980.0);
            let max_h = (screen_logical.height * 0.88).max(640.0);
            (1320.0_f64.min(max_w), 840.0_f64.min(max_h))
        } else {
            (1320.0, 840.0)
        }
    };

    let mut window_builder = WindowBuilder::new()
        .with_title("Fontivo — Next-Gen Desktop Font Manager")
        .with_inner_size(LogicalSize::new(initial_width, initial_height))
        .with_min_inner_size(LogicalSize::new(980.0, 600.0))
        .with_resizable(true)
        .with_maximized(true)
        .with_background_color((20, 13, 24, 255));

    #[cfg(windows)]
    {
        // Windows uses frameless window with native Aero Snap and shadow frame
        window_builder = window_builder.with_decorations(false);
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: Native traffic lights (close, minimize, zoom) with transparent titlebar
        // and fullsize content view, matching Apple HIG standards
        use tao::platform::macos::WindowBuilderExtMacOS;
        window_builder = window_builder
            .with_decorations(true)
            .with_title_hidden(true)
            .with_titlebar_transparent(true)
            .with_fullsize_content_view(true)
            .with_has_shadow(true)
            .with_movable_by_window_background(true);
    }

    #[cfg(target_os = "linux")]
    {
        // Linux (Wayland / X11): borderless frame matching desktop window chrome
        window_builder = window_builder.with_decorations(false);
    }

    let window = window_builder.build(&event_loop)?;

    #[cfg(windows)]
    {
        use tao::platform::windows::WindowExtWindows;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED, SWP_NOMOVE,
            SWP_NOSIZE, SWP_NOZORDER, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_THICKFRAME,
        };

        let hwnd = HWND(window.hwnd() as *mut _);
        unsafe {
            let mut style = GetWindowLongW(hwnd, GWL_STYLE);
            style |= (WS_THICKFRAME.0 | WS_MAXIMIZEBOX.0 | WS_MINIMIZEBOX.0) as i32;
            SetWindowLongW(hwnd, GWL_STYLE, style);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            );
        }
    }

    // Cross-platform webview storage directory:
    // Windows: %LOCALAPPDATA%\Fontivo\WebView2
    // macOS: ~/Library/Application Support/Fontivo/WebView2
    // Linux: ~/.local/share/Fontivo/WebView2
    let legacy_webview_dir = get_app_data_dir().join("webview_data");
    if legacy_webview_dir.exists() {
        let _ = std::fs::remove_dir(&legacy_webview_dir);
    }
    let webview_data_dir = get_app_data_dir().join("WebView2");
    let _ = std::fs::create_dir_all(&webview_data_dir);
    let mut web_context = wry::WebContext::new(Some(webview_data_dir));

    let proxy_clone = proxy.clone();
    // Parse optional Fontivo:// protocol deep-link argument (registered by Setup_Fontivo_Pro.iss)
    // or `--quick-picker` Taskbar / Desktop launcher flag
    let is_quick_picker = args
        .iter()
        .any(|a| a == "--quick-picker" || a == "--color-picker");
    let deep_link_url = args
        .iter()
        .skip(1)
        .find_map(|arg| Fontivo::server::security::parse_deep_link_url(arg, API_PORT));
    let url = if is_quick_picker {
        format!(
            "http://127.0.0.1:{}/?tab=workspaces&quickPicker=true&view=color-picker",
            API_PORT
        )
    } else {
        deep_link_url.unwrap_or_else(|| format!("http://127.0.0.1:{}", API_PORT))
    };
    let webview = match WebViewBuilder::new_with_web_context(&mut web_context)
        .with_background_color((20, 13, 24, 255))
        .with_url(&url)
        .with_ipc_handler(move |req| {
            let body = req.body().trim();
            match body {
                "minimize" => {
                    let _ = proxy_clone.send_event(UserEvent::Minimize);
                }
                "maximize" => {
                    let _ = proxy_clone.send_event(UserEvent::Maximize);
                }
                "close" => {
                    let _ = proxy_clone.send_event(UserEvent::Close);
                }
                "drag" => {
                    let _ = proxy_clone.send_event(UserEvent::Drag);
                }
                _ => {}
            }
        })
        .build(&window)
    {
        Ok(wv) => wv,
        Err(e) => {
            eprintln!("Warning: Failed to initialize with custom WebContext ({:?}), retrying with default context...", e);
            let proxy_fallback = proxy.clone();
            WebViewBuilder::new()
                .with_background_color((20, 13, 24, 255))
                .with_url(&url)
                .with_ipc_handler(move |req| {
                    let body = req.body().trim();
                    match body {
                        "minimize" => {
                            let _ = proxy_fallback.send_event(UserEvent::Minimize);
                        }
                        "maximize" => {
                            let _ = proxy_fallback.send_event(UserEvent::Maximize);
                        }
                        "close" => {
                            let _ = proxy_fallback.send_event(UserEvent::Close);
                        }
                        "drag" => {
                            let _ = proxy_fallback.send_event(UserEvent::Drag);
                        }
                        _ => {}
                    }
                })
                .build(&window)?
        }
    };

    let activator_for_exit = {
        let st = app_state.read().unwrap();
        Arc::clone(&st.activator)
    };

    let log_path = std::env::temp_dir().join("fontivo_event_loop.log");
    let _ = std::fs::write(&log_path, "Fontivo starting event loop\n");

    event_loop.run(move |event, _, control_flow| {
        let _keep_alive = &webview;
        *control_flow = ControlFlow::Wait;

        match &event {
            Event::UserEvent(ue) => {
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .and_then(|mut f| {
                        use std::io::Write;
                        writeln!(f, "UserEvent: {:?}", ue)
                    });
            }
            Event::LoopDestroyed => {
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .and_then(|mut f| {
                        use std::io::Write;
                        writeln!(f, "LoopDestroyed!")
                    });
            }
            _ => {}
        }

        match event {
            Event::UserEvent(UserEvent::Minimize) => {
                #[cfg(windows)]
                {
                    use tao::platform::windows::WindowExtWindows;
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_MINIMIZE};
                    unsafe {
                        let _ = ShowWindow(HWND(window.hwnd() as *mut _), SW_MINIMIZE);
                    }
                }
                #[cfg(not(windows))]
                {
                    window.set_minimized(true);
                }
            }
            Event::UserEvent(UserEvent::Maximize) => {
                #[cfg(windows)]
                {
                    use tao::platform::windows::WindowExtWindows;
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{
                        IsZoomed, ShowWindow, SW_MAXIMIZE, SW_RESTORE,
                    };
                    let hwnd = HWND(window.hwnd() as *mut _);
                    unsafe {
                        if IsZoomed(hwnd).as_bool() {
                            let _ = ShowWindow(hwnd, SW_RESTORE);
                        } else {
                            let _ = ShowWindow(hwnd, SW_MAXIMIZE);
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    let is_max = window.is_maximized();
                    window.set_maximized(!is_max);
                }
            }
            Event::UserEvent(UserEvent::Close) => {
                println!("Fontivo closing: cleaning up session-managed RAM fonts...");
                let _ = activator_for_exit.cleanup_session_fonts();
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::Drag) => {
                #[cfg(windows)]
                {
                    use tao::platform::windows::WindowExtWindows;
                    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
                    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_SYSCOMMAND};
                    extern "system" {
                        fn ReleaseCapture() -> i32;
                    }
                    let hwnd = HWND(window.hwnd() as *mut _);
                    unsafe {
                        let _ = ReleaseCapture();
                        let _ = SendMessageW(
                            hwnd,
                            WM_SYSCOMMAND,
                            Some(WPARAM(0xF012)),
                            Some(LPARAM(0)),
                        );
                    }
                }
                #[cfg(not(windows))]
                {
                    let _ = window.drag_window();
                }
            }
            Event::WindowEvent {
                event: WindowEvent::ScaleFactorChanged { scale_factor, .. },
                ..
            } => {
                // High-DPI scale change acknowledged (e.g. window moved between monitors with different DPIs)
                let _ = scale_factor;
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                println!("Fontivo closing: cleaning up session-managed RAM fonts...");
                let _ = activator_for_exit.cleanup_session_fonts();
                *control_flow = ControlFlow::Exit;
            }
            _ => (),
        }
    });
}

//! True Native Win32 Fullscreen Crosshair + Magnifier Eyedropper
//!
//! Captures the entire virtual desktop (all monitors & all open windows behind Fontivo)
//! into a 32-bit DIB section, displays a borderless topmost `IDC_CROSS` overlay with a
//! live double-buffered 7x7 pixel magnifier loupe + `#RRGGBB` preview pill, copies the
//! picked `#RRGGBB` hex value directly to the Windows Clipboard on left-click, and
//! cancels cleanly on right-click or `ESC`.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PickedScreenColor {
    pub x: i32,
    pub y: i32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub hex: String,
    pub copied_to_clipboard: bool,
    pub grid5x5: Vec<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PickOutcome {
    Picked(PickedScreenColor),
    Cancelled,
}

/// Computes the screen-clamped top-left `(left, top)` of the magnifier loupe card
/// so it never clips off the edges of the virtual screen.
pub fn compute_loupe_rect(
    cursor_x: i32,
    cursor_y: i32,
    screen_w: i32,
    screen_h: i32,
    card_w: i32,
    card_h: i32,
    offset: i32,
) -> (i32, i32) {
    let mut left = cursor_x + offset;
    let mut top = cursor_y + offset;

    if left + card_w > screen_w - 8 {
        left = cursor_x - offset - card_w;
    }
    if top + card_h > screen_h - 8 {
        top = cursor_y - offset - card_h;
    }

    left = left.clamp(4, (screen_w - card_w - 4).max(4));
    top = top.clamp(4, (screen_h - card_h - 4).max(4));
    (left, top)
}

/// Reads a single `(r, g, b)` pixel from a top-down 32-bit BGRA buffer (`0xAARRGGBB` in little-endian u32).
pub fn read_bgra_pixel(pixels: &[u32], width: i32, height: i32, x: i32, y: i32) -> (u8, u8, u8) {
    if width <= 0 || height <= 0 || pixels.is_empty() {
        return (82, 0, 234);
    }
    let cx = x.clamp(0, width - 1) as usize;
    let cy = y.clamp(0, height - 1) as usize;
    let idx = cy * (width as usize) + cx;
    let bgra = pixels.get(idx).copied().unwrap_or(0x005200EA);
    let b = (bgra & 0xFF) as u8;
    let g = ((bgra >> 8) & 0xFF) as u8;
    let r = ((bgra >> 16) & 0xFF) as u8;
    (r, g, b)
}

/// Extracts a 5x5 grid of `#RRGGBB` hex strings centered around `(cx, cy)` from a BGRA buffer.
pub fn extract_grid5x5_from_bgra(
    pixels: &[u32],
    width: i32,
    height: i32,
    cx: i32,
    cy: i32,
) -> Vec<Vec<String>> {
    let mut grid = Vec::with_capacity(5);
    for dy in -2..=2 {
        let mut row = Vec::with_capacity(5);
        for dx in -2..=2 {
            let (r, g, b) = read_bgra_pixel(pixels, width, height, cx + dx, cy + dy);
            row.push(format!("#{:02X}{:02X}{:02X}", r, g, b));
        }
        grid.push(row);
    }
    grid
}

/// Copies a UTF-8 string to the Windows clipboard as `CF_UNICODETEXT`.
#[cfg(windows)]
pub fn copy_text_to_clipboard(text: &str) -> bool {
    use std::ptr::copy_nonoverlapping;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    const CF_UNICODETEXT: u32 = 13;

    let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = utf16.len() * std::mem::size_of::<u16>();

    unsafe {
        // Retry briefly in case another app momentarily holds the clipboard
        let mut opened = false;
        for _ in 0..5 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        if !opened {
            return false;
        }

        let _ = EmptyClipboard();

        let hmem = match GlobalAlloc(GMEM_MOVEABLE, byte_len) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return false;
            }
        };

        let ptr = GlobalLock(hmem) as *mut u16;
        if ptr.is_null() {
            let _ = CloseClipboard();
            return false;
        }

        copy_nonoverlapping(utf16.as_ptr(), ptr, utf16.len());
        let _ = GlobalUnlock(hmem);

        let ok = SetClipboardData(CF_UNICODETEXT, Some(HANDLE(hmem.0))).is_ok();
        let _ = CloseClipboard();
        ok
    }
}

#[cfg(not(windows))]
pub fn copy_text_to_clipboard(_text: &str) -> bool {
    false
}

/// Launches the true native Win32 fullscreen crosshair + 7x7 magnifier loupe overlay.
/// Blocks the calling worker thread until the user left-clicks (pick + clipboard copy)
/// or right-clicks / presses ESC (cancel).
#[cfg(windows)]
pub fn pick_screen_color_interactive() -> PickOutcome {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM,
    };
    use windows::Win32::Graphics::Gdi::{
        BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection,
        CreateEllipticRgn, CreateFontW, CreatePen, CreateSolidBrush, DeleteDC, DeleteObject,
        DrawTextW, Ellipse, EndPaint, FillRect, FrameRect, GetDC, GetStockObject, InvalidateRect,
        LineTo, MoveToEx, ReleaseDC, SelectClipRgn, SelectObject, SetBkMode, SetTextColor,
        UpdateWindow, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, DT_LEFT,
        DT_SINGLELINE, DT_VCENTER, FONT_CHARSET, FONT_CLIP_PRECISION, FONT_OUTPUT_PRECISION,
        FONT_QUALITY, HBITMAP, HDC, HFONT, HGDIOBJ, NULL_BRUSH, PAINTSTRUCT, PS_SOLID, SRCCOPY,
        TRANSPARENT,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, SetFocus};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetCursorPos,
        GetMessageW, GetSystemMetrics, GetWindowLongPtrW, LoadCursorW, PostQuitMessage,
        RegisterClassExW, SetCursor, SetForegroundWindow, SetWindowLongPtrW, TranslateMessage,
        CREATESTRUCTW, CS_HREDRAW, CS_VREDRAW, GWLP_USERDATA, HCURSOR, IDC_CROSS, MSG, SM_CXSCREEN,
        SM_CXVIRTUALSCREEN, SM_CYSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        WM_DESTROY, WM_ERASEBKGND, WM_KEYDOWN, WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_NCCREATE, WM_PAINT,
        WM_RBUTTONDOWN, WM_SETCURSOR, WNDCLASSEXW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
        WS_VISIBLE,
    };

    static EYEDROPPER_ACTIVE: AtomicBool = AtomicBool::new(false);
    if EYEDROPPER_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return PickOutcome::Cancelled;
    }

    struct ActiveGuard;
    impl Drop for ActiveGuard {
        fn drop(&mut self) {
            EYEDROPPER_ACTIVE.store(false, Ordering::SeqCst);
        }
    }
    let _guard = ActiveGuard;

    const VK_LBUTTON: i32 = 0x01;
    const VK_ESCAPE: usize = 0x1B;

    // Wait briefly if the triggering UI button click is still held down
    let release_deadline = std::time::Instant::now() + std::time::Duration::from_millis(350);
    while unsafe { (GetAsyncKeyState(VK_LBUTTON) as u16 & 0x8000) != 0 }
        && std::time::Instant::now() < release_deadline
    {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    struct OverlayState {
        vx_x: i32,
        vx_y: i32,
        vx_w: i32,
        vx_h: i32,
        mem_dc: HDC,
        back_dc: HDC,
        pixels_ptr: *const u32,
        pixels_len: usize,
        cursor_x: i32,
        cursor_y: i32,
        cross_cursor: HCURSOR,
        label_font: HFONT,
        sub_font: HFONT,
        outcome: PickOutcome,
    }

    impl OverlayState {
        fn pixels_slice(&self) -> &[u32] {
            if self.pixels_ptr.is_null() || self.pixels_len == 0 {
                &[]
            } else {
                unsafe { std::slice::from_raw_parts(self.pixels_ptr, self.pixels_len) }
            }
        }
    }

    unsafe fn paint_overlay(hwnd: HWND, st: &OverlayState) {
        let mut ps = PAINTSTRUCT::default();
        let hdc = BeginPaint(hwnd, &mut ps);
        if hdc.is_invalid() {
            return;
        }

        // 1. Blit frozen virtual desktop screenshot onto back buffer
        let _ = BitBlt(
            st.back_dc,
            0,
            0,
            st.vx_w,
            st.vx_h,
            Some(st.mem_dc),
            0,
            0,
            SRCCOPY,
        );

        // 2. Draw circular cursor target ring + crosshair directly around cursor tip
        let null_brush = GetStockObject(NULL_BRUSH);
        let coral_pen = CreatePen(PS_SOLID, 2, COLORREF(0x00506BF1)); // Coral #F16B50 (BGR)
        let white_pen = CreatePen(PS_SOLID, 1, COLORREF(0x00FFFFFF));
        let black_pen = CreatePen(PS_SOLID, 1, COLORREF(0x00170D14));

        let prev_brush = SelectObject(st.back_dc, null_brush);
        let prev_pen = SelectObject(st.back_dc, HGDIOBJ(black_pen.0));
        let _ = Ellipse(
            st.back_dc,
            st.cursor_x - 16,
            st.cursor_y - 16,
            st.cursor_x + 17,
            st.cursor_y + 17,
        );
        SelectObject(st.back_dc, HGDIOBJ(coral_pen.0));
        let _ = Ellipse(
            st.back_dc,
            st.cursor_x - 15,
            st.cursor_y - 15,
            st.cursor_x + 16,
            st.cursor_y + 16,
        );
        SelectObject(st.back_dc, HGDIOBJ(white_pen.0));
        let _ = Ellipse(
            st.back_dc,
            st.cursor_x - 13,
            st.cursor_y - 13,
            st.cursor_x + 14,
            st.cursor_y + 14,
        );

        // Open-aperture crosshair ticks inside the circular target ring
        let _ = MoveToEx(st.back_dc, st.cursor_x - 10, st.cursor_y, None);
        let _ = LineTo(st.back_dc, st.cursor_x - 3, st.cursor_y);
        let _ = MoveToEx(st.back_dc, st.cursor_x + 4, st.cursor_y, None);
        let _ = LineTo(st.back_dc, st.cursor_x + 11, st.cursor_y);
        let _ = MoveToEx(st.back_dc, st.cursor_x, st.cursor_y - 10, None);
        let _ = LineTo(st.back_dc, st.cursor_x, st.cursor_y - 3);
        let _ = MoveToEx(st.back_dc, st.cursor_x, st.cursor_y + 4, None);
        let _ = LineTo(st.back_dc, st.cursor_x, st.cursor_y + 11);

        // 3. Compute circular 7x7 magnifier lens + #RRGGBB pill geometry
        const GRID_N: i32 = 7;
        const HALF_N: i32 = 3;
        const CELL: i32 = 20;
        const GRID_SIZE: i32 = GRID_N * CELL; // 140px diameter circle
        const PILL_H: i32 = 42;
        const PILL_GAP: i32 = 8;
        const CARD_W: i32 = GRID_SIZE + 8; // 148px
        const CARD_H: i32 = GRID_SIZE + PILL_GAP + PILL_H; // 190px

        let (card_x, card_y) = compute_loupe_rect(
            st.cursor_x,
            st.cursor_y,
            st.vx_w,
            st.vx_h,
            CARD_W,
            CARD_H,
            26,
        );

        let bg_brush = CreateSolidBrush(COLORREF(0x0022131D)); // Plum #1D1322
        let grid_line_brush = CreateSolidBrush(COLORREF(0x00452B3D));
        let black_brush = CreateSolidBrush(COLORREF(0x00000000));
        let white_brush = CreateSolidBrush(COLORREF(0x00FFFFFF));

        // 4. Clip pixel grid strictly to a Circular Lens (not a square!)
        let grid_x0 = card_x + 4;
        let grid_y0 = card_y + 4;
        let circle_rgn =
            CreateEllipticRgn(grid_x0, grid_y0, grid_x0 + GRID_SIZE, grid_y0 + GRID_SIZE);
        let _ = SelectClipRgn(st.back_dc, Some(circle_rgn));

        let pixels = st.pixels_slice();
        for dy in -HALF_N..=HALF_N {
            for dx in -HALF_N..=HALF_N {
                let (r, g, b) =
                    read_bgra_pixel(pixels, st.vx_w, st.vx_h, st.cursor_x + dx, st.cursor_y + dy);
                let cell_left = grid_x0 + (dx + HALF_N) * CELL;
                let cell_top = grid_y0 + (dy + HALF_N) * CELL;
                let cell_rect = RECT {
                    left: cell_left,
                    top: cell_top,
                    right: cell_left + CELL,
                    bottom: cell_top + CELL,
                };
                let color_ref = COLORREF((r as u32) | ((g as u32) << 8) | ((b as u32) << 16));
                let cell_brush = CreateSolidBrush(color_ref);
                FillRect(st.back_dc, &cell_rect, cell_brush);
                let _ = DeleteObject(HGDIOBJ(cell_brush.0));
                FrameRect(st.back_dc, &cell_rect, grid_line_brush);
            }
        }

        // Highlight exact center pixel inside the circular lens
        let center_left = grid_x0 + HALF_N * CELL;
        let center_top = grid_y0 + HALF_N * CELL;
        let center_outer = RECT {
            left: center_left - 1,
            top: center_top - 1,
            right: center_left + CELL + 1,
            bottom: center_top + CELL + 1,
        };
        let center_inner = RECT {
            left: center_left,
            top: center_top,
            right: center_left + CELL,
            bottom: center_top + CELL,
        };
        FrameRect(st.back_dc, &center_outer, black_brush);
        FrameRect(st.back_dc, &center_inner, white_brush);

        // Clear clip region and stroke circular outer bezel rings around the lens
        let _ = SelectClipRgn(st.back_dc, None);
        let _ = DeleteObject(HGDIOBJ(circle_rgn.0));

        SelectObject(st.back_dc, null_brush);
        SelectObject(st.back_dc, HGDIOBJ(black_pen.0));
        let _ = Ellipse(
            st.back_dc,
            grid_x0 - 2,
            grid_y0 - 2,
            grid_x0 + GRID_SIZE + 2,
            grid_y0 + GRID_SIZE + 2,
        );
        SelectObject(st.back_dc, HGDIOBJ(coral_pen.0));
        let _ = Ellipse(
            st.back_dc,
            grid_x0 - 1,
            grid_y0 - 1,
            grid_x0 + GRID_SIZE + 1,
            grid_y0 + GRID_SIZE + 1,
        );
        SelectObject(st.back_dc, HGDIOBJ(white_pen.0));
        let _ = Ellipse(
            st.back_dc,
            grid_x0,
            grid_y0,
            grid_x0 + GRID_SIZE,
            grid_y0 + GRID_SIZE,
        );

        // 5. Compact Plum #RRGGBB readout pill cleanly below the circular lens
        let (cr, cg, cb) = read_bgra_pixel(pixels, st.vx_w, st.vx_h, st.cursor_x, st.cursor_y);
        let hex_label = format!("#{:02X}{:02X}{:02X}", cr, cg, cb);
        let rgb_label = format!("{},{},{}", cr, cg, cb);

        let pill_top = grid_y0 + GRID_SIZE + PILL_GAP;
        let pill_rect = RECT {
            left: card_x,
            top: pill_top,
            right: card_x + CARD_W,
            bottom: pill_top + PILL_H,
        };
        let border_brush = CreateSolidBrush(COLORREF(0x00506BF1));
        FillRect(st.back_dc, &pill_rect, bg_brush);
        FrameRect(st.back_dc, &pill_rect, border_brush);

        let swatch_rect = RECT {
            left: card_x + 8,
            top: pill_top + 7,
            right: card_x + 36,
            bottom: pill_top + 35,
        };
        let swatch_brush = CreateSolidBrush(COLORREF(
            (cr as u32) | ((cg as u32) << 8) | ((cb as u32) << 16),
        ));
        FillRect(st.back_dc, &swatch_rect, swatch_brush);
        FrameRect(st.back_dc, &swatch_rect, white_brush);
        let _ = DeleteObject(HGDIOBJ(swatch_brush.0));

        let _ = SetBkMode(st.back_dc, TRANSPARENT);
        let old_font = SelectObject(st.back_dc, HGDIOBJ(st.label_font.0));
        let _ = SetTextColor(st.back_dc, COLORREF(0x00FFFFFF));

        let mut hex_rect = RECT {
            left: card_x + 44,
            top: pill_top + 3,
            right: card_x + CARD_W - 6,
            bottom: pill_top + 23,
        };
        let mut hex_w: Vec<u16> = hex_label.encode_utf16().collect();
        let _ = DrawTextW(
            st.back_dc,
            &mut hex_w,
            &mut hex_rect,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE,
        );

        SelectObject(st.back_dc, HGDIOBJ(st.sub_font.0));
        let _ = SetTextColor(st.back_dc, COLORREF(0x00D9A1B7)); // Lavender
        let mut rgb_rect = RECT {
            left: card_x + 44,
            top: pill_top + 22,
            right: card_x + CARD_W - 6,
            bottom: pill_top + 38,
        };
        let mut rgb_w: Vec<u16> = rgb_label.encode_utf16().collect();
        let _ = DrawTextW(
            st.back_dc,
            &mut rgb_w,
            &mut rgb_rect,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE,
        );

        SelectObject(st.back_dc, old_font);
        SelectObject(st.back_dc, prev_brush);
        SelectObject(st.back_dc, prev_pen);

        let _ = DeleteObject(HGDIOBJ(coral_pen.0));
        let _ = DeleteObject(HGDIOBJ(white_pen.0));
        let _ = DeleteObject(HGDIOBJ(black_pen.0));
        let _ = DeleteObject(HGDIOBJ(bg_brush.0));
        let _ = DeleteObject(HGDIOBJ(border_brush.0));
        let _ = DeleteObject(HGDIOBJ(grid_line_brush.0));
        let _ = DeleteObject(HGDIOBJ(black_brush.0));
        let _ = DeleteObject(HGDIOBJ(white_brush.0));

        // 6. Atomic single-blit to overlay window DC
        let _ = BitBlt(hdc, 0, 0, st.vx_w, st.vx_h, Some(st.back_dc), 0, 0, SRCCOPY);

        let _ = EndPaint(hwnd, &ps);
    }

    unsafe extern "system" fn eyedropper_wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_NCCREATE => {
                let cs = lparam.0 as *const CREATESTRUCTW;
                if !cs.is_null() {
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, (*cs).lpCreateParams as isize);
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_SETCURSOR => {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                if !ptr.is_null() {
                    let st = &*ptr;
                    if !st.cross_cursor.is_invalid() {
                        SetCursor(Some(st.cross_cursor));
                        return LRESULT(1);
                    }
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_ERASEBKGND => LRESULT(1),
            WM_MOUSEMOVE => {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                if !ptr.is_null() {
                    let st = &mut *ptr;
                    let x = (lparam.0 & 0xFFFF) as i16 as i32;
                    let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
                    st.cursor_x = x;
                    st.cursor_y = y;
                    let _ = InvalidateRect(Some(hwnd), None, false);
                }
                LRESULT(0)
            }
            WM_PAINT => {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                if !ptr.is_null() {
                    paint_overlay(hwnd, &*ptr);
                    return LRESULT(0);
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_LBUTTONDOWN => {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                if !ptr.is_null() {
                    let st = &mut *ptr;
                    let cx = (lparam.0 & 0xFFFF) as i16 as i32;
                    let cy = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
                    let pixels = st.pixels_slice();
                    let (r, g, b) = read_bgra_pixel(pixels, st.vx_w, st.vx_h, cx, cy);
                    let hex = format!("#{:02X}{:02X}{:02X}", r, g, b);
                    let grid5x5 = extract_grid5x5_from_bgra(pixels, st.vx_w, st.vx_h, cx, cy);
                    let copied = copy_text_to_clipboard(&hex);

                    st.outcome = PickOutcome::Picked(PickedScreenColor {
                        x: st.vx_x + cx,
                        y: st.vx_y + cy,
                        r,
                        g,
                        b,
                        hex,
                        copied_to_clipboard: copied,
                        grid5x5,
                    });
                }
                let _ = DestroyWindow(hwnd);
                LRESULT(0)
            }
            WM_RBUTTONDOWN => {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                if !ptr.is_null() {
                    (*ptr).outcome = PickOutcome::Cancelled;
                }
                let _ = DestroyWindow(hwnd);
                LRESULT(0)
            }
            WM_KEYDOWN => {
                if wparam.0 == VK_ESCAPE {
                    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut OverlayState;
                    if !ptr.is_null() {
                        (*ptr).outcome = PickOutcome::Cancelled;
                    }
                    let _ = DestroyWindow(hwnd);
                    return LRESULT(0);
                }
                DefWindowProcW(hwnd, msg, wparam, lparam)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe {
        // 1. Capture entire virtual desktop BEFORE creating the overlay window
        let vx_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vx_y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let mut vx_w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let mut vx_h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if vx_w <= 0 || vx_h <= 0 {
            vx_w = GetSystemMetrics(SM_CXSCREEN).max(1);
            vx_h = GetSystemMetrics(SM_CYSCREEN).max(1);
        }

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return PickOutcome::Cancelled;
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let back_dc = CreateCompatibleDC(Some(screen_dc));

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: vx_w,
                biHeight: -vx_h, // Top-down DIB so row 0 is y = 0
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };

        let mut bits_ptr: *mut c_void = std::ptr::null_mut();
        let dib_bmp: HBITMAP = match CreateDIBSection(
            Some(screen_dc),
            &bmi,
            DIB_RGB_COLORS,
            &mut bits_ptr,
            None,
            0,
        ) {
            Ok(b) => b,
            Err(_) => {
                let _ = DeleteDC(back_dc);
                let _ = DeleteDC(mem_dc);
                let _ = ReleaseDC(None, screen_dc);
                return PickOutcome::Cancelled;
            }
        };

        let back_bmp = CreateCompatibleBitmap(screen_dc, vx_w, vx_h);
        let old_mem_obj = SelectObject(mem_dc, HGDIOBJ(dib_bmp.0));
        let old_back_obj = SelectObject(back_dc, HGDIOBJ(back_bmp.0));

        // Capture ALL visible + layered windows across the entire virtual desktop
        let _ = BitBlt(
            mem_dc,
            0,
            0,
            vx_w,
            vx_h,
            Some(screen_dc),
            vx_x,
            vx_y,
            SRCCOPY | CAPTUREBLT,
        );
        let _ = ReleaseDC(None, screen_dc);

        // Initial cursor position relative to virtual screen
        let mut pt = POINT { x: vx_x, y: vx_y };
        let _ = GetCursorPos(&mut pt);
        let init_cx = (pt.x - vx_x).clamp(0, vx_w - 1);
        let init_cy = (pt.y - vx_y).clamp(0, vx_h - 1);

        let cross_cursor = LoadCursorW(None, IDC_CROSS).unwrap_or_default();

        let font_face: Vec<u16> = "Consolas\0".encode_utf16().collect();
        let label_font = CreateFontW(
            -16,
            0,
            0,
            0,
            700,
            0,
            0,
            0,
            FONT_CHARSET(0),
            FONT_OUTPUT_PRECISION(0),
            FONT_CLIP_PRECISION(0),
            FONT_QUALITY(5), // CLEARTYPE_QUALITY
            0,
            PCWSTR(font_face.as_ptr()),
        );
        let sub_font = CreateFontW(
            -12,
            0,
            0,
            0,
            400,
            0,
            0,
            0,
            FONT_CHARSET(0),
            FONT_OUTPUT_PRECISION(0),
            FONT_CLIP_PRECISION(0),
            FONT_QUALITY(5),
            0,
            PCWSTR(font_face.as_ptr()),
        );

        let hinstance: HINSTANCE = GetModuleHandleW(None).map(|m| m.into()).unwrap_or_default();

        let class_name: Vec<u16> = "FontivoNativeEyedropperClass\0".encode_utf16().collect();
        let title_w: Vec<u16> = "Fontivo Eyedropper\0".encode_utf16().collect();

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(eyedropper_wndproc),
            hInstance: hinstance,
            hCursor: cross_cursor,
            lpszClassName: PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        let _ = RegisterClassExW(&wc);

        let mut overlay_state = OverlayState {
            vx_x,
            vx_y,
            vx_w,
            vx_h,
            mem_dc,
            back_dc,
            pixels_ptr: bits_ptr as *const u32,
            pixels_len: (vx_w as usize).saturating_mul(vx_h as usize),
            cursor_x: init_cx,
            cursor_y: init_cy,
            cross_cursor,
            label_font,
            sub_font,
            outcome: PickOutcome::Cancelled,
        };

        let hwnd_res = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            PCWSTR(class_name.as_ptr()),
            PCWSTR(title_w.as_ptr()),
            WS_POPUP | WS_VISIBLE,
            vx_x,
            vx_y,
            vx_w,
            vx_h,
            None,
            None,
            Some(hinstance),
            Some(&mut overlay_state as *mut OverlayState as *const c_void),
        );

        if let Ok(hwnd) = hwnd_res {
            let _ = SetForegroundWindow(hwnd);
            let _ = SetFocus(Some(hwnd));
            if !cross_cursor.is_invalid() {
                SetCursor(Some(cross_cursor));
            }
            let _ = InvalidateRect(Some(hwnd), None, false);
            let _ = UpdateWindow(hwnd);

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        // Cleanup GDI resources
        SelectObject(mem_dc, old_mem_obj);
        SelectObject(back_dc, old_back_obj);
        let _ = DeleteObject(HGDIOBJ(dib_bmp.0));
        let _ = DeleteObject(HGDIOBJ(back_bmp.0));
        let _ = DeleteObject(HGDIOBJ(label_font.0));
        let _ = DeleteObject(HGDIOBJ(sub_font.0));
        let _ = DeleteDC(mem_dc);
        let _ = DeleteDC(back_dc);

        overlay_state.outcome
    }
}

#[cfg(not(windows))]
pub fn pick_screen_color_interactive() -> PickOutcome {
    PickOutcome::Cancelled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_loupe_rect_never_clips_edges() {
        // Normal top-left interior
        let (x, y) = compute_loupe_rect(100, 100, 1920, 1080, 156, 202, 24);
        assert_eq!((x, y), (124, 124));

        // Near bottom-right corner: flips left & up so it stays inside bounds
        let (x2, y2) = compute_loupe_rect(1900, 1060, 1920, 1080, 156, 202, 24);
        assert!(x2 + 156 <= 1920);
        assert!(y2 + 202 <= 1080);
        assert!(x2 < 1900);
        assert!(y2 < 1060);

        // Near (0, 0)
        let (x3, y3) = compute_loupe_rect(0, 0, 1920, 1080, 156, 202, 24);
        assert!(x3 >= 4 && y3 >= 4);
    }

    #[test]
    fn test_read_bgra_pixel_and_grid5x5() {
        // 3x3 image where center (1,1) is RGB(0x12, 0x34, 0x56) -> BGRA u32 = 0x00123456
        let mut pixels = vec![0x00112233u32; 9];
        pixels[4] = 0x00123456;
        assert_eq!(read_bgra_pixel(&pixels, 3, 3, 1, 1), (0x12, 0x34, 0x56));
        // Clamped out-of-bounds reads corner safely
        assert_eq!(read_bgra_pixel(&pixels, 3, 3, -10, -10), (0x11, 0x22, 0x33));

        let grid = extract_grid5x5_from_bgra(&pixels, 3, 3, 1, 1);
        assert_eq!(grid.len(), 5);
        assert_eq!(grid[0].len(), 5);
        assert_eq!(grid[2][2], "#123456");
        assert_eq!(grid[0][0], "#112233");
    }
}

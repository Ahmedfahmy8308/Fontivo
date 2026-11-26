use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use Fontivo::engine::health::SystemHealthChecker;
use Fontivo::engine::lifecycle::{FontLifecycleBackend, FontLifecycleError};
use Fontivo::engine::FontActivator;

// =========================================================================
// Thread-Safe In-Memory Mock Backend for High-Throughput Stress Testing
// =========================================================================

struct MockStressBackend {
    pub activations: AtomicUsize,
    pub deactivations: AtomicUsize,
    pub broadcasts: AtomicUsize,
}

impl MockStressBackend {
    fn new() -> Self {
        Self {
            activations: AtomicUsize::new(0),
            deactivations: AtomicUsize::new(0),
            broadcasts: AtomicUsize::new(0),
        }
    }
}

impl FontLifecycleBackend for MockStressBackend {
    fn is_format_supported(&self, ext: &str) -> bool {
        let e = ext.trim_start_matches('.').to_ascii_lowercase();
        e == "ttf" || e == "otf"
    }

    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError> {
        if !path.exists() {
            return Err(FontLifecycleError::FileNotFound(path.to_path_buf()));
        }
        self.activations.fetch_add(1, Ordering::SeqCst);
        Ok(1)
    }

    fn deactivate_ram(&self, _path: &Path) -> Result<bool, FontLifecycleError> {
        self.deactivations.fetch_add(1, Ordering::SeqCst);
        Ok(true)
    }

    fn install_permanent(
        &self,
        src: &Path,
        _font_name: &str,
    ) -> Result<PathBuf, FontLifecycleError> {
        Ok(src.to_path_buf())
    }

    fn uninstall_permanent(
        &self,
        _font_name: &str,
        _file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError> {
        Ok(true)
    }

    fn broadcast_change(&self) {
        self.broadcasts.fetch_add(1, Ordering::SeqCst);
    }
}

// =========================================================================
// 1. Allocate, Activate, and Deactivate 1,000+ Mock Fonts in Memory
// =========================================================================

#[test]
fn test_stress_allocate_activate_deactivate_1000_mock_fonts() {
    let temp_dir = std::env::temp_dir().join("fontivo_stress_1000_fonts");
    let _ = fs::create_dir_all(&temp_dir);

    // Minimal valid TTF header (32 bytes)
    let mock_ttf_bytes = [
        0x00, 0x01, 0x00, 0x00, // TTF magic
        0x00, 0x01, // numTables = 1
        0x00, 0x10, 0x00, 0x00, 0x00, 0x00, // searchRange, entrySelector, rangeShift
        b'h', b'e', b'a', b'd', // tag
        0x00, 0x00, 0x00, 0x00, // checksum
        0x00, 0x00, 0x00, 0x1C, // offset = 28
        0x00, 0x00, 0x00, 0x04, // length = 4
        0x00, 0x00, 0x00, 0x00, // head data
    ];

    const TOTAL_FONTS: usize = 1200;
    let mut font_paths = Vec::with_capacity(TOTAL_FONTS);

    for i in 0..TOTAL_FONTS {
        let file_path = temp_dir.join(format!("StressFont_{:04}.ttf", i));
        fs::write(&file_path, mock_ttf_bytes).unwrap();
        font_paths.push(file_path.to_string_lossy().to_string());
    }

    // Sample initial RAM footprint
    let ram_start_mb = SystemHealthChecker::get_current_process_ram_mb();

    let backend = Arc::new(MockStressBackend::new());
    let activator =
        FontActivator::with_backend(Box::new(MockStressBackendClone(Arc::clone(&backend))));

    // 1. Rapid bulk activation of 1,200 fonts
    let mut activated_count = 0;
    for path in &font_paths {
        let res = activator.activate_ram(path);
        assert!(res.is_ok(), "Activation failed for path: {}", path);
        activated_count += 1;
    }

    assert_eq!(activated_count, TOTAL_FONTS);
    assert_eq!(backend.activations.load(Ordering::SeqCst), TOTAL_FONTS);
    assert_eq!(activator.get_session_managed_count(), TOTAL_FONTS);

    // Sample peak RAM footprint during 1,200 active fonts
    let ram_peak_mb = SystemHealthChecker::get_current_process_ram_mb();
    let ram_growth = (ram_peak_mb - ram_start_mb).max(0.0);

    // Memory footprint must remain tightly bounded (less than 50 MB overhead for 1,200 handles)
    println!(
        "Stress 1,200 fonts: RAM Start = {:.2} MB, RAM Peak = {:.2} MB, Delta = {:.2} MB",
        ram_start_mb, ram_peak_mb, ram_growth
    );
    assert!(
        ram_growth < 50.0,
        "Memory footprint grew excessively ({:.2} MB) for 1,200 active fonts!",
        ram_growth
    );

    // 2. Rapid bulk deactivation of all 1,200 fonts
    let cleared = activator.deactivate_all();
    assert!(
        cleared >= TOTAL_FONTS,
        "Expected at least {} cleared, got {}",
        TOTAL_FONTS,
        cleared
    );
    assert_eq!(activator.get_active_count(), 0);
    assert_eq!(activator.get_session_managed_count(), 0);

    // Sample final RAM footprint after complete purge
    let ram_end_mb = SystemHealthChecker::get_current_process_ram_mb();
    println!("Stress 1,200 fonts: RAM End = {:.2} MB", ram_end_mb);

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// 2. Concurrent Activation Requests from Multiple Threads
// =========================================================================

#[test]
fn test_stress_concurrent_activation_multithreaded() {
    let temp_dir = std::env::temp_dir().join("fontivo_stress_concurrency");
    let _ = fs::create_dir_all(&temp_dir);

    let mock_bytes = [
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, b'h', b'e', b'a',
        b'd', 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1C, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00,
        0x00, 0x00,
    ];

    const THREAD_COUNT: usize = 16;
    const FONTS_PER_THREAD: usize = 50;

    let mut thread_fonts = Vec::with_capacity(THREAD_COUNT);
    for t in 0..THREAD_COUNT {
        let mut paths = Vec::with_capacity(FONTS_PER_THREAD);
        for i in 0..FONTS_PER_THREAD {
            let p = temp_dir.join(format!("ConcurrentFont_T{:02}_F{:02}.ttf", t, i));
            fs::write(&p, mock_bytes).unwrap();
            paths.push(p.to_string_lossy().to_string());
        }
        thread_fonts.push(paths);
    }

    let backend = Arc::new(MockStressBackend::new());
    let activator = Arc::new(FontActivator::with_backend(Box::new(
        MockStressBackendClone(Arc::clone(&backend)),
    )));

    let mut handles = Vec::new();

    for paths_item in thread_fonts.iter().take(THREAD_COUNT) {
        let act = Arc::clone(&activator);
        let paths = paths_item.clone();

        handles.push(thread::spawn(move || {
            // Activate phase
            for p in &paths {
                let res = act.activate_ram(p);
                assert!(res.is_ok(), "Thread failed to activate: {}", p);
                assert!(act.is_active(p));
            }

            // Deactivate phase
            for p in &paths {
                let res = act.deactivate_ram(p);
                assert!(res.is_ok(), "Thread failed to deactivate: {}", p);
                assert!(!act.is_active(p));
            }
        }));
    }

    for h in handles {
        h.join()
            .expect("Worker thread panicked during concurrent stress test");
    }

    assert_eq!(activator.get_active_count(), 0);
    assert_eq!(
        backend.activations.load(Ordering::SeqCst),
        THREAD_COUNT * FONTS_PER_THREAD
    );
    assert_eq!(
        backend.deactivations.load(Ordering::SeqCst),
        THREAD_COUNT * FONTS_PER_THREAD
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// 3. Automatic Cleanup on RAII Handle Drop & Activator Drop
// =========================================================================

#[test]
fn test_stress_raii_handle_automatic_cleanup() {
    let temp_dir = std::env::temp_dir().join("fontivo_stress_raii");
    let _ = fs::create_dir_all(&temp_dir);

    let mock_bytes = [
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, b'h', b'e', b'a',
        b'd', 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1C, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00,
        0x00, 0x00,
    ];

    let font_file = temp_dir.join("ScopedFont.ttf");
    fs::write(&font_file, mock_bytes).unwrap();
    let font_path_str = font_file.to_string_lossy().to_string();

    let backend = Arc::new(MockStressBackend::new());
    let activator =
        FontActivator::with_backend(Box::new(MockStressBackendClone(Arc::clone(&backend))));

    // Test Scoped Handle Drop
    {
        let handle = activator
            .activate_scoped(&font_path_str)
            .expect("Scoped activation should succeed");
        assert!(
            activator.is_active(&font_path_str),
            "Font must be active while handle is alive"
        );
        assert_eq!(handle.path(), font_path_str);
        assert_eq!(backend.activations.load(Ordering::SeqCst), 1);
        assert_eq!(backend.deactivations.load(Ordering::SeqCst), 0);
    } // Handle drops here

    assert!(
        !activator.is_active(&font_path_str),
        "Font must be automatically deactivated upon handle drop"
    );
    assert_eq!(
        backend.deactivations.load(Ordering::SeqCst),
        1,
        "Deactivation must be called on handle drop"
    );

    // Test Activator Drop Session Cleanup
    {
        let scoped_activator =
            FontActivator::with_backend(Box::new(MockStressBackendClone(Arc::clone(&backend))));
        let _ = scoped_activator.activate_ram(&font_path_str);
        assert!(scoped_activator.is_active(&font_path_str));
    } // scoped_activator drops here, invoking Drop::drop -> cleanup_session_fonts

    assert_eq!(
        backend.deactivations.load(Ordering::SeqCst),
        2,
        "Activator drop must automatically cleanup remaining session fonts"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

// =========================================================================
// Backend Adapter Clone Helper
// =========================================================================

struct MockStressBackendClone(Arc<MockStressBackend>);

impl FontLifecycleBackend for MockStressBackendClone {
    fn is_format_supported(&self, ext: &str) -> bool {
        self.0.is_format_supported(ext)
    }

    fn activate_ram(&self, path: &Path) -> Result<u32, FontLifecycleError> {
        self.0.activate_ram(path)
    }

    fn deactivate_ram(&self, path: &Path) -> Result<bool, FontLifecycleError> {
        self.0.deactivate_ram(path)
    }

    fn install_permanent(
        &self,
        src: &Path,
        font_name: &str,
    ) -> Result<PathBuf, FontLifecycleError> {
        self.0.install_permanent(src, font_name)
    }

    fn uninstall_permanent(
        &self,
        font_name: &str,
        file_name: Option<&str>,
    ) -> Result<bool, FontLifecycleError> {
        self.0.uninstall_permanent(font_name, file_name)
    }

    fn broadcast_change(&self) {
        self.0.broadcast_change();
    }
}

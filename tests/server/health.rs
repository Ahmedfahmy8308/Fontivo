use Fontivo::engine::health::SystemHealthChecker;

#[test]
fn test_system_health_audit() {
    let report = SystemHealthChecker::get_report(10939);
    println!(
        "Registered Registry Fonts: {}",
        report.registered_fonts_count
    );
    println!("Dead / Orphan Entries: {}", report.dead_entries_count);
    println!("Cache Status: {}", report.cache_status);
    println!("Library Total: {}", report.library_total);

    assert!(
        report.registered_fonts_count > 0,
        "Windows registry should contain fonts"
    );
    assert_eq!(report.library_total, 10939);
    assert!(!report.cache_status.is_empty());
}

#[test]
fn test_windows_fonts_unique_ids() {
    let fonts = SystemHealthChecker::enumerate_windows_fonts();
    assert!(
        !fonts.is_empty(),
        "enumerate_windows_fonts should return installed fonts"
    );

    let mut ids = std::collections::HashSet::new();
    for f in &fonts {
        assert!(!f.id.is_empty(), "Font ID must not be empty");
        assert!(
            f.id.starts_with("win-"),
            "Font ID must start with 'win-', got '{}'",
            f.id
        );
        assert!(ids.insert(&f.id), "Duplicate font ID detected: {}", f.id);
    }
}

#[test]
fn test_real_64bit_ram_and_live_resources() {
    let (used_mb, total_mb, avail_mb, percent) = SystemHealthChecker::get_system_ram_detailed();
    assert!(
        total_mb > 1024.0,
        "Total physical RAM must be > 1 GB, got {} MB",
        total_mb
    );
    assert!(
        used_mb > 0.0 && used_mb <= total_mb,
        "Used RAM ({}) must be within (0, total={}]",
        used_mb,
        total_mb
    );
    assert!(avail_mb >= 0.0 && avail_mb <= total_mb);
    assert!(percent > 0.0 && percent <= 100.0);

    let res = SystemHealthChecker::get_system_resources(0);
    assert!(res.success);
    // Flat and nested fields must match so all UI views receive real 64-bit RAM
    assert!((res.system_total_mb - res.ram.total_mb).abs() < 0.2);
    assert!((res.system_used_mb - res.ram.used_mb).abs() < 0.2);
    assert!((res.system_available_mb - res.ram.available_mb).abs() < 0.2);
    assert!((res.process_ram_mb - res.ram.fontivo_ram_mb).abs() < 0.2);
    assert!(
        !res.top_processes.is_empty(),
        "Top processes should be populated via native Win32 snapshot"
    );
    assert!(res.cpu.cores_count > 0);
}

#[test]
fn test_optimize_ram_returns_measured_fields() {
    let res = SystemHealthChecker::optimize_system_ram_with_cleared_fonts(0);
    assert!(res.success);
    assert!(res.before_mb > 0.0);
    assert!(res.after_mb > 0.0);
    assert_eq!(res.processes_trimmed, res.trimmed_processes_count);
    assert!(
        res.processes_trimmed > 0,
        "Should trim at least Fontivo's own working set"
    );
    assert_eq!(res.active_fonts_cleared, 0);
}

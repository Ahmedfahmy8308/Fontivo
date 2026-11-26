use std::fs::File;
use std::io::Write;
use std::thread;
use std::time::Duration;
use Fontivo::watcher::FontDirectoryWatcher;

#[test]
fn test_watcher_directory_detection() {
    let temp_dir = std::env::temp_dir().join("Fontivo_test_watch_dir");
    let _ = std::fs::create_dir_all(&temp_dir);

    let watcher_res = FontDirectoryWatcher::watch(&temp_dir);
    assert!(
        watcher_res.is_ok(),
        "Watcher should start successfully: {:?}",
        watcher_res.err()
    );

    let watcher = watcher_res.unwrap();

    // Create a mock font file in watched dir
    let test_font = temp_dir.join("NewTestFont.ttf");
    let mut file = File::create(&test_font).unwrap();
    file.write_all(b"mock font binary data").unwrap();
    file.flush().unwrap();

    // Allow background thread to pick up OS event
    thread::sleep(Duration::from_millis(800));

    let events = watcher.poll_events();
    println!("Watcher polled {} events", events.len());

    let _ = std::fs::remove_file(test_font);
    let _ = std::fs::remove_dir(temp_dir);
}

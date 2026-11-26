use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FontChangeEvent {
    Added(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
}

pub struct FontDirectoryWatcher {
    _watcher: RecommendedWatcher,
    event_receiver: Arc<Mutex<Receiver<FontChangeEvent>>>,
}

impl FontDirectoryWatcher {
    /// Start watching a directory recursively for font file additions/removals
    pub fn watch<P: AsRef<Path>>(dir: P) -> Result<Self, String> {
        let path = dir.as_ref().to_path_buf();
        let (tx, rx) = channel::<FontChangeEvent>();
        let (notify_tx, notify_rx) = channel();

        let mut watcher = RecommendedWatcher::new(notify_tx, Config::default())
            .map_err(|e| format!("Failed to initialize watcher: {}", e))?;

        watcher
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch directory {:?}: {}", path, e))?;

        // Background thread with event debouncing
        thread::spawn(move || {
            let mut last_event_time = Instant::now();
            let debounce_window = Duration::from_millis(500);

            while let Ok(res) = notify_rx.recv() {
                if let Ok(event) = res {
                    if let Some(font_event) = Self::filter_event(event) {
                        if last_event_time.elapsed() >= debounce_window {
                            let _ = tx.send(font_event);
                            last_event_time = Instant::now();
                        }
                    }
                }
            }
        });

        Ok(Self {
            _watcher: watcher,
            event_receiver: Arc::new(Mutex::new(rx)),
        })
    }

    /// Try to read pending events non-blockingly
    pub fn poll_events(&self) -> Vec<FontChangeEvent> {
        let mut events = Vec::new();
        if let Ok(rx) = self.event_receiver.lock() {
            while let Ok(evt) = rx.try_recv() {
                events.push(evt);
            }
        }
        events
    }

    /// Convert raw notify Event into FontChangeEvent if it's a valid font file
    fn filter_event(event: Event) -> Option<FontChangeEvent> {
        let is_font_file = |p: &Path| -> bool {
            if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let e = ext.to_lowercase();
                e == "ttf" || e == "otf" || e == "woff" || e == "woff2" || e == "ttc"
            } else {
                false
            }
        };

        let first_path = event.paths.first()?.clone();
        if !is_font_file(&first_path) {
            return None;
        }

        match event.kind {
            EventKind::Create(_) => Some(FontChangeEvent::Added(first_path)),
            EventKind::Modify(_) => Some(FontChangeEvent::Modified(first_path)),
            EventKind::Remove(_) => Some(FontChangeEvent::Removed(first_path)),
            _ => None,
        }
    }
}

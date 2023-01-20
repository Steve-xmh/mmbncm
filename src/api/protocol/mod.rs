use crate::http::{URLRequest, URLResponse};

mod app;
mod fs;
mod internal;

pub const REGISTERED_API: &[(&str, fn(&str, URLRequest) -> URLResponse)] = &[
    ("/fs/read_dir", fs::read_dir),
    ("/fs/read_file_text", fs::read_file_text),
    ("/fs/read_file", fs::read_file),
    ("/fs/mkdir", fs::mkdir),
    ("/fs/exists", fs::exists),
    ("/fs/remove", fs::remove),
    ("/internal/framework.css", internal::get_framework_css),
    ("/app/reload_plugin", app::reload_plugin),
    ("/app/version", app::version),
];

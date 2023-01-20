use path_absolutize::Absolutize;

use crate::{
    http::{URLRequest, URLResponse},
    utils::decode_url,
};

pub fn read_dir(path: &str, req: URLRequest) -> URLResponse {
    let mut entries = Vec::new();
    let path = decode_url(path.trim_start_matches("?path="));

    if let Ok(read_dir) = std::fs::read_dir(path) {
        for entry in read_dir.flatten() {
            if let Ok(path) = entry.path().absolutize() {
                entries.push(path.to_string_lossy().to_string());
            }
        }
    }

    req.make_res().with_data_json(entries)
}

pub fn exists(path: &str, req: URLRequest) -> URLResponse {
    let path = decode_url(path.trim_start_matches("?path="));

    req.make_res()
        .with_data_json(std::path::Path::new(&path).exists())
}

pub fn read_file_text(path: &str, req: URLRequest) -> URLResponse {
    let path = decode_url(path.trim_start_matches("?path="));

    let data = std::fs::read_to_string(path).unwrap_or_default();

    req.make_res().with_data_string(&data)
}

pub fn read_file(path: &str, req: URLRequest) -> URLResponse {
    let path = decode_url(path.trim_start_matches("?path="));

    let data = std::fs::read(path).unwrap_or_default();

    req.make_res().with_data(&data)
}

pub fn remove(path: &str, req: URLRequest) -> URLResponse {
    let path = decode_url(path.trim_start_matches("?path="));

    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_dir_all(&path);

    req.make_res()
}

pub fn mkdir(path: &str, req: URLRequest) -> URLResponse {
    let path = decode_url(path.trim_start_matches("?path="));

    let result = std::fs::create_dir_all(path).is_ok();

    req.make_res().with_data_json(result)
}

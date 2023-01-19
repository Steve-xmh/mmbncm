use crate::http::{URLRequest, URLResponse};

pub fn version(_path: &str, req: URLRequest) -> URLResponse {
    req.make_res().with_data_string("macOS")
}

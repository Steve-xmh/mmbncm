use crate::http::{URLRequest, URLResponse};

pub fn get_framework_css(_: &str, req: URLRequest) -> URLResponse {
    let framework_css = include_str!(concat!(env!("OUT_DIR"), "/index.css"));
    req.make_res().with_data_string(framework_css)
}

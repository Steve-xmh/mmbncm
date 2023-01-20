use crate::{
    http::{URLRequest, URLResponse},
    plugins::unzip_plugins,
};

pub fn version(_path: &str, req: URLRequest) -> URLResponse {
    req.make_res().with_data_string("1.0.0")
}

pub fn reload_plugin(_path: &str, req: URLRequest) -> URLResponse {
    // 删除所有 plugins_runtime 的文件

    let _ = std::fs::remove_dir_all("./plugins_runtime");
    unzip_plugins();

    req.make_res()
}

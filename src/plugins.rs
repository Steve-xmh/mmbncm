use crate::nslog;

use crate::utils::unzip_file;

#[derive(serde::Deserialize)]
struct PluginManifest {
    name: String,
}

pub fn init_plugins() {
    let _ = std::fs::create_dir_all("./plugins");
    let _ = std::fs::create_dir_all("./plugins_runtime");
    if let Ok(betterncm_dir) = std::env::current_dir() {
        let plugin_market_path = betterncm_dir.join("plugins_runtime/PluginMarket");
        if !plugin_market_path.is_dir() {
            nslog!("插件商店文件夹不存在，正在重新解压覆盖");
            crate::utils::unzip_data(include_bytes!("./PluginMarket.plugin"), plugin_market_path);
        }
    }
}

pub fn unzip_plugins() {
    init_plugins();
    if let Ok(plugins) = std::fs::read_dir("./plugins") {
        for plugin in plugins.flatten() {
            if let Ok(meta) = plugin.metadata() {
                if meta.is_file() && plugin.file_name().to_string_lossy().ends_with(".plugin") {
                    if let Ok(zip_file) = std::fs::File::open(plugin.path()) {
                        if let Ok(mut zip_file) = zip::ZipArchive::new(zip_file) {
                            if let Ok(manifest) = zip_file.by_name("manifest.json") {
                                if let Ok(manifest) =
                                    serde_json::from_reader::<_, PluginManifest>(manifest)
                                {
                                    let unzip_dir = std::path::Path::new("./plugins_runtime")
                                        .join(manifest.name.as_str());
                                    unzip_file(plugin.path(), unzip_dir);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

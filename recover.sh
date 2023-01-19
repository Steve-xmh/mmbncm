
app_name="NeteaseMusic"
app_path="/Applications/${app_name}.app"
shell_path="$(dirname "$0")"
framework_name="ThisIsMyMacNCM"
app_bundle_path="${app_path}/Contents/MacOS"
app_executable_path="${app_bundle_path}/${app_name}"
app_executable_backup_path="${app_executable_path}_backup"
framework_path="${app_bundle_path}/${framework_name}.framework"

cp "$app_executable_backup_path" "$app_executable_path"
rm "$app_executable_backup_path"
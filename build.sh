# ThisIsMyMacNCM.framework

framework_name="ThisIsMyMacNCM"
app_name="NeteaseMusic"
app_path="/Applications/${app_name}.app"
code_cert="my-new-cert"
shell_path="$(dirname "$0")"
app_bundle_path="${app_path}/Contents/MacOS"
app_executable_path="${app_bundle_path}/${app_name}"
app_executable_backup_path="${app_executable_path}_backup"
framework_path="${app_path}/Contents/Frameworks/${framework_name}.framework"

if [ $1 == "--debug" ]
then
    echo "WARNING: You are using debug mode!"
    BUILD_ARGS=""
    JS_BUILD_CMD="build:dev"
else
    BUILD_ARGS="--release"
    JS_BUILD_CMD="build"
fi

echo "Building JS Framework"
cd ./js-framework
yarn ${JS_BUILD_CMD}
cd ..
echo "Building ARM binary"
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cargo +nightly build ${BUILD_ARGS} --target aarch64-apple-darwin
echo "Building X86_64 binary"
cargo +nightly build ${BUILD_ARGS} --target x86_64-apple-darwin

if [ ! -f "$app_executable_backup_path" ] || [ -n "$1" -a "$1" = "--force" ]
then
cp "$app_executable_path" "$app_executable_backup_path"
fi

if [ ! -w "$app_path" ]
then
echo -e "\n\nSudo password: "
sudo chown -R $(whoami) "$app_path"
fi

mkdir -p "${framework_path}/Resources"

if [ $1 == "--debug" ]
then
    lipo -create -output "${shell_path}/target/${framework_name}.dylib" \
        "${shell_path}/target/aarch64-apple-darwin/debug/libthis_is_my_mac_ncm.dylib" \
        "${shell_path}/target/x86_64-apple-darwin/debug/libthis_is_my_mac_ncm.dylib"
else
    lipo -create -output "${shell_path}/target/${framework_name}.dylib" \
        "${shell_path}/target/aarch64-apple-darwin/release/libthis_is_my_mac_ncm.dylib" \
        "${shell_path}/target/x86_64-apple-darwin/release/libthis_is_my_mac_ncm.dylib"
fi

cp "${shell_path}/target/${framework_name}.dylib" "${framework_path}/${framework_name}"
codesign --remove-signature "${app_path}"
cp "${shell_path}/Info.plist" "${framework_path}/Resources/Info.plist"
${shell_path}/insert_dylib --strip-codesig --all-yes "${framework_path}/${framework_name}" "$app_executable_backup_path" "$app_executable_path"
# cp "${shell_path}/target/aarch64-apple-darwin/debug/libthis_is_my_mac_ncm.d" "${framework_path}/${framework_name}.d"
codesign --entitlements entitlements.xml -s - -f "${framework_path}"
codesign --entitlements entitlements.xml -s - -f "${app_path}"
defaults write com.netease.163music WebKitDeveloperExtras 1
defaults write com.apple.Safari IncludeInternalDebugMenu 1
if [ $1 == "--debug" ]
then
  "$app_executable_path"
fi

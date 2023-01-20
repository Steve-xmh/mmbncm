fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let mut cmd = std::process::Command::new("yarn");
    let cmd = cmd
        .arg("esbuild")
        .arg("./src/index.ts")
        .arg("--bundle")
        // .arg("--external:./node_modules/*")
        .arg("--target=safari11")
        .arg("--banner:js=/*INSERT_CONSTS_HERE*/")
        .arg(format!("--metafile={}/metafile.json", out_dir))
        .arg(format!("--outdir={}", out_dir));
    let profile = std::env::var("PROFILE").unwrap();
    match profile.as_str() {
        "debug" => {
            cmd.arg("--sourcemap=inline");
        }
        "release" => {
            cmd.arg("--minify");
        }
        _ => {}
    }
    assert_eq!(
        cmd.current_dir("js-framework").status().unwrap().code(),
        Some(0)
    );
    let metafile = json::from(std::fs::read(format!("{}/metafile.json", out_dir)).unwrap());
    for (k, _v) in metafile["inputs"].entries() {
        println!("cargo:rerun-if-changed=./js-framework/{}", k);
    }
}

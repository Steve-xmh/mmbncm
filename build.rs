fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();
    assert_eq!(
        std::process::Command::new("yarn")
            .arg("esbuild")
            .arg("./src/index.ts")
            .arg("--bundle")
            .arg("--sourcemap=inline")
            .arg("--external:./node_modules/*")
            .arg("--target=safari11")
            .arg("--banner:js=/*INSERT_CONSTS_HERE*/")
            .arg(format!("--metafile={}/metafile.json", out_dir))
            .arg(format!("--outdir={}", out_dir))
            .current_dir("js-framework")
            .status()
            .unwrap()
            .code(),
        Some(0)
    );
    let metafile = json::from(std::fs::read(format!("{}/metafile.json", out_dir)).unwrap());
    for (k, _v) in metafile["inputs"].entries() {
        println!("cargo:rerun-if-changed=./js-framework/{}", k);
    }
}

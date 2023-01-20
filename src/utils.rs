use std::{collections::HashMap, path::Path};

use rust_macios::objective_c_runtime::{runtime::*, *};

pub type DynResult<R = ()> = anyhow::Result<R>;

pub trait NSObjectUtils {
    fn is_kind_of_class(&self, cls: &Class) -> bool;
    fn ensure_kind_of_class(&self, cls: &Class) -> DynResult {
        if self.is_kind_of_class(cls) {
            Ok(())
        } else {
            anyhow::bail!("类型不符合 {}", cls.name())
        }
    }
}

impl NSObjectUtils for id {
    fn is_kind_of_class(&self, cls: &Class) -> bool {
        unsafe {
            let is_dict: BOOL = msg_send![*self, isKindOfClass: cls];
            is_dict == YES
        }
    }
}

pub fn decode_url(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    url_escape::decode_to_string(input, &mut output);
    output
}

pub fn decode_url_data(input: &str) -> Vec<u8> {
    let mut output = Vec::with_capacity(input.len());
    url_escape::decode_to_vec(input, &mut output);
    output
}

pub fn unzip_inner(f: impl std::io::Read + std::io::Seek, unzip_dir: impl AsRef<Path>) {
    if let Ok(mut zipfile) = zip::ZipArchive::new(f) {
        for i in 0..zipfile.len() {
            if let Ok(mut entry) = zipfile.by_index(i) {
                let extract_path = unzip_dir.as_ref().join(entry.name());
                let mut extract_dir = extract_path.to_owned();
                extract_dir.pop();
                let _ = std::fs::create_dir_all(extract_dir);
                if let Ok(mut dest) = std::fs::OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .create(true)
                    .open(extract_path)
                {
                    let _ = std::io::copy(&mut entry, &mut dest);
                }
            }
        }
    }
}

pub fn unzip_file(file_path: impl AsRef<Path>, unzip_dir: impl AsRef<Path>) {
    if let Ok(file) = std::fs::File::open(file_path) {
        unzip_inner(file, unzip_dir);
    }
}

pub fn unzip_data(data: impl AsRef<[u8]>, unzip_dir: impl AsRef<Path>) {
    unzip_inner(std::io::Cursor::new(data.as_ref()), unzip_dir);
}

pub fn parse_query_value(input: &str) -> HashMap<String, String> {
    let start = if let Some(start) = input.find('?') {
        start
    } else {
        0
    };

    let splited = &input[start..];
    let mut result = HashMap::with_capacity(splited.split('&').count() + 1);

    for query in splited.split('&') {
        if let Some((key, value)) = query.split_once('=') {
            result.insert(key.to_owned(), decode_url(value));
        }
    }

    result
}

use base64::Engine;

pub fn decode_base64(input: &str) -> String {
    let data = base64::engine::general_purpose::GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        base64::engine::general_purpose::GeneralPurposeConfig::new(),
    )
    .decode(dbg!(input))
    .unwrap_or_default();
    String::from_utf8(data).unwrap_or_default()
}

pub fn decode_url(input: &str) -> String {
    urlencoding::decode(input).unwrap_or_default().to_string()
}

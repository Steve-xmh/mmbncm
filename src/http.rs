use core::ffi::{c_long, c_ulong, c_void};
use std::collections::HashMap;

use rust_macios::{
    foundation::{NSData, NSString},
    objective_c_runtime::{traits::ToId, *},
};
use serde::Serialize;

pub struct URLRequest(id);

impl URLRequest {
    pub unsafe fn from_id(v: id) -> Self {
        Self(v)
    }

    pub fn body(&self) -> &[u8] {
        unsafe {
            let http_body: id = msg_send![self.0, HTTPBody];
            let len: c_ulong = msg_send![http_body, length];
            let data: *mut c_void = msg_send![http_body, data];
            core::slice::from_raw_parts(data as _, len as _)
        }
    }

    pub fn make_res(&self) -> URLResponse {
        unsafe {
            let url: id = msg_send![self.0, URL];
            URLResponse::from_url_id(url)
        }
    }
}

pub struct URLResponse {
    url: id,
    status_code: c_long,
    headers: HashMap<&'static str, String>,
    data: id,
}

impl URLResponse {
    pub unsafe fn from_url_id(v: id) -> Self {
        Self {
            url: v,
            status_code: 200,
            headers: HashMap::with_capacity(16),
            data: nil,
        }
    }

    pub fn with_status(mut self, code: u16) -> Self {
        self.status_code = code as _;
        self
    }

    pub fn set_header(&mut self, header: &'static str, value: &str) {
        self.headers.insert(header, value.to_owned());
    }

    pub fn with_data(mut self, v: &[u8]) -> Self {
        unsafe {
            if !self.data.is_null() {
                let _: () = msg_send![self.data, release];
            }
            self.set_header("Content-Type", "application/octet-stream");
            self.data = NSData::data_with_bytes_length(v.as_ptr() as _, v.len() as _).to_id();
        }
        self
    }

    pub fn with_data_string(mut self, v: &str) -> Self {
        unsafe {
            if !self.data.is_null() {
                let _: () = msg_send![self.data, release];
            }
            self.set_header("Content-Type", "text/plain");
            let v = NSString::from(v).to_id();
            self.data = msg_send![v, dataUsingEncoding: 4];
        }
        self
    }

    pub fn with_data_json(mut self, v: impl Serialize) -> Self {
        if let Ok(data) = serde_json::to_string(&v) {
            self.set_header("Content-Type", "application/json");
            self.with_data_string(data.as_str())
        } else {
            self
        }
    }

    pub unsafe fn build_to_ids(self) -> (id, id) {
        unsafe {
            let res: id = msg_send![class!(NSHTTPURLResponse), alloc];
            let http_version = NSString::from("HTTP/1.1").to_id();
            let res: id = msg_send![res,
                initWithURL: self.url
                statusCode: self.status_code
                HTTPVersion: http_version
                headerFields: nil
            ];
            if self.data.is_null() {
                let v: id = msg_send![class!(NSHTTPURLResponse), localizedStringForStatusCode: self.status_code];
                let data: id = msg_send![v, dataUsingEncoding: 4];
                (res, data)
            } else {
                (res, self.data)
            }
        }
    }
}

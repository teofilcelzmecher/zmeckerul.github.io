// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.

import Foundation
import WebKit

/// Serves Budgie's own screens, built into the app (www/), at budgie://app/. The page has an address of its own, so
/// it keeps its sign-in and settings, may use the camera and microphone for calls, and talks to Budgie's server like
/// the website does (the server lets budgie://app in).
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "budgie"

    private let root = Bundle.main.url(forResource: "www", withExtension: nil)?.standardizedFileURL

    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json", "txt": "text/plain; charset=utf-8",
        "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
        "webp": "image/webp", "ico": "image/x-icon", "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf",
        "wasm": "application/wasm", "mp3": "audio/mpeg", "mp4": "video/mp4", "webm": "video/webm",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let root else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // only what's inside www/
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            let missing = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain; charset=utf-8"])!
            task.didReceive(missing)
            task.didReceive(Data("Not found".utf8))
            task.didFinish()
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "text/plain; charset=utf-8"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache",
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

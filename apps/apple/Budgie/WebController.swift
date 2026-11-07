// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// One window's Budgie: a web view showing the app's own screens from budgie://app/, and the messages between them
// and the device (native/native.js on the page's side, `handle` here).

import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@MainActor
final class WebController: NSObject, ObservableObject {
    @Published var title = "Budgie"
    @Published private(set) var place = "#/"
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published var captcha: CaptchaRequest?
    private(set) var isReady = false
    private(set) var dark = false

    let webView: WKWebView
    /// opens a new window (set by the window, which has SwiftUI's openWindow)
    var openWindow: ((Route) -> Void)?

    private let start: String
    private var watchers: [NSKeyValueObservation] = []
    private var keyObserver: NSObjectProtocol?
    private var downloads: [ObjectIdentifier: URL] = [:]

    init(route: Route) {
        start = route.hash
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "Budgie/\(Build.version)"
        config.preferences.isElementFullscreenEnabled = true
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.dataDetectorTypes = []
        #endif
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: WebController.boot(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = content
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        content.addScriptMessageHandler(BridgeRelay(self), contentWorld: .page, name: "budgie")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = Build.debug
        #if os(iOS)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        #endif
        paint(dark: Brand.systemIsDark, color: Brand.background(dark: Brand.systemIsDark))
        watchers = [
            webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoBack = view.canGoBack }
            },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoForward = view.canGoForward }
            },
        ]
        Router.shared.add(self)
        watchKeyWindow()
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html\(start)")!))
    }

    /// what the page knows before anything else runs: that it's the Apple app, and on what
    private static func boot() -> String {
        var apple: [String: Any] = [
            "platform": Build.platform, "idiom": Build.idiom, "push": true, "sandbox": Build.sandbox,
            "debug": false, "version": Build.version,
        ]
        var seed = "null"
        #if DEBUG
        // the build machine's checks start the app signed in to a test server: -BudgieAPI url -BudgieToken token
        let defaults = UserDefaults.standard
        if let api = defaults.string(forKey: "BudgieAPI") {
            let start: [String: Any] = ["api": api, "token": defaults.string(forKey: "BudgieToken") ?? "", "quiet": defaults.bool(forKey: "BudgieQuiet")]
            seed = JSON.string(start)
        }
        apple["debug"] = defaults.string(forKey: "BudgieDiagnostics") != nil
        #endif
        return """
        window.BUDGIE_APPLE = \(JSON.string(apple));
        (function (s) {
          if (!s) return;
          try {
            if (s.api) localStorage.setItem('nook-api', s.api);
            if (s.token && !localStorage.getItem('nook-token')) localStorage.setItem('nook-token', s.token);
            localStorage.setItem('nook-storage-ok', '1');
            if (s.quiet) localStorage.setItem('nook-push-asked', '1');
          } catch (e) {}
        })(\(seed));
        """
    }

    // MARK: what the window, the menus and the router ask for

    func go(_ hash: String) {
        guard hash.hasPrefix("#/") else { return }
        send("go", ["hash": hash])
    }

    func action(_ name: String) { send("action", ["name": name]) }

    func back() {
        if webView.canGoBack { webView.goBack() } else { action("back") }
    }

    func forward() {
        if webView.canGoForward { webView.goForward() } else { action("forward") }
    }

    func reload() { webView.reload() }

    func zoom(_ step: Int) {
        webView.pageZoom = step == 0 ? 1 : min(3, max(0.5, webView.pageZoom + CGFloat(step) * 0.1))
    }

    /// something for the page: BudgieApple.receive(kind, data)
    func send(_ kind: String, _ data: [String: Any] = [:]) {
        webView.callAsyncJavaScript(
            "return window.BudgieApple ? BudgieApple.receive(kind, data) : false",
            arguments: ["kind": kind, "data": data],
            in: nil,
            in: .page,
            completionHandler: nil
        )
    }

    /// the window opens a place in a new window, where the device has more than one; here, otherwise
    func newWindow(_ hash: String) {
        #if os(iOS)
        guard UIApplication.shared.supportsMultipleScenes, let open = openWindow else { return go(hash) }
        #else
        guard let open = openWindow else { return go(hash) }
        #endif
        open(Route(hash))
    }

    /// light or dark: the status bar, the window, the sheets and what shows past the page's edges
    func paint(dark: Bool, color: PlatformColor) {
        self.dark = dark
        #if os(iOS)
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.underPageBackgroundColor = color
        webView.window?.overrideUserInterfaceStyle = dark ? .dark : .light
        #else
        webView.underPageBackgroundColor = color
        webView.window?.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        webView.window?.backgroundColor = color
        #endif
    }

    /// the window in front is the one notifications and Siri open things in
    private func watchKeyWindow() {
        #if os(iOS)
        let name = UIWindow.didBecomeKeyNotification
        #else
        let name = NSWindow.didBecomeKeyNotification
        #endif
        keyObserver = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
            let window = note.object as AnyObject?
            Task { @MainActor in
                guard let self, let window, window === self.webView.window else { return }
                Router.shared.front = self
                self.paint(dark: self.dark, color: Brand.background(dark: self.dark))
            }
        }
    }

    // MARK: messages from the page

    func handle(_ type: String, _ body: [String: Any]) async -> Any? {
        switch type {
        case "ready":
            isReady = true
            if let pending = Router.shared.takePending() { go(pending) }
            return nil
        case "haptic":
            Haptics.play(body["pattern"] as? [Double] ?? [])
        case "share":
            return await Platform.share(from: webView, title: body["title"] as? String ?? "", text: body["text"] as? String ?? "", url: body["url"] as? String ?? "")
        case "open":
            if let link = body["url"] as? String, let url = URL(string: link) { Platform.open(url, from: webView) }
        case "window":
            if let hash = body["hash"] as? String { newWindow(hash) }
        case "theme":
            let dark = body["dark"] as? Bool ?? false
            paint(dark: dark, color: Brand.color(hex: body["color"] as? String ?? "") ?? Brand.background(dark: dark))
        case "badge":
            Push.shared.setBadge(body["count"] as? Int ?? 0)
        case "route":
            place = Route.clean(body["hash"] as? String ?? "#/")
            title = (body["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Budgie"
        case "session":
            Keychain.saveSession(token: body["token"] as? String ?? "", api: body["api"] as? String ?? "")
        case "push":
            switch body["action"] as? String {
            case "status":
                let permission = await Push.shared.status()
                if permission == "granted" { Push.shared.register() }
                return ["permission": permission]
            case "ask":
                return ["granted": await Push.shared.ask()]
            case "register":
                Push.shared.register()
                if Push.shared.token != nil { send("pushToken", Push.shared.tokenInfo) }
                return true
            default:
                return nil
            }
        case "captcha":
            return await askCaptcha(sitekey: body["sitekey"] as? String ?? "", dark: dark)
        case "debug":
            Diagnostics.write(body["info"], window: self)
        default:
            break
        }
        return nil
    }

    /// Cloudflare's robot check, on budgiesocial.com, in a sheet over the app; its one-time answer goes back to the
    /// sign-up form
    private func askCaptcha(sitekey: String, dark: Bool) async -> [String: Any] {
        guard sitekey.range(of: "^[A-Za-z0-9_-]{10,100}$", options: .regularExpression) != nil else { return ["error": "key"] }
        return await withCheckedContinuation { (done: CheckedContinuation<[String: Any], Never>) in
            captcha = CaptchaRequest(sitekey: sitekey, dark: dark) { answer, error in
                if let answer { done.resume(returning: ["answer": answer]) } else { done.resume(returning: ["error": error ?? "cancelled"]) }
            }
        }
    }
}

/// The page's messages, passed on to their window without the page keeping the window alive.
@MainActor
final class BridgeRelay: NSObject, WKScriptMessageHandlerWithReply {
    private weak var owner: WebController?

    init(_ owner: WebController) {
        self.owner = owner
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        // only Budgie's own page, never a frame inside it
        guard let owner, message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == BundleSchemeHandler.scheme,
              let body = message.body as? [String: Any], let type = body["type"] as? String
        else { return (nil, nil) }
        return (await owner.handle(type, body), nil)
    }
}

// MARK: where the page may go

extension WebController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { return decisionHandler(.download) }
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.cancel) }
        if [BundleSchemeHandler.scheme, "about", "blob", "data"].contains(scheme) { return decisionHandler(.allow) }
        // a frame inside the page (a video's player, say): as the page wants
        if let frame = navigationAction.targetFrame, !frame.isMainFrame { return decisionHandler(.allow) }
        decisionHandler(.cancel)
        // the page itself never leaves Budgie: budgiesocial.com's pages are here already; other sites open in Safari
        if scheme == "https", let host = url.host?.lowercased(), host == "budgiesocial.com" || host == "www.budgiesocial.com", url.path.isEmpty || url.path == "/" {
            go(url.fragment.map { "#" + $0 } ?? "#/")
        } else {
            Platform.open(url, from: webView)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isReady = false
        webView.reload()
    }
}

// MARK: windows, the camera and microphone, and the page's own questions

extension WebController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if url.scheme == BundleSchemeHandler.scheme {
                newWindow(url.fragment.map { "#" + $0 } ?? "#/")
            } else {
                Platform.open(url, from: webView)
            }
        }
        return nil
    }

    // calls: Budgie's own page may use the camera and microphone (the system asks the person first)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == BundleSchemeHandler.scheme ? .grant : .deny)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        Platform.alert(message, confirm: false, from: webView) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        Platform.alert(message, confirm: true, from: webView, done: completionHandler)
    }

    #if os(macOS)
    // a picture or video for a post or a chat, from the Mac's files
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        if let window = webView.window {
            panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }
    #endif
}

// MARK: downloads (your data, from Settings → Account): to Files, or wherever you save them on a Mac

extension WebController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(suggestedFilename.isEmpty ? "budgie-download" : suggestedFilename)
        downloads[ObjectIdentifier(download)] = file
        return file
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        Platform.export(file, from: webView)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }
}

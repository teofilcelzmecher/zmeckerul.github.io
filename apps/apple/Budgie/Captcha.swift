// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// The robot check on the sign-up form. Cloudflare Turnstile only runs on addresses it knows, and the app's own
// (budgie://app) isn't one, so the check opens from budgiesocial.com (captcha.html) in a sheet over the app, and its
// one-time answer comes back to the form. Nothing is kept: the sheet's page has no cookies or storage of its own.

import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

struct CaptchaRequest: Identifiable {
    let id = UUID()
    let sitekey: String
    let dark: Bool
    let finish: Once<(String?, String?)>

    init(sitekey: String, dark: Bool, finish: @escaping (String?, String?) -> Void) {
        self.sitekey = sitekey
        self.dark = dark
        self.finish = Once { finish($0.0, $0.1) }
    }
}

struct CaptchaSheet: View {
    let request: CaptchaRequest
    @StateObject private var page: CaptchaPage
    @Environment(\.dismiss) private var dismiss

    init(request: CaptchaRequest) {
        self.request = request
        _page = StateObject(wrappedValue: CaptchaPage(request: request))
    }

    var body: some View {
        NavigationStack {
            HostedWebView(webView: page.webView)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Robot check")
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            request.finish((nil, "cancelled"))
                            dismiss()
                        }
                    }
                }
        }
        .onAppear {
            page.passed = { answer in
                request.finish((answer, nil))
                dismiss()
            }
        }
        .onDisappear { request.finish((nil, "cancelled")) }
        .preferredColorScheme(request.dark ? .dark : .light)
        #if os(macOS)
        .frame(width: 440, height: 540)
        #else
        .presentationDetents([.medium, .large])
        #endif
    }
}

@MainActor
final class CaptchaPage: NSObject, ObservableObject {
    let webView: WKWebView
    var passed: ((String) -> Void)?

    init(request: CaptchaRequest) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.configuration.userContentController.add(CaptchaRelay(self), name: "budgieCaptcha")
        webView.navigationDelegate = self
        var address = URLComponents(string: "https://budgiesocial.com/captcha.html")!
        address.queryItems = [URLQueryItem(name: "k", value: request.sitekey), URLQueryItem(name: "theme", value: request.dark ? "dark" : "light")]
        webView.load(URLRequest(url: address.url!))
    }

    func heard(_ message: WKScriptMessage) {
        // only budgiesocial.com's page, never a frame inside it
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "budgiesocial.com",
              let body = message.body as? [String: Any], let answer = body["answer"] as? String, !answer.isEmpty
        else { return }
        passed?(answer)
    }
}

extension CaptchaPage: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        // the check's own frames, and budgiesocial.com's page; a link (Cloudflare's privacy page, say) opens outside
        if navigationAction.targetFrame?.isMainFrame == false || url.host == "budgiesocial.com" { return decisionHandler(.allow) }
        decisionHandler(.cancel)
        #if os(iOS)
        UIApplication.shared.open(url)
        #else
        NSWorkspace.shared.open(url)
        #endif
    }
}

/// the page's message, without the page keeping the sheet alive
@MainActor
private final class CaptchaRelay: NSObject, WKScriptMessageHandler {
    private weak var page: CaptchaPage?

    init(_ page: CaptchaPage) {
        self.page = page
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        page?.heard(message)
    }
}

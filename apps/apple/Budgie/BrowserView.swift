// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.

import SwiftUI
import WebKit

/// One window: Budgie's screens, edge to edge (the page itself keeps clear of the notch, the Dynamic Island, the
/// home indicator and iPhone Duo's camera), with the robot check's sheet, Handoff and the fold.
struct BrowserView: View {
    @StateObject private var web: WebController
    @Environment(\.openWindow) private var openWindow
    @Environment(\.scenePhase) private var phase

    init(route: Route) {
        _web = StateObject(wrappedValue: WebController(route: route))
    }

    var body: some View {
        HostedWebView(webView: web.webView)
            .ignoresSafeArea()
            .modifier(FoldWatcher(web: web))
            .sheet(item: $web.captcha) { request in
                CaptchaSheet(request: request)
            }
            .focusedSceneObject(web)
            .navigationTitle(web.title)
            // Handoff: what's open here can be picked up on another iPhone, iPad or Mac (or in a browser there)
            .userActivity(Handoff.type, element: web.place) { hash, activity in
                Handoff.describe(activity, hash: hash, title: web.title)
            }
            .onContinueUserActivity(Handoff.type) { activity in
                if let hash = activity.userInfo?["hash"] as? String { web.go(hash) }
            }
            .onAppear {
                web.openWindow = { route in openWindow(value: route) }
            }
            .onChange(of: phase) { _, now in
                guard now == .active else { return }
                if Router.shared.front == nil { Router.shared.front = web }
                web.send("resume")
            }
        #if os(macOS)
            .frame(minWidth: 420, minHeight: 520)
            .toolbar {
                ToolbarItemGroup(placement: .navigation) {
                    Button { web.back() } label: { Label("Back", systemImage: "chevron.backward") }
                        .disabled(!web.canGoBack)
                        .help("Back")
                    Button { web.forward() } label: { Label("Forward", systemImage: "chevron.forward") }
                        .disabled(!web.canGoForward)
                        .help("Forward")
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { web.action("search") } label: { Label("Search", systemImage: "magnifyingglass") }
                        .help("Search")
                    Button { web.action("new-post") } label: { Label("New Post", systemImage: "square.and.pencil") }
                        .help("New Post")
                }
            }
        #endif
    }
}

/// a web view in SwiftUI
#if os(iOS)
struct HostedWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#else
struct HostedWebView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif

/// Handoff: the place, and the same place on budgiesocial.com for a device without the app
enum Handoff {
    static let type = "com.budgiesocial.app.view"

    static func describe(_ activity: NSUserActivity, hash: String, title: String) {
        activity.title = title
        activity.userInfo = ["hash": hash]
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = false
        activity.webpageURL = URL(string: "https://budgiesocial.com/" + hash)
    }
}

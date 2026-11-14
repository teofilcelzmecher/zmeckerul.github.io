// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.

import Foundation

/// A place in Budgie (a page of the app, like #/messages/wren), for one window.
struct Route: Codable, Hashable {
    var hash: String
    var id: UUID

    init(_ hash: String = "#/") {
        self.hash = Route.clean(hash)
        id = UUID()
    }

    /// only the app's own pages
    static func clean(_ hash: String) -> String {
        hash.hasPrefix("#/") ? hash : "#/"
    }
}

/// Where notification taps, Home Screen quick actions, Siri, the Dock and Handoff send Budgie: the window in front,
/// or the first one to open.
@MainActor
final class Router {
    static let shared = Router()

    private let windows = NSHashTable<WebController>.weakObjects()
    weak var front: WebController?
    private var pending: String?

    var all: [WebController] { windows.allObjects }

    func add(_ web: WebController) {
        windows.add(web)
        if front == nil { front = web }
    }

    /// opens a place in Budgie
    func open(_ hash: String) {
        guard hash.hasPrefix("#/") else { return }
        if let web = front ?? all.first, web.isReady {
            web.go(hash)
        } else {
            pending = hash
        }
    }

    /// what was asked for before any window was ready
    func takePending() -> String? {
        defer { pending = nil }
        return pending
    }

    /// something every window's page should hear
    func broadcast(_ kind: String, _ data: [String: Any] = [:]) {
        for web in all { web.send(kind, data) }
    }
}

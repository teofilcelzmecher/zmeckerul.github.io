// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// Budgie for iPhone, iPhone Duo, iPad and Mac: one app for all four, the same on each, at home on each.
// Budgie's own screens (built from the website into www/, served at budgie://app/) in a web view, with the
// device's own notifications, haptics, share sheet, windows, menus, Siri, Handoff and fold around them.

import SwiftUI

@main
struct BudgieApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #else
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif

    var body: some Scene {
        // each window is a place in Budgie; iPad, Mac and iPhone Duo open can have several
        WindowGroup(for: Route.self) { $route in
            BrowserView(route: route)
        } defaultValue: {
            Route()
        }
        .commands { BudgieCommands() }
        #if os(macOS)
        .defaultSize(width: 1180, height: 820)
        .windowToolbarStyle(.unified(showsTitle: true))
        #endif
    }
}

// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// What the system tells the app as a whole: it started, here's the device's notification token, and (iPhone and
// iPad) a Home Screen quick action was chosen, or (Mac) something was picked from the Dock's menu.

import Foundation
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// the Home Screen's quick actions (Info.plist) and the Dock's menu, and where each goes
enum QuickActions {
    static let places: [String: String] = [
        "com.budgiesocial.app.new-post": "#/submit",
        "com.budgiesocial.app.chats": "#/messages",
        "com.budgiesocial.app.inbox": "#/inbox",
        "com.budgiesocial.app.search": "#/search",
    ]

    @MainActor static func run(_ type: String) {
        if let hash = places[type] { Router.shared.open(hash) }
    }
}

#if os(iOS)
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Push.shared.setup()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Push.shared.registered(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        // opened from a quick action
        if let item = options.shortcutItem { QuickActions.run(item.type) }
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

@MainActor
final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    // a quick action while Budgie was already running
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        QuickActions.run(shortcutItem.type)
        completionHandler(true)
    }
}
#else
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        Push.shared.setup()
    }

    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Push.shared.registered(deviceToken)
    }

    func application(_ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

    // Budgie keeps running with no window open, like Messages, so notifications and the Dock still work
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        for (title, type) in [
            (String(localized: "New Post"), "com.budgiesocial.app.new-post"),
            (String(localized: "Chats"), "com.budgiesocial.app.chats"),
            (String(localized: "Inbox"), "com.budgiesocial.app.inbox"),
        ] {
            let item = NSMenuItem(title: title, action: #selector(dock(_:)), keyEquivalent: "")
            item.representedObject = type
            item.target = self
            menu.addItem(item)
        }
        return menu
    }

    @objc private func dock(_ item: NSMenuItem) {
        guard let type = item.representedObject as? String else { return }
        NSApplication.shared.activate(ignoringOtherApps: true)
        QuickActions.run(type)
    }
}
#endif

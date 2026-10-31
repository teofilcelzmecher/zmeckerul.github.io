// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// Notifications, straight from Apple's Push Notification service: messages (reply right from the notification),
// calls (answer), and replies and the rest of the inbox. The server sends them; the page tells it where to, with the
// device's token from here.

import Foundation
import UserNotifications
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@MainActor
final class Push: NSObject {
    static let shared = Push()

    /// this device's address for notifications, from Apple
    private(set) var token: String?

    var tokenInfo: [String: Any] {
        ["token": token ?? "", "platform": Build.platform, "sandbox": Build.sandbox]
    }

    /// at launch: what a notification can do, and the token again if notifications are on
    func setup() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let reply = UNTextInputNotificationAction(
            identifier: "REPLY", title: String(localized: "Reply"), options: [],
            textInputButtonTitle: String(localized: "Send"), textInputPlaceholder: String(localized: "Message")
        )
        let answer = UNNotificationAction(identifier: "ANSWER", title: String(localized: "Answer"), options: [.foreground])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: "MESSAGE", actions: [reply], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "CALL", actions: [answer], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "ACTIVITY", actions: [], intentIdentifiers: [], options: []),
        ])
        Task {
            if await status() == "granted" { register() }
        }
    }

    func status() async -> String {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: return "prompt"
        case .denied: return "denied"
        default: return "granted"
        }
    }

    /// the system's question, after the page's own (which says what for)
    func ask() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { register() }
        return granted
    }

    func register() {
        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #else
        NSApplication.shared.registerForRemoteNotifications()
        #endif
    }

    func registered(_ deviceToken: Data) {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Router.shared.broadcast("pushToken", tokenInfo)
    }

    /// the number on the app's icon (or the Mac's Dock): unread messages and inbox
    func setBadge(_ count: Int) {
        #if os(iOS)
        UNUserNotificationCenter.current().setBadgeCount(max(0, count)) { _ in }
        #else
        NSApplication.shared.dockTile.badgeLabel = count > 0 ? String(count) : nil
        #endif
    }
}

extension Push: UNUserNotificationCenterDelegate {
    // while Budgie is open, the page shows what's new itself: a ringing call, or the chat that's open, needs no banner
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let info = notification.request.content.userInfo
        let href = info["href"] as? String
        let kind = info["kind"] as? String
        Task { @MainActor in
            Router.shared.broadcast("sync")
            let open = href != nil && Router.shared.front?.place == href
            completionHandler(kind == "call" || open ? [] : [.banner, .list, .sound])
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let href = response.notification.request.content.userInfo["href"] as? String ?? "#/inbox"
        if response.actionIdentifier == "REPLY", let text = (response as? UNTextInputNotificationResponse)?.userText {
            Task {
                await Reply.send(text, to: href)
                completionHandler()
            }
            return
        }
        Task { @MainActor in
            Router.shared.open(href)
            completionHandler()
        }
    }
}

/// A reply typed into a message's notification, sent to Budgie's server without opening the app, with the sign-in
/// the app keeps in the Keychain.
enum Reply {
    static func send(_ text: String, to href: String) async {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty, let session = Keychain.session(), !session.token.isEmpty else { return }
        var path = ""
        var body: [String: Any] = ["body": words]
        if href.hasPrefix("#/messages/g/") {
            let id = String(href.dropFirst("#/messages/g/".count))
            guard Int(id) != nil else { return }
            path = "/api/groups/\(id)/messages"
        } else if href.hasPrefix("#/messages/") {
            let name = String(href.dropFirst("#/messages/".count)).removingPercentEncoding ?? ""
            guard name.range(of: "^[A-Za-z0-9_]{1,40}$", options: .regularExpression) != nil else { return }
            path = "/api/messages"
            body["to"] = name
        } else {
            return
        }
        guard let url = URL(string: session.api + path), url.scheme == "https" || url.host == "127.0.0.1" else { return }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + session.token, forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        #if os(iOS)
        let task = await UIApplication.shared.beginBackgroundTask(withName: "Reply", expirationHandler: nil)
        #endif
        let result = try? await URLSession.shared.data(for: request)
        let sent = (result?.1 as? HTTPURLResponse)?.statusCode == 200
        #if os(iOS)
        await UIApplication.shared.endBackgroundTask(task)
        #endif
        guard !sent else { return }
        // it didn't go: say so, and tapping it opens the chat to try again
        let note = UNMutableNotificationContent()
        note.title = String(localized: "Your reply didn’t send")
        note.body = String(localized: "Open the chat to try again.")
        note.userInfo = ["href": href]
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: note, trigger: nil))
    }
}

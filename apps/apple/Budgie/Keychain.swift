// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.

import Foundation
import Security

/// The sign-in, kept in the Keychain on this device only, so a reply typed into a notification can be sent while
/// Budgie is closed. Signing out in the app removes it.
enum Keychain {
    private static let service = "com.budgiesocial.app.session"
    private static let account = "session"

    private static var base: [String: Any] {
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        #if os(macOS)
        query[kSecUseDataProtectionKeychain as String] = true
        #endif
        return query
    }

    static func saveSession(token: String, api: String) {
        SecItemDelete(base as CFDictionary)
        guard !token.isEmpty, let data = try? JSONSerialization.data(withJSONObject: ["token": token, "api": api]) else { return }
        var item = base
        item[kSecValueData as String] = data
        // readable once the device has been unlocked after starting, so a reply works from the Lock Screen
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func session() -> (token: String, api: String)? {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess, let data = found as? Data,
              let saved = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
              let token = saved["token"], let api = saved["api"]
        else { return nil }
        return (token, api.hasSuffix("/") ? String(api.dropLast()) : api)
    }
}

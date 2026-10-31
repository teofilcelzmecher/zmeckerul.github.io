// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.

import Foundation
import SwiftUI
#if os(iOS)
import UIKit
typealias PlatformColor = UIColor
#else
import AppKit
typealias PlatformColor = NSColor
#endif

/// how this copy of the app was built, and what it runs on
enum Build {
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.2.0"
    #if DEBUG
    static let debug = true
    /// a build from Xcode gets its notifications through Apple's test service; TestFlight and the App Store don't
    static let sandbox = true
    #else
    static let debug = false
    static let sandbox = false
    #endif
    #if os(iOS)
    static let platform = "ios"
    @MainActor static var idiom: String { UIDevice.current.userInterfaceIdiom == .pad ? "pad" : "phone" }
    #else
    static let platform = "macos"
    @MainActor static var idiom: String { "mac" }
    #endif
}

/// Budgie's colours, for what shows before and around the page
enum Brand {
    static func background(dark: Bool) -> PlatformColor {
        dark ? rgb(0x14, 0x12, 0x18) : rgb(0xFD, 0xF7, 0xFF)
    }

    static func color(hex: String) -> PlatformColor? {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = Int(digits, radix: 16) else { return nil }
        return rgb((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)
    }

    private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> PlatformColor {
        PlatformColor(red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: 1)
    }

    @MainActor static var systemIsDark: Bool {
        #if os(iOS)
        UITraitCollection.current.userInterfaceStyle == .dark
        #else
        NSApp?.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        #endif
    }
}

enum JSON {
    static func string(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value) else { return "null" }
        return String(data: data, encoding: .utf8) ?? "null"
    }
}

/// a callback that runs at most once
final class Once<T> {
    private var done = false
    private let action: (T) -> Void
    init(_ action: @escaping (T) -> Void) { self.action = action }
    func callAsFunction(_ value: T) {
        guard !done else { return }
        done = true
        action(value)
    }
}

/// For the build machine's checks only (debug builds started with -BudgieDiagnostics): what the page reported,
/// written where the check can read it.
enum Diagnostics {
    @MainActor static func write(_ info: Any?, window web: WebController) {
        #if DEBUG
        guard let target = UserDefaults.standard.string(forKey: "BudgieDiagnostics"), var report = info as? [String: Any] else { return }
        var native: [String: Any] = ["platform": Build.platform, "idiom": Build.idiom, "version": Build.version]
        #if os(iOS)
        native["multipleScenes"] = UIApplication.shared.supportsMultipleScenes
        #endif
        #if BUDGIE_HINGE
        native["hinge"] = true
        #else
        native["hinge"] = false
        #endif
        native["windowTitle"] = web.title
        report["native"] = native
        guard let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) else { return }
        let file = target.hasPrefix("/")
            ? URL(fileURLWithPath: target)
            : FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("budgie-diagnostics.json")
        try? data.write(to: file)
        #endif
    }
}

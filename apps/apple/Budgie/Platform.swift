// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// The device's own ways of doing things: Safari over the app for other sites, the share sheet, alerts, saving a
// file, and haptics.

import Foundation
#if os(iOS)
import UIKit
import SafariServices
import AudioToolbox
import CoreHaptics
#else
import AppKit
#endif

@MainActor
enum Platform {
    /// what to share: the link, and the words that go with it
    private static func items(title: String, text: String, url: String) -> [Any] {
        var items: [Any] = []
        let words = text.isEmpty ? title : text
        if !words.isEmpty { items.append(words) }
        if let link = URL(string: url), !url.isEmpty, !words.contains(url) { items.append(link) }
        return items
    }

    #if os(iOS)
    private static func top(_ view: UIView) -> UIViewController? {
        var controller = view.window?.rootViewController
        while let shown = controller?.presentedViewController { controller = shown }
        return controller
    }

    /// another site: in Safari, over the app (mail and phone links go to their apps)
    static func open(_ url: URL, from view: UIView) {
        if ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let controller = top(view) {
            let safari = SFSafariViewController(url: url)
            safari.dismissButtonStyle = .close
            controller.present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }

    static func share(from view: UIView, title: String, text: String, url: String) async -> Bool {
        await share(from: view, items: items(title: title, text: text, url: url))
    }

    static func share(from view: UIView, items: [Any]) async -> Bool {
        guard !items.isEmpty, let controller = top(view) else { return false }
        return await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            let finish = Once<Bool> { done.resume(returning: $0) }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, completed, _, _ in finish(completed) }
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = view
                popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            controller.present(sheet, animated: true)
        }
    }

    static func alert(_ message: String, confirm: Bool, from view: UIView, done: @escaping (Bool) -> Void) {
        guard let controller = top(view) else { return done(false) }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        if confirm { alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel) { _ in done(false) }) }
        alert.addAction(UIAlertAction(title: String(localized: "OK"), style: .default) { _ in done(true) })
        controller.present(alert, animated: true)
    }

    /// a downloaded file: the share sheet, which can save it to Files
    static func export(_ file: URL, from view: UIView) {
        Task { _ = await share(from: view, items: [file]) }
    }
    #else
    /// another site: in the Mac's browser
    static func open(_ url: URL, from view: NSView) {
        NSWorkspace.shared.open(url)
    }

    static func share(from view: NSView, title: String, text: String, url: String) async -> Bool {
        let shared = items(title: title, text: text, url: url)
        guard !shared.isEmpty else { return false }
        let picker = NSSharingServicePicker(items: shared)
        var point = NSPoint(x: view.bounds.midX, y: view.bounds.midY)
        if let window = view.window { point = view.convert(window.mouseLocationOutsideOfEventStream, from: nil) }
        picker.show(relativeTo: NSRect(origin: point, size: NSSize(width: 1, height: 1)), of: view, preferredEdge: .minY)
        return true
    }

    static func alert(_ message: String, confirm: Bool, from view: NSView, done: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: String(localized: "OK"))
        if confirm { alert.addButton(withTitle: String(localized: "Cancel")) }
        if let window = view.window {
            alert.beginSheetModal(for: window) { done($0 == .alertFirstButtonReturn) }
        } else {
            done(alert.runModal() == .alertFirstButtonReturn)
        }
    }

    /// a downloaded file: wherever you choose to save it
    static func export(_ file: URL, from view: NSView) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = file.lastPathComponent
        let save: (NSApplication.ModalResponse) -> Void = { result in
            guard result == .OK, let target = panel.url else { return }
            try? FileManager.default.removeItem(at: target)
            try? FileManager.default.moveItem(at: file, to: target)
        }
        if let window = view.window { panel.beginSheetModal(for: window, completionHandler: save) } else { save(panel.runModal()) }
    }
    #endif
}

/// The app asks for buzzes in milliseconds, as a browser would: short ones become taps of rising strength, a pattern
/// its taps in time, and anything long a real vibration. (A Mac taps its Force Touch trackpad, lightly.)
@MainActor
enum Haptics {
    static func play(_ pattern: [Double]) {
        var at = 0.0
        for (index, ms) in pattern.prefix(40).enumerated() {
            if index % 2 == 0, ms > 0 {
                let delay = at
                Task { @MainActor in
                    if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000)) }
                    tap(ms)
                }
            }
            at += ms
        }
    }

    // ---- 1.8: feels -------------------------------------------------------------------------------------------
    // The page describes each moment's feel as taps (how hard and how sharp, 0 to 1) and buzzes (a vibration that
    // lasts, rising or falling) at times in milliseconds. An iPhone plays it with Core Haptics as it is; a device
    // without it (an iPad) taps each tap at its strength; a Mac taps its trackpad for the taps.

    #if os(iOS)
    private static let rich = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private static var engine: CHHapticEngine?

    /// the Taptic Engine, started the first time it's needed; it sleeps when idle and wakes for the next feel
    private static func taptic() -> CHHapticEngine? {
        guard rich else { return nil }
        if let engine { return engine }
        guard let made = try? CHHapticEngine() else { return nil }
        made.playsHapticsOnly = true
        made.isAutoShutdownEnabled = true
        // the system reset it (another app took the hardware, say): it's made again next time
        made.resetHandler = { Task { @MainActor in Haptics.engine = nil } }
        engine = made
        return made
    }
    #endif

    static func play(events: [[String: Any]]) {
        let list = Array(events.prefix(48))
        let num = { (e: [String: Any], key: String, fallback: Double) -> Double in (e[key] as? NSNumber)?.doubleValue ?? fallback }
        #if os(iOS)
        if let engine = taptic() {
            var parts: [CHHapticEvent] = []
            var curves: [CHHapticParameterCurve] = []
            for e in list {
                let at = num(e, "t", 0) / 1000
                let strength = CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(min(1, max(0, num(e, "i", 0.5)))))
                let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(min(1, max(0, num(e, "s", 0.5)))))
                if (e["k"] as? String) == "buzz" {
                    let length = max(0.02, num(e, "d", 100) / 1000)
                    parts.append(CHHapticEvent(eventType: .hapticContinuous, parameters: [strength, sharpness], relativeTime: at, duration: length))
                    // a buzz that rises from almost nothing, or falls away to nothing
                    switch e["r"] as? String {
                    case "rise":
                        curves.append(CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [.init(relativeTime: 0, value: 0.15), .init(relativeTime: length, value: 1)], relativeTime: at))
                    case "fall":
                        curves.append(CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [.init(relativeTime: 0, value: 1), .init(relativeTime: length, value: 0)], relativeTime: at))
                    default:
                        break
                    }
                } else {
                    parts.append(CHHapticEvent(eventType: .hapticTransient, parameters: [strength, sharpness], relativeTime: at))
                }
            }
            do {
                let pattern = try CHHapticPattern(events: parts, parameterCurves: curves)
                try engine.start()
                try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
                return
            } catch {
                Haptics.engine = nil
            }
        }
        // no Core Haptics here: each tap at its strength (sharp ones rigid, dull ones soft), each buzz a heavy tap
        for e in list {
            let at = num(e, "t", 0)
            let strength = num(e, "i", 0.5)
            let sharpness = num(e, "s", 0.5)
            let buzz = (e["k"] as? String) == "buzz"
            Task { @MainActor in
                if at > 0 { try? await Task.sleep(nanoseconds: UInt64(at * 1_000_000)) }
                let style: UIImpactFeedbackGenerator.FeedbackStyle = buzz ? .heavy : sharpness >= 0.75 ? .rigid : sharpness <= 0.3 ? .soft : strength >= 0.75 ? .heavy : strength >= 0.45 ? .medium : .light
                UIImpactFeedbackGenerator(style: style).impactOccurred(intensity: CGFloat(min(1, max(0.1, strength))))
            }
        }
        #else
        for e in list where (e["k"] as? String) != "buzz" {
            let at = num(e, "t", 0)
            let sharpness = num(e, "s", 0.5)
            Task { @MainActor in
                if at > 0 { try? await Task.sleep(nanoseconds: UInt64(at * 1_000_000)) }
                NSHapticFeedbackManager.defaultPerformer.perform(sharpness >= 0.6 ? .alignment : .levelChange, performanceTime: .now)
            }
        }
        #endif
    }

    private static func tap(_ ms: Double) {
        #if os(iOS)
        if ms > 30 {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            return
        }
        let generator = UIImpactFeedbackGenerator(style: ms <= 6 ? .light : ms <= 10 ? .medium : .heavy)
        generator.impactOccurred()
        #else
        NSHapticFeedbackManager.defaultPerformer.perform(ms <= 10 ? .alignment : .levelChange, performanceTime: .now)
        #endif
    }
}

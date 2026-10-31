// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// The device's own ways of doing things: Safari over the app for other sites, the share sheet, alerts, saving a
// file, and haptics.

import Foundation
#if os(iOS)
import UIKit
import SafariServices
import AudioToolbox
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

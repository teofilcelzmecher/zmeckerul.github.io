// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// The menu bar (Mac, and iPad with a keyboard or iPadOS's menu bar) and the keyboard shortcuts held under ⌘.

import SwiftUI

struct BudgieCommands: Commands {
    @FocusedObject private var web: WebController?

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Post") { web?.action("new-post") }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(web == nil)
            NewWindowButton()
        }
        CommandGroup(replacing: .appSettings) {
            Button("Settings…") { web?.go("#/settings") }
                .keyboardShortcut(",", modifiers: .command)
                .disabled(web == nil)
        }
        CommandGroup(after: .toolbar) {
            Button("Reload") { web?.reload() }
                .keyboardShortcut("r", modifiers: .command)
            Divider()
            Button("Actual Size") { web?.zoom(0) }
                .keyboardShortcut("0", modifiers: .command)
            Button("Zoom In") { web?.zoom(1) }
                .keyboardShortcut("+", modifiers: .command)
            Button("Zoom Out") { web?.zoom(-1) }
                .keyboardShortcut("-", modifiers: .command)
        }
        CommandMenu("Go") {
            Button("Home") { web?.go("#/") }
                .keyboardShortcut("1", modifiers: .command)
            Button("Explore") { web?.go("#/explore") }
                .keyboardShortcut("2", modifiers: .command)
            Button("Chats") { web?.go("#/messages") }
                .keyboardShortcut("3", modifiers: .command)
            Button("Inbox") { web?.go("#/inbox") }
                .keyboardShortcut("4", modifiers: .command)
            Divider()
            Button("Search") { web?.action("search") }
                .keyboardShortcut("f", modifiers: .command)
            Divider()
            Button("Back") { web?.back() }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!(web?.canGoBack ?? false))
            Button("Forward") { web?.forward() }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!(web?.canGoForward ?? false))
        }
        CommandGroup(replacing: .help) {
            Link("Budgie Website", destination: URL(string: "https://budgiesocial.com/")!)
            Link("Terms of Use", destination: URL(string: "https://budgiesocial.com/terms.html")!)
            Link("Privacy Policy", destination: URL(string: "https://budgiesocial.com/privacy.html")!)
        }
    }
}

/// a new window at Home, where the device can have more than one (iPad, Mac, iPhone Duo open)
private struct NewWindowButton: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var multiple

    var body: some View {
        if multiple {
            Button("New Window") { openWindow(value: Route()) }
                .keyboardShortcut("n", modifiers: [.command, .option])
        }
    }
}

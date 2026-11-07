// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// Siri, Shortcuts, Spotlight and the Action button: "Open my chats in Budgie", "New Budgie post"…

import AppIntents

struct OpenChatsIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Chats"
    static var description = IntentDescription("Opens your chats in Budgie.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("#/messages")
        return .result()
    }
}

struct OpenInboxIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Inbox"
    static var description = IntentDescription("Opens your Budgie inbox: replies, mentions and friend requests.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("#/inbox")
        return .result()
    }
}

struct NewPostIntent: AppIntent {
    static var title: LocalizedStringResource = "New Post"
    static var description = IntentDescription("Starts a new post on Budgie.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("#/submit")
        return .result()
    }
}

struct ExploreIntent: AppIntent {
    static var title: LocalizedStringResource = "Explore Nests"
    static var description = IntentDescription("Opens Explore, to find new nests on Budgie.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("#/explore")
        return .result()
    }
}

struct BudgieShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenChatsIntent(),
            phrases: ["Open my chats in \(.applicationName)", "Show my \(.applicationName) chats"],
            shortTitle: "Chats",
            systemImageName: "bubble.left.and.bubble.right"
        )
        AppShortcut(
            intent: NewPostIntent(),
            phrases: ["New \(.applicationName) post", "Post on \(.applicationName)"],
            shortTitle: "New Post",
            systemImageName: "square.and.pencil"
        )
        AppShortcut(
            intent: OpenInboxIntent(),
            phrases: ["Open my \(.applicationName) inbox", "What's new on \(.applicationName)"],
            shortTitle: "Inbox",
            systemImageName: "bell"
        )
        AppShortcut(
            intent: ExploreIntent(),
            phrases: ["Explore \(.applicationName)", "Find nests on \(.applicationName)"],
            shortTitle: "Explore",
            systemImageName: "safari"
        )
    }
}

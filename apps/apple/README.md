# Budgie for iPhone, iPhone Duo, iPad and Mac

Budgie's Apple app, kept apart from the website and from the Android app: its own folder, its own build, one
SwiftUI app for iOS and macOS with one bundle id (`com.budgiesocial.app`), so it's one App Store listing that people
get once for all their devices. Inside it are Budgie's own screens (built from `nook/`, the same as the website, but
without ads), served from the app at `budgie://app/`; around them, the device:

| | |
|---|---|
| Notifications | Messages, group messages, calls and the inbox, straight from Apple's Push Notification service (the server sends them; no Firebase). **Reply** to a message from its notification, without opening Budgie. **Answer** a call. A ringing call is time-sensitive, so it can break through a Focus. Chats stack together. The icon's badge (and the Mac's Dock) counts what's unread. The app asks first, in words, once someone has signed in |
| Haptics | The app's buzzes become the Taptic Engine's taps (light, medium, heavy), and long ones a real vibration; a Mac's Force Touch trackpad taps lightly |
| Share, links | The share sheet (links read budgiesocial.com); other sites open in Safari over the app (on a Mac, in the browser); the Terms and Privacy Policy open from budgiesocial.com; your data download goes to Files (or wherever you save it on a Mac) |
| Windows | iPad, Mac and iPhone Duo open: several windows. ⌘-click a link, or use the link's menu, to open it in a new one |
| Menus and keys | The Mac's menu bar (and iPadOS's): New Post ⌘N, New Window ⌥⌘N, Settings ⌘,, Go → Home ⌘1, Explore ⌘2, Chats ⌘3, Inbox ⌘4, Search ⌘F, Back ⌘[, Forward ⌘], Reload ⌘R, zoom ⌘+ ⌘− ⌘0, and Help → website, Terms, Privacy Policy. On a Mac, Back, Forward, Search and New Post in the toolbar, and the Dock's menu |
| Home Screen | Touch and hold the icon: New Post, Chats, Inbox, Search |
| Siri, Shortcuts, Spotlight | "Open my chats in Budgie", "New Budgie post", "Open my Budgie inbox", "Explore Budgie" (App Shortcuts, also for the Action button) |
| Handoff | What's open on one device can be picked up on your others (or in a browser, on budgiesocial.com) |
| iPhone Duo | Budgie's screens follow the window's size: a phone's on the outside display, a tablet's with room to spread out inside, and they move between the two without starting over; Split View and several windows inside. Half open like a laptop, a call keeps the faces above the fold and the buttons below it. (Fully, with the inner display edge to edge and the hinge, once it's built with Xcode 27.1; see below) |
| Look | Liquid Glass icon (light, dark and tinted), launch screen, status bar and window following the app's light or dark colours, edge to edge around the notch, Dynamic Island and home indicator |
| Sign-up | Cloudflare's robot check only runs on addresses it knows, so in the app it opens from budgiesocial.com/captcha.html in a sheet, and hands its answer back to the form |
| Languages | The app's own words (menus, notifications, permissions, Siri) in English, Romanian, Spanish, French, German and Italian, like Budgie |

## What's where

| | |
|---|---|
| `Budgie/` | The app: `BudgieApp.swift` (windows), `WebController.swift` (a window's Budgie, and the page's messages), `Push.swift`, `Platform.swift` (share, Safari, alerts, files, haptics), `Commands.swift` (menus), `Intents.swift` (Siri), `Captcha.swift`, `Fold.swift` (iPhone Duo), `AppDelegate.swift` (quick actions, the Dock), `Keychain.swift`, the icon (`AppIcon.icon`, from Icon Composer's format), strings in six languages, the privacy manifest |
| `native/` | The page's side: `native.js` and `native.css`, loaded only in this app |
| `project.yml` | The Xcode project, for XcodeGen |
| `tools/build-www.py` | Builds the app's screens into `www/` |
| `tools/make-icons.js` | Draws the icon's layers and the launch logo |
| `tools/fix-project.py` | Makes sure Xcode reads the icon as an Icon Composer icon |
| `tools/ci-seed.js`, `tools/ci-run.sh` | The build machine's checks (below) |
| `store/` | For the App Store: [listing.md](store/listing.md) (texts, answers, and setting it all up from an iPhone) and screenshots |
| `../../.github/workflows/apple.yml` | Builds, checks and sends it to App Store Connect |

## Building it on GitHub (no Mac needed)

Every push that changes the app (or Budgie's screens) builds it on GitHub's Macs, then runs it on an iPhone, an
iPhone Duo (when the simulator has one) and an iPad in the simulator and on the Mac, signed out and signed in to a
test server, and checks that the page loaded from the app's own address, could use the camera and microphone for
calls, reached the server and had no errors. The screenshots and reports are the run's artifact
(`budgie-apple-checks-N`).

With App Store Connect's key in the repository's secrets (see [store/listing.md](store/listing.md)), it also signs the
iPhone/iPad and Mac builds and sends them to App Store Connect, for TestFlight and the App Store. The build number is
the run's number.

**iPhone Duo:** Apple gives an app built with the iOS 27.1 SDK (Xcode 27.1) the inner display edge to edge and
iPhone Duo's hinge; built with an older Xcode, it still runs there, at a familiar size. The workflow uses the newest
Xcode GitHub's Macs have that isn't a beta, and turns on the hinge code (`BUDGIE_HINGE`) by itself when that's 27.1 or
later, so the next build after GitHub adds it gets it all, with nothing to change.

## Building it on a Mac

Needs Xcode 26 or later, Python 3, Node 22 and XcodeGen (`brew install xcodegen`).

```sh
python3 apps/apple/tools/build-www.py
cd apps/apple
xcodegen generate && python3 tools/fix-project.py
open Budgie.xcodeproj
```

Pick your team in the target's Signing & Capabilities, choose an iPhone, iPad or My Mac, and run. A build from Xcode
gets its notifications through Apple's test service; TestFlight and App Store builds through the real one (the app
tells the server which).

## A new version

1. Change `MARKETING_VERSION` in `project.yml`.
2. Push. GitHub builds, checks, and sends it to App Store Connect.
3. In App Store Connect, make the new version, pick the build, and submit it for review.

Budgie's screens are inside the app, so a fix to the website reaches the app with its next update. The server is the
same for every Budgie: it lets the app's address (`budgie://app`) in, and sends Apple devices their notifications
with the key from `nook push apple`.

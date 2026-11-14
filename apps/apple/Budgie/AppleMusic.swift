// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// Budgie 1.7 on iPhone and iPad: the song the Music app is playing (for "Share what the Music app plays", in
// Settings → Activity), and a friend's song played in it (Listen along, for people without Spotify). The page asks
// for these through native.js (window.BudgieAppleMusic); iOS asks the person first ("Media & Apple Music"), the first
// time the page needs it. A Mac has no such Music player to ask: there, Budgie for your computer sees what Music plays.
import Foundation
#if os(iOS)
import MediaPlayer

@MainActor
enum AppleMusic {
    /// "on", "off" (said no, or not allowed on this device), or "ask" (not asked yet)
    static func status() -> String {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return "on"
        case .notDetermined: return "ask"
        default: return "off"
        }
    }

    /// asks the person, the first time (iOS asks only once; after that, it's iPhone Settings → Apps → Budgie)
    static func ask() async -> String {
        if MPMediaLibrary.authorizationStatus() == .notDetermined {
            _ = await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                MPMediaLibrary.requestAuthorization { _ in done.resume() }
            }
        }
        return status()
    }

    /// what the Music app has on now, playing or paused (nil for nothing, or when Budgie may not ask)
    static func now() -> [String: Any]? {
        guard MPMediaLibrary.authorizationStatus() == .authorized else { return nil }
        let player = MPMusicPlayerController.systemMusicPlayer
        guard let item = player.nowPlayingItem, let title = item.title, !title.isEmpty else { return nil }
        let length: Double = item.playbackDuration.isFinite ? max(0, item.playbackDuration) : 0
        let place: Double = player.currentPlaybackTime.isFinite ? min(max(0, player.currentPlaybackTime), length) : 0
        let playing: Bool = player.playbackState == .playing
        var song: [String: Any] = [:]
        song["playing"] = playing
        song["title"] = title
        song["artist"] = item.artist ?? ""
        song["album"] = item.albumTitle ?? ""
        song["duration"] = Int((length * 1000).rounded())
        song["position"] = Int((place * 1000).rounded())
        // its place in Apple Music's catalogue (a song only on this iPhone has none)
        let id = item.playbackStoreID
        if !id.isEmpty, id != "0", id.count <= 15, id.allSatisfy({ $0.isASCII && $0.isNumber }) { song["id"] = id }
        return song
    }

    /// a song from Apple Music's catalogue (its id, as iTunes Search gives it), from a place in it (milliseconds):
    /// ["ok": true], or ["error": "denied"] (not allowed) / "unavailable" (no Apple Music subscription, or not found)
    static func play(id: String, from ms: Double) async -> [String: Any] {
        guard !id.isEmpty, id.count <= 15, id.allSatisfy({ $0.isASCII && $0.isNumber }) else { return ["error": "unavailable"] }
        if await ask() != "on" { return ["error": "denied"] }
        let player = MPMusicPlayerController.systemMusicPlayer
        player.setQueue(with: [id])
        let ready = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            player.prepareToPlay { error in done.resume(returning: error == nil) }
        }
        guard ready else { return ["error": "unavailable"] }
        player.play()
        if ms > 1000 { player.currentPlaybackTime = ms / 1000 }
        return ["ok": true]
    }
}
#endif

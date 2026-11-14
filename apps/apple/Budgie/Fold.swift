// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
//
// iPhone Duo. Budgie's screens already follow the window's size, so they're a phone's on the outside display and a
// tablet's (side by side, with room) when it opens, and they move between the two without starting over. Here, the
// fold itself: while the phone is half open like a laptop, the page hears where the fold is, so a call keeps the
// faces above it and the buttons below. (Built with the iOS 27.1 SDK, which has iPhone Duo's hinge; the build sets
// BUDGIE_HINGE then.)

import SwiftUI

struct FoldWatcher: ViewModifier {
    let web: WebController

    func body(content: Content) -> some View {
        #if os(iOS) && BUDGIE_HINGE
        if #available(iOS 27.1, *) {
            content
                .overlay {
                    GeometryReader { proxy in
                        let folds = proxy.reservedRegions(kind: .division).filter(\.isActive).map(\.frame)
                        Color.clear
                            .onAppear { web.fold(folds.first) }
                            .onChange(of: folds) { _, now in web.fold(now.first) }
                    }
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                }
        } else {
            content
        }
        #else
        content
        #endif
    }
}

extension WebController {
    /// where the fold is, in the page's own coordinates; only a fold across the screen (the laptop pose) counts
    func fold(_ rect: CGRect?) {
        if let rect, rect.width > rect.height, rect.minY > 0 {
            send("fold", ["folded": true, "top": Double(rect.minY), "bottom": Double(max(rect.maxY, rect.minY + 1))])
        } else {
            send("fold", ["folded": false])
        }
    }
}

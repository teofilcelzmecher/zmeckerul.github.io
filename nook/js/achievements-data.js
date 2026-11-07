// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie's achievements and the rewards they unlock (1.4): read by the app, and by the server (server/achievements.js
 * and server/rewards.js read this very file), so both sides always agree.
 *
 * An achievement has up to five tiers, I to V, each needing a bigger number of something. `count` says what is
 * counted (the server works it out; nobody can just say they have it):
 *   'streak'          the best visit streak, in days
 *   'visits'          days Budgie was opened at all
 *   'posts' 'comments' 'friends' 'joins' 'nests' 'polls' 'sparks'   from Budgie's own records
 *   'visited' 'collections'   from the person's saved settings (nests visited, collections made)
 *   'set:<key>'       how many different things in a set of stats (server/stats.js): songs, artists, genres, games
 *   'minutes:<key>'   a number of minutes in stats, counted in hours (tiers are hours)
 *   'stickers'        stickers and emojis made
 * `legacy` names the badges from before 1.4 that this replaces: whoever had one keeps the tier it stood for.
 * `one` is what `desc` says when {n} is 1 ("Made your first post", not "Made 1 posts").
 *
 * A reward is something for a profile: a name effect, a font for the name, a frame round the picture, or a scene
 * behind the profile. `needs` is the tier of an achievement that unlocks it; none means everyone has it.
 */
window.NOOK_ACHIEVEMENTS = {
  tiers: ['I', 'II', 'III', 'IV', 'V'],

  families: [
    { id: 'hello', name: 'Hello, Budgie', desc: 'Opened Budgie on {n} different days', symbol: 'waving_hand', shape: 'cookie9', one: 'Opened Budgie for the first time', count: 'visits', tiers: [1, 10, 50, 150, 365], legacy: { hello: 1 } },
    { id: 'streak', name: 'On fire', desc: 'Kept a {n}-day visit streak', symbol: 'local_fire_department', shape: 'burst', count: 'streak', tiers: [3, 7, 30, 100, 365], legacy: { streak3: 1, streak7: 2 } },
    { id: 'posts', name: 'Wordsmith', desc: 'Made {n} posts', symbol: 'edit', shape: 'sunny', one: 'Made your first post', count: 'posts', tiers: [1, 10, 50, 200, 1000], legacy: { firstpost: 1 } },
    { id: 'comments', name: 'Conversationalist', desc: 'Left {n} comments', symbol: 'forum', shape: 'clover4', count: 'comments', tiers: [5, 25, 100, 500, 2000], legacy: { chatty: 1 } },
    { id: 'friends', name: 'Friendly', desc: 'Made {n} friends', symbol: 'diversity_1', shape: 'heart', one: 'Made your first friend', count: 'friends', tiers: [1, 5, 15, 30, 60], legacy: { friendly: 1 } },
    { id: 'joins', name: 'Social butterfly', desc: 'Joined {n} nests', symbol: 'diversity_3', shape: 'flower', count: 'joins', tiers: [3, 8, 15, 25, 40], legacy: { joiner: 2 } },
    { id: 'explorer', name: 'Explorer', desc: 'Visited {n} different nests', symbol: 'explore', shape: 'arch', count: 'visited', tiers: [6, 12, 20, 35, 50], legacy: { explorer: 1 } },
    { id: 'polls', name: 'Voice of the people', desc: 'Voted in {n} polls', symbol: 'how_to_vote', shape: 'pill', one: 'Voted in your first poll', count: 'polls', tiers: [1, 10, 50, 150, 500], legacy: { pollster: 1 } },
    { id: 'sparks', name: 'Sparky', desc: 'Gave {n} Sparks', symbol: 'auto_awesome', shape: 'boom', count: 'sparks', tiers: [10, 50, 250, 1000, 5000], legacy: { sparky: 1 } },
    { id: 'collections', name: 'Curator', desc: 'Made {n} collections', symbol: 'collections_bookmark', shape: 'gem', one: 'Made your first collection', count: 'collections', tiers: [1, 3, 6, 10, 20], legacy: { curator: 1 } },
    { id: 'founder', name: 'Founder', desc: 'Created {n} nests', symbol: 'castle', shape: 'softBurst', one: 'Created your first nest', count: 'nests', tiers: [1, 2, 3, 5, 10], legacy: { founder: 1 } },
    { id: 'songs', name: 'Music lover', desc: 'Listened to {n} different songs', symbol: 'music_note', shape: 'cookie12', count: 'set:music.songs', tiers: [10, 50, 250, 1000, 5000] },
    { id: 'artists', name: 'Crate digger', desc: 'Listened to {n} different artists', symbol: 'album', shape: 'cookie7', count: 'set:music.artists', tiers: [5, 25, 100, 300, 1000] },
    { id: 'genres', name: 'Genre hopper', desc: 'Listened to {n} different genres', symbol: 'queue_music', shape: 'flower', count: 'set:music.genres', tiers: [3, 8, 15, 30, 50] },
    { id: 'listening', name: 'Headphones on', desc: 'Listened for {n} hours', symbol: 'headphones', shape: 'pill', one: 'Listened for an hour', count: 'minutes:music.minutes', tiers: [1, 10, 50, 200, 1000] },
    { id: 'games', name: 'Gamer', desc: 'Played {n} different games', symbol: 'sports_esports', shape: 'pixelCircle', one: 'Played your first game', count: 'set:games.played', tiers: [1, 5, 15, 40, 100] },
    { id: 'playtime', name: 'Marathon', desc: 'Played for {n} hours', symbol: 'timer', shape: 'pixelTriangle', count: 'minutes:games.minutes', tiers: [5, 25, 100, 500, 2000] },
    { id: 'sharing', name: 'Broadcaster', desc: 'Shared your screen for {n} hours', symbol: 'present_to_all', shape: 'clover8', one: 'Shared your screen for an hour', count: 'minutes:share.minutes', tiers: [1, 5, 25, 100, 500] },
    { id: 'stickers', name: 'Sticker artist', desc: 'Made {n} stickers and emojis', symbol: 'add_reaction', shape: 'puffy', one: 'Made your first sticker or emoji', count: 'stickers', tiers: [1, 5, 15, 30, 50] },
  ],

  // what a streak earns besides its tiers: a freeze every few days (it saves the streak on a day you miss), and a
  // celebration at each milestone
  streak: { freezeEvery: 7, freezesMax: 2, milestones: [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000] },

  rewards: [
    // name effects: drawn over a name on profiles, posts and comments
    { id: 'glow', kind: 'effect', name: 'Glow', needs: null },
    { id: 'shimmer', kind: 'effect', name: 'Shimmer', needs: { family: 'streak', tier: 2 } },
    { id: 'fire', kind: 'effect', name: 'Fire', needs: { family: 'streak', tier: 3 } },
    { id: 'rainbow', kind: 'effect', name: 'Rainbow', needs: { family: 'friends', tier: 3 } },
    { id: 'neon', kind: 'effect', name: 'Neon', needs: { family: 'songs', tier: 2 } },
    { id: 'glitch', kind: 'effect', name: 'Glitch', needs: { family: 'games', tier: 3 } },
    { id: 'wave', kind: 'effect', name: 'Wave', needs: { family: 'comments', tier: 3 } },
    { id: 'sparkle', kind: 'effect', name: 'Sparkle', needs: { family: 'sparks', tier: 3 } },
    { id: 'aurora', kind: 'effect', name: 'Aurora', needs: { family: 'streak', tier: 4 } },
    { id: 'gold', kind: 'effect', name: 'Gold', needs: { family: 'streak', tier: 5 } },

    // fonts for a name, on top of the free ones from 1.0
    { id: 'arcade', kind: 'font', name: 'Arcade', needs: { family: 'games', tier: 2 } },
    { id: 'marquee', kind: 'font', name: 'Marquee', needs: { family: 'genres', tier: 2 } },
    { id: 'graffiti', kind: 'font', name: 'Graffiti', needs: { family: 'posts', tier: 3 } },
    { id: 'bubble', kind: 'font', name: 'Bubble', needs: { family: 'stickers', tier: 2 } },
    { id: 'future', kind: 'font', name: 'Future', needs: { family: 'sharing', tier: 2 } },
    { id: 'royal', kind: 'font', name: 'Royal', needs: { family: 'streak', tier: 5 } },

    // frames round a profile picture
    { id: 'ring', kind: 'frame', name: 'Ring', needs: null },
    { id: 'rainbow-ring', kind: 'frame', name: 'Rainbow ring', needs: { family: 'friends', tier: 2 } },
    { id: 'flames', kind: 'frame', name: 'Flames', needs: { family: 'streak', tier: 3 } },
    { id: 'vinyl', kind: 'frame', name: 'Vinyl', needs: { family: 'songs', tier: 3 } },
    { id: 'pixels', kind: 'frame', name: 'Pixels', needs: { family: 'games', tier: 2 } },
    { id: 'orbit', kind: 'frame', name: 'Orbit', needs: { family: 'sharing', tier: 3 } },
    { id: 'petals', kind: 'frame', name: 'Petals', needs: { family: 'comments', tier: 2 } },
    { id: 'holo', kind: 'frame', name: 'Hologram', needs: { family: 'streak', tier: 4 } },
    { id: 'crown', kind: 'frame', name: 'Crown', needs: { family: 'streak', tier: 5 } },

    // scenes that move behind a profile's header
    { id: 'bubbles', kind: 'scene', name: 'Bubbles', needs: null },
    { id: 'confetti', kind: 'scene', name: 'Confetti', needs: { family: 'posts', tier: 2 } },
    { id: 'fireflies', kind: 'scene', name: 'Fireflies', needs: { family: 'friends', tier: 3 } },
    { id: 'equalizer', kind: 'scene', name: 'Equalizer', needs: { family: 'listening', tier: 2 } },
    { id: 'pixel-rain', kind: 'scene', name: 'Pixel rain', needs: { family: 'playtime', tier: 2 } },
    { id: 'sakura', kind: 'scene', name: 'Sakura', needs: { family: 'explorer', tier: 2 } },
    { id: 'starfield', kind: 'scene', name: 'Starfield', needs: { family: 'founder', tier: 1 } },
    { id: 'northern-lights', kind: 'scene', name: 'Northern lights', needs: { family: 'streak', tier: 4 } },
    { id: 'embers', kind: 'scene', name: 'Embers', needs: { family: 'streak', tier: 5 } },
  ],
};
// the server reads this file too, where there is no window
if (typeof module !== 'undefined') module.exports = window.NOOK_ACHIEVEMENTS;

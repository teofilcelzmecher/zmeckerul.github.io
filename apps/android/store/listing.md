# Budgie on Google Play: everything to fill in

All of this can be done from an iPhone, in Safari, at https://play.google.com/console.

## Before you start

- **The developer account** costs $25, once. Google asks for the account holder's government ID and wants them to be
  18 or older, so if you're younger, a parent or guardian makes the account in their name and adds you to it
  (Play Console → Users and permissions). The developer name shown on Google Play can be "Budgie".
- **A contact email** is shown on the listing. Use one made for Budgie, not a personal one.
- **A new personal account has to test first:** a closed test with at least 12 people who opt in and keep the app
  for 14 days in a row, before Google lets you publish to everyone. Friends from Budgie can be the testers: Play
  Console gives you a link to share.
- **A Firebase project** for notifications (see "Notifications on phones" in `nook/server/README.md`).

## Store listing

**App name** (30 characters at most)

> Budgie

**Short description** (80 at most)

> Friendly little communities: nests for what you love, chats and calls.

**Full description** (4,000 at most)

> Budgie is a small, friendly place to share what you love with people who love it too.
>
> FIND YOUR NEST
> Nests are communities for one thing each: film photography, houseplants, the night sky, cosy games, home cooking and many more. Every nest has its own colour, shape, rules and team of moderators. Join the ones you like and your Home fills up with them. Or start your own.
>
> SHARE WHAT YOU LOVE
> Post photos, short videos, GIFs, polls or just words. Vote, add Sparks to what you love, talk about it in the comments and save the good stuff into collections.
>
> CHAT AND CALL
> Message your friends one to one or in group chats, with pictures, GIFs and emoji, and a colour for each chat. Call them with voice or video, with up to six people in a group call, and share your screen. Calls are encrypted between the devices in them and never recorded.
>
> MAKE IT YOURS
> Pick your colours, your shape, a font for your name, your pronouns, your interests and up to four pride flags. Light or dark, calm or lively.
>
> IN YOUR LANGUAGE
> English, Română, Español, Français, Deutsch and Italiano.
>
> KIND BY DESIGN
> Budgie is for people 13 and older. Everything posted is checked automatically, people can report anything and block anyone, and moderators look at what's reported. No email or phone number needed to join, no ads in the app, and your information is never sold.
>
> Notifications for messages, calls and replies, haptics that feel like Android, and the back button works the way you expect.
>
> Budgie is made by one independent developer. Feedback is always welcome.

**App icon:** `store/icon-512.png` · **Feature graphic:** `store/feature-graphic.png`

**Phone screenshots:** `store/screenshots/01…08`, in that order. 1 and 2 are one picture across two screenshots, and
so are 4 and 5, so keep each pair next to each other.

**Category:** Social · **Tags:** Social networking, Communities, Messaging

**Website:** https://budgiesocial.com · **Privacy policy:** https://budgiesocial.com/privacy.html

## App content (Policy → App content)

**Privacy policy:** https://budgiesocial.com/privacy.html

**App access:** "All or some functionality is restricted". Make an account for Google's reviewers on Budgie first
(for example `playreview`, with a long password), and give its username and password here, with the note:
"Sign in on the first screen (Sign in, at the bottom of the welcome page)."

**Ads:** No, the app has no ads.

**Content rating:** fill in the questionnaire with the category *Social networking, forums, blogs and
user-generated content sharing*:
- Users can interact or exchange content with each other: **Yes** (posts, comments, chats, calls)
- Users can share their location with others: **No**
- Purchases of digital goods: **No**
- Violence, sexual content, drugs, gambling, crude humour made by Budgie itself: **No**
- Moderation of what users post: **Yes** (automatic checks on the server, reports, moderators, blocking)

**Target audience:** 13–15, 16–17 and 18 and over (not under 13). "Could the app unintentionally appeal to
children?" **No**.

**News app:** No · **Government app:** No · **Financial features:** none · **Health:** none

**Account deletion:** in the app, Settings → Account → Delete account. On the web (Google asks for a link that works
without the app): https://budgiesocial.com/#/settings, sign in, then Account → Delete account. The account, its
messages, votes, friends and pictures are deleted at once and its posts and comments wiped; backups are overwritten
within 14 days; reports and moderation decisions are kept as a record for up to a year (as the Privacy Policy says).

## Data safety (Policy → App content → Data safety)

**Does the app collect or share any of the required user data types?** Yes.
**Is all of the user data encrypted in transit?** Yes.
**Do you provide a way for users to request that their data is deleted?** Yes.

Nothing is **shared** in Google's sense (Firebase only carries notifications for Budgie, as its service provider).
Everything below is **collected**, **not processed ephemerally**, and for **App functionality** (and **Account
management** for the account itself):

| Data type | Required or optional | What it is |
|---|---|---|
| Personal info → User IDs | Required | The username |
| Personal info → Other info | Optional | Pronouns, bio, interests, profile colour and shape |
| Personal info → Sexual orientation | Optional | Pride flags someone chooses to show (they can say something about it) |
| Photos and videos → Photos | Optional | Profile picture, banner, pictures in posts and chats |
| Photos and videos → Videos | Optional | Videos in posts |
| Messages → Other in-app messages | Optional | Private and group messages |
| App activity → Other user-generated content | Optional | Posts, comments, polls, nests |
| App activity → Other actions | Optional | Votes, joins, friends, blocks |
| App info and performance → none | | |
| Device or other IDs | Optional | The notification token, only if notifications are on |

Not collected: name, email, phone number, address, location, contacts, calendar, files, audio, health, financial
info, web history, crash logs, diagnostics, advertising ID. Calls are encrypted between the devices in the call and
never reach Budgie's server, so they aren't collected.

**Security practices:** encrypted in transit (HTTPS); data can be deleted (Settings → Account); the app follows the
Families policy: not applicable (13+).

## Permissions Google may ask about

| Permission | Why |
|---|---|
| Camera, microphone | Video and voice calls, only while in one, and only after Android asks |
| Notifications | Messages, calls and replies, only after the app asks |
| Vibrate | Haptics |

No photo library permission: pictures are picked with Android's own file picker.

## Releasing

1. **Test and release → Testing → Closed testing → Create track**, add testers (an email list or a Google Group),
   **Create release**, upload the `.aab` from GitHub (see `../README.md`), name it 1.1.0, and roll it out.
2. Share the test link with at least 12 testers and keep the test running for 14 days.
3. **Dashboard → Apply for production**, answer Google's questions about the test, and wait for review (often a few
   days).
4. **Production → Create release**, the same `.aab` (or a newer one), and roll out.

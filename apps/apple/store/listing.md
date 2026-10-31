# Budgie on the App Store: everything to fill in

One app for iPhone, iPhone Duo, iPad and Mac (the same bundle id, `com.budgiesocial.app`, so it's one listing and
people get it once for all their devices). All of this can be done on an iPhone: the **Apple Developer** app for
enrolling, and Safari for the rest (developer.apple.com and appstoreconnect.apple.com; use *Request Desktop Website*
if a page is too cramped).

## Before you start

- **The Apple Developer Program** costs $99 a year. Apple wants the account holder to be an adult, so if you're
  younger, a parent or guardian enrolls in their own name. On an individual account, the App Store shows the account
  holder's legal name as the seller.
- **Europe:** App Store Connect asks whether you're a *trader* (a business). If you are, your address, phone number
  and email are shown on the App Store in the EU. Read Apple's explanation there and answer honestly.

## One-time setup (about 30 minutes)

1. **The app's id.** developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers → +** → App IDs → App.
   Description *Budgie*, Bundle ID (explicit) `com.budgiesocial.app`. Tick **Push Notifications** and **Time
   Sensitive Notifications**. Register.
2. **The push key** (for the server). **Keys → +**, name *Budgie push*, tick **Apple Push Notifications service
   (APNs)**, Register, and **Download** the `AuthKey_XXXXXXXXXX.p8` file (only once). Your **Team ID** is under
   Membership details. On the laptop: `sudo nook push apple AuthKey_XXXXXXXXXX.p8 TEAM_ID` (see
   `nook/server/README.md`).
3. **The app in App Store Connect.** appstoreconnect.apple.com → **Apps → + → New App**: platforms **iOS** and
   **macOS**, name *Budgie* (if it's taken: *Budgie: Find your nest*), primary language English, bundle id
   `com.budgiesocial.app`, SKU `budgie`.
4. **A key for GitHub to send builds.** App Store Connect → **Users and Access → Integrations → App Store Connect
   API → Team Keys → +**. Name *GitHub*, access **Admin** (it lets the build machine make the signing certificates
   itself). Download the key (only once) and note its **Key ID** and the **Issuer ID** above the list.
5. **GitHub's secrets.** In the repository on github.com: Settings → Secrets and variables → Actions → New
   repository secret, four times:

   | Secret | What goes in it |
   |---|---|
   | `APPLE_TEAM_ID` | your Team ID |
   | `ASC_KEY_ID` | the App Store Connect key's Key ID |
   | `ASC_ISSUER_ID` | the Issuer ID |
   | `ASC_KEY_P8` | the whole text of the App Store Connect key's .p8 file |

6. **Build.** GitHub → Actions → **Apple app** → the newest run → **Re-run all jobs**. When it's green, the iPhone/iPad
   build and the Mac build show up in App Store Connect → TestFlight after Apple processes them (10–30 minutes).
7. **Try it.** Install **TestFlight** from the App Store on your iPhone. In App Store Connect → TestFlight, add
   yourself to an internal group: the build appears in TestFlight on your iPhone (and your Mac, if you have one).
   Friends can test it too through an external group (Apple reviews the first build, usually within a day).

## The listing (App Store Connect → the app → the version)

**Name** (30 characters at most): Budgie

**Subtitle** (30 at most): Communities, chats and calls

**Promotional text** (170 at most, can change any time):

> Small, friendly communities called nests. Share photos, chat with friends and call them in one tap, in six languages. Free, and no email needed.

**Description** (4,000 at most):

> Budgie is a small, friendly place to share what you love with people who love it too.
>
> FIND YOUR NEST
> Nests are communities for one thing each: film photography, houseplants, the night sky, cosy games, home cooking and many more. Every nest has its own colour, shape, rules and team of moderators. Join the ones you like and your Home fills up with them. Or start your own.
>
> SHARE WHAT YOU LOVE
> Post photos, short videos, GIFs, polls or just words. Vote, add Sparks to what you love, talk about it in the comments and save the good stuff into collections.
>
> CHAT AND CALL
> Message your friends one to one or in group chats, with pictures, GIFs and emoji, and a colour for each chat. Reply right from a notification. Call them with voice or video, with up to six people in a group call, and share your screen. Calls are encrypted between the devices in them and never recorded.
>
> AT HOME ON EVERY DEVICE
> On iPhone, haptics you can feel and quick actions on the Home Screen. On iPhone Duo and iPad, room to spread out, and Budgie in more than one window. On Mac, a menu bar and keyboard shortcuts for everything. Ask Siri to open your chats, and pick up where you left off on another device with Handoff.
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
> Budgie is made by one independent developer. Feedback is always welcome.

**Keywords** (100 characters at most, commas, no spaces):

> community,nests,friends,group chat,video call,photos,polls,forum,hobbies,kind,safe,share

**Support URL:** https://budgiesocial.com · **Marketing URL:** https://budgiesocial.com
**Privacy Policy URL:** https://budgiesocial.com/privacy.html

**Category:** Social Networking (secondary: Lifestyle)

**Copyright:** 2026 Budgie

**Screenshots:** in `store/screenshots/`: `iphone-*.png` (6.9-inch display, 1320×2868), `ipad-*.png` (13-inch, 2064×2752)
and `mac-*.png` (2880×1800). Upload them in their numbered order; the first three iPhone ones are what people see
in search.

## App Review information

**Sign-in required:** yes. Make an account for Apple's reviewers on Budgie first (for example `appreview`, with a long
password), make it friends with one of your accounts (so there's someone to message and call), and give its username
and password here.

**Notes:**

> Budgie is a social app with communities (nests), posts, comments, private and group chats, and voice and video calls. Its screens are part of the app (bundled HTML, CSS and JavaScript, served from inside the app); nothing is downloaded to change what the app does. Around them, the app uses the device: notifications through APNs (reply to a message from its notification, answer a call), haptics, the share sheet, multiple windows on iPad and Mac, the Mac menu bar and keyboard shortcuts, Home Screen quick actions, App Shortcuts (Siri and Spotlight), Handoff, and the iPhone Duo's fold.
>
> Sign in with the account above. To see chats and calls, open Chats and pick a friend; the phone icon starts a call.
>
> User-generated content: everyone agrees to the Terms of Use (no objectionable content, zero tolerance for abuse) when signing up; posts, comments, messages, pictures, videos and usernames are checked automatically on Budgie's server; anything can be reported (the ⋯ menu on a post, comment, message or profile); anyone can be blocked from their profile; moderators act on reports within 24 hours and can remove content and ban accounts. Accounts can be deleted in Settings → Account.
>
> The camera and microphone are only used during calls and for photos the person chooses to take.

## App Privacy (App Store Connect → the app → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

Each of these is **collected**, **linked to the person's account**, **not used for tracking**, and used for **App
Functionality** only:

| Data type | What it is |
|---|---|
| Identifiers → User ID | The username |
| Identifiers → Device ID | The notification token, only if notifications are on |
| User Content → Photos or Videos | Profile picture, banner, pictures and videos in posts and chats |
| User Content → Emails or Text Messages | Private and group messages |
| User Content → Other User Content | Posts, comments, polls, the profile's bio, pronouns, interests and pride flags |
| Sensitive Info | Pride flags someone chooses to show (they can say something about sexual orientation or gender identity) |

Not collected: name, email, phone, address, location, contacts, health, financial info, browsing or search history,
purchases, usage data, diagnostics, advertising data. Calls are encrypted between the devices in them and never
reach Budgie's server.

## Age rating

Answer the questionnaire as Budgie is: **User-generated content: Yes**, **Messaging and chat: Yes**, **Advertising:
No**, no violence, sexual content, gambling, drugs or horror made by Budgie itself, **Unrestricted web access: No**
(links to other sites open in Safari's own sheet). Budgie's Terms say 13 and older; if Apple's result is lower than
13+, set the age rating to 13+ by hand.

## Export compliance

Budgie only uses the encryption built into iOS and macOS (HTTPS, and calls'), which is exempt; the app says so itself
(`ITSAppUsesNonExemptEncryption` = NO), so App Store Connect won't ask each time.

## Sending it for review

App Store Connect → the app → **iOS App** (and **macOS App**) → the version → pick the TestFlight build, fill in the
above, **Add for Review** → **Submit**. Review usually takes a day or two. If Apple asks a question, the answer comes
in App Store Connect and by email.

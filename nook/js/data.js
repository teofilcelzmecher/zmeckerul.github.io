/*
 * Nook's seed content: the nooks (communities), the people in them, and what
 * they have been posting. Times are minutes before the page loaded, so the
 * demo always looks freshly busy. Comments nest: a = author, t = minutes ago,
 * s = score, b = body (markdown-lite), r = replies.
 */
window.NOOK_DATA = {
  communities: [
    {
      id: 'nookhq', title: 'Nook HQ', color: '#6750a4', shape: 'cookie9', symbol: 'campaign', category: 'Meta',
      tagline: 'News, tips and the occasional party from the people who run Nook.',
      description: 'The official nook for announcements, feature tours and feedback. Tell us what you would change; we read everything.',
      members: 182340, online: 1204, activity: 0.55, founded: '2024',
      rules: ['Feedback is welcome, cruelty is not', 'One idea per post makes voting fair', 'Bugs go in the weekly bug thread'],
      flairs: ['Announcement', 'Feature tour', 'Feedback', 'Bug'],
      mods: ['nook_team', 'pixel_pia'],
      events: [{ id: 'ev-hq-1', title: 'Town hall: what should Nook build next?', inMinutes: 1440 * 2 + 120, minutes: 60, symbol: 'groups', desc: 'Live Q&A with the team. Bring your wildest ideas.' }],
    },
    {
      id: 'houseplants', title: 'Plant Parenthood', color: '#3f8f4f', shape: 'clover4', symbol: 'potted_plant', category: 'Hobbies',
      tagline: 'For people whose windowsills are slowly becoming jungles.',
      description: 'Show off your green babies, ask for help when they droop, and swap cuttings with neighbours. Beginners very welcome.',
      members: 48210, online: 312, activity: 0.62, founded: '2024',
      rules: ['Be kind to beginners', 'Plant ID requests need a photo', 'No selling, swapping is fine', 'Name your pests, not your neighbours'],
      flairs: ['Show off', 'Help', 'Propagation', 'Pests', 'Plant ID'],
      mods: ['leafy_lena', 'moss_and_mist'],
      events: [
        { id: 'ev-plant-1', title: 'Cutting swap, live', inMinutes: 95, minutes: 90, symbol: 'swap_horiz', desc: 'Post what you have, claim what you want. Shipping tips pinned in the thread.' },
        { id: 'ev-plant-2', title: 'Ask a botanist (AMA)', inMinutes: 1440 * 3, minutes: 120, symbol: 'science', desc: 'u/moss_and_mist answers your weirdest root questions.' },
      ],
    },
    {
      id: 'synthwave', title: 'Synthwave', color: '#e8467c', shape: 'sunny', symbol: 'graphic_eq', category: 'Music',
      tagline: 'Neon sunsets, gated reverb and cassettes that never die.',
      description: 'Share tracks, gear, and the art that goes with them. Self-promo is fine on Fridays.',
      members: 30455, online: 418, activity: 0.81, founded: '2024',
      rules: ['Self-promo on Fridays only', 'Credit the artist', 'No AI-generated tracks without a tag'],
      flairs: ['New release', 'Gear', 'Artwork', 'Discussion'],
      mods: ['retrowave_rick'],
      events: [{ id: 'ev-synth-1', title: 'Friday listening party', inMinutes: -25, minutes: 120, symbol: 'headphones', desc: 'We play your submissions back to back. Chat in the thread.' }],
    },
    {
      id: 'homecooking', title: 'Home Cooking', color: '#ff8a3d', shape: 'cookie6', symbol: 'soup_kitchen', category: 'Food',
      tagline: 'Recipes from real kitchens with real mess.',
      description: 'Your weeknight dinners, your grandmother’s recipes, your 3am experiments. Post the recipe or it didn’t happen.',
      members: 96112, online: 640, activity: 0.7, founded: '2024',
      rules: ['Recipe or it didn’t happen', 'No food shaming', 'Mark spicy opinions as spoilers'],
      flairs: ['Recipe', 'Question', 'Fail', 'Family recipe'],
      mods: ['chef_tomasz', 'sourdough_sam'],
      events: [{ id: 'ev-cook-1', title: 'Soup Sunday cook-along', inMinutes: 1440 + 300, minutes: 90, symbol: 'ramen_dining', desc: 'Everyone makes a soup at the same time. Chaos guaranteed.' }],
    },
    {
      id: 'webdev', title: 'Web Dev', color: '#3d7bff', shape: 'pixelCircle', symbol: 'code', category: 'Tech',
      tagline: 'HTML, CSS, JS, and the endless argument about all three.',
      description: 'For people who build for the web. Show your projects, ask questions, share what you learned today.',
      members: 152077, online: 1890, activity: 0.9, founded: '2024',
      rules: ['Show your code when asking for help', 'No framework wars before coffee', 'Be patient with beginners'],
      flairs: ['Showcase', 'Question', 'TIL', 'Discussion', 'Meme'],
      mods: ['css_wizard', 'null_pointer'],
      events: [{ id: 'ev-web-1', title: 'Code review hour', inMinutes: 260, minutes: 60, symbol: 'rate_review', desc: 'Drop a link to a small project and get friendly feedback.' }],
    },
    {
      id: 'nightsky', title: 'Night Sky', color: '#4b5bd6', shape: 'verySunny', symbol: 'rocket_launch', category: 'Science',
      tagline: 'Looking up since forever.',
      description: 'Astronomy, astrophotography and space news. Whether you have a telescope or just a balcony, you belong here.',
      members: 77540, online: 503, activity: 0.48, founded: '2024',
      rules: ['Credit your photos and gear', 'No conspiracy theories', 'Spoiler-tag launch results for people watching later'],
      flairs: ['Astrophoto', 'News', 'Question', 'Gear'],
      mods: ['stargazer_ana', 'orbit_owen'],
      events: [{ id: 'ev-sky-1', title: 'Meteor shower watch party', inMinutes: 1440 * 4 + 600, minutes: 240, symbol: 'nights_stay', desc: 'Grab a blanket. We count meteors together and post our tallies.' }],
    },
    {
      id: 'cozygames', title: 'Cozy Games', color: '#8b5cf6', shape: 'ghostish', symbol: 'sports_esports', category: 'Gaming',
      tagline: 'Farming, fishing, decorating. Zero jump scares.',
      description: 'Wholesome games and the people who love them. Share your farms, your islands and your little victories.',
      members: 64988, online: 701, activity: 0.74, founded: '2024',
      rules: ['Keep it wholesome', 'Tag spoilers', 'Screenshots need context'],
      flairs: ['Screenshot', 'Recommendation', 'Discussion', 'Achievement'],
      mods: ['cozy_kit'],
      events: [{ id: 'ev-cozy-1', title: 'Co-op farm night', inMinutes: 1440 + 60, minutes: 120, symbol: 'agriculture', desc: 'Join a shared farm and help harvest. Bring snacks.' }],
    },
    {
      id: 'cycling', title: 'Two Wheels', color: '#00a6a6', shape: 'cookie12', symbol: 'directions_bike', category: 'Sports',
      tagline: 'Commuters, racers, tourers and people who just like bikes.',
      description: 'Routes, repairs, rides and rants about car parks in bike lanes.',
      members: 41207, online: 188, activity: 0.38, founded: '2024',
      rules: ['Helmet debates go in the weekly thread', 'Share routes, not private addresses', 'Be nice to new riders'],
      flairs: ['Ride report', 'Repair', 'Gear', 'Route'],
      mods: ['spoke_n_steel'],
      events: [{ id: 'ev-bike-1', title: 'Sunday slow ride (global)', inMinutes: 1440 * 5, minutes: 180, symbol: 'route', desc: 'Ride anywhere, as slowly as you like, then post a photo of your snack stop.' }],
    },
    {
      id: 'bookclub', title: 'Book Nook', color: '#b98c00', shape: 'clamShell', symbol: 'menu_book', category: 'Books',
      tagline: 'Reading together, one chapter at a time.',
      description: 'A monthly book club plus everything else book-shaped. This month: “The Left Hand of Darkness”.',
      members: 58801, online: 266, activity: 0.44, founded: '2024',
      rules: ['Spoiler-tag anything past the current chapter', 'Recommendations need a reason', 'All genres welcome'],
      flairs: ['Book club', 'Recommendation', 'Review', 'Discussion'],
      mods: ['bookworm_bea'],
      events: [{ id: 'ev-book-1', title: 'Chapters 9–12 discussion', inMinutes: 1440 * 2 + 30, minutes: 90, symbol: 'auto_stories', desc: 'Spoilers up to chapter 12 allowed in the event thread.' }],
    },
    {
      id: 'pixelart', title: 'Pixel Art', color: '#ff5252', shape: 'pixelTriangle', symbol: 'brush', category: 'Art',
      tagline: 'Every pixel placed on purpose.',
      description: 'Sprites, tilesets, animations and palettes. Critique is welcome when asked for.',
      members: 35120, online: 240, activity: 0.57, founded: '2024',
      rules: ['Original work only', 'Use the Critique flair if you want feedback', 'No tracing without credit'],
      flairs: ['OC', 'Critique', 'Tutorial', 'Palette'],
      mods: ['pixel_pia'],
      events: [{ id: 'ev-pix-1', title: 'Weekly challenge: 16×16 snacks', inMinutes: 400, minutes: 1440, symbol: 'grid_on', desc: 'Draw your favourite snack in 16×16 with 8 colours max.' }],
    },
    {
      id: 'photography', title: 'Light & Lens', color: '#5f7d95', shape: 'gem', symbol: 'photo_camera', category: 'Art',
      tagline: 'Photos, critique and the hunt for good light.',
      description: 'Share your shots and what you learned taking them. Gear talk welcome, gear snobbery less so.',
      members: 88302, online: 377, activity: 0.51, founded: '2024',
      rules: ['Post your own photos', 'Include settings if you can', 'Critique the photo, not the photographer'],
      flairs: ['Street', 'Landscape', 'Portrait', 'Critique', 'Gear'],
      mods: ['shutter_sid'],
      events: [{ id: 'ev-photo-1', title: 'Golden hour photo walk', inMinutes: 1440 * 6, minutes: 60, symbol: 'wb_twilight', desc: 'Shoot wherever you are at golden hour, post one photo.' }],
    },
    {
      id: 'travel', title: 'Wanderlust', color: '#0288d1', shape: 'arch', symbol: 'flight', category: 'Travel',
      tagline: 'Trip reports, itineraries and very specific questions about trains.',
      description: 'Plan trips, share stories, and find out which bakery in which town you absolutely cannot miss.',
      members: 70350, online: 290, activity: 0.46, founded: '2024',
      rules: ['Trip reports need at least one photo or map', 'No referral links', 'Respect locals'],
      flairs: ['Trip report', 'Itinerary', 'Question', 'Tip'],
      mods: ['wanderlust_wen'],
      events: [{ id: 'ev-travel-1', title: 'Night train AMA', inMinutes: 1440 * 3 + 200, minutes: 90, symbol: 'train', desc: 'Everything you wanted to know about sleeper trains.' }],
    },
    {
      id: 'asknook', title: 'Ask Nook', color: '#c2185b', shape: 'softBurst', symbol: 'forum', category: 'Discussion',
      tagline: 'Ask anything. Seriously, anything.',
      description: 'Open-ended questions for the whole of Nook. Answers ranked by kindness as much as cleverness.',
      members: 210400, online: 2302, activity: 0.86, founded: '2024',
      rules: ['Questions only in titles', 'No personal info', 'Serious tag means serious answers'],
      flairs: ['Serious', 'Fun', 'Poll'],
      mods: ['nook_team'],
      events: [],
    },
  ],

  users: {
    nook_team: { color: '#6750a4', shape: 'cookie9', bio: 'The people who build Nook. We read every piece of feedback.', karma: 51200, joined: 900 },
    leafy_lena: { color: '#43a047', shape: 'flower', bio: '93 plants, one tiny flat. Send help (and cuttings).', karma: 18420, joined: 700 },
    moss_and_mist: { color: '#2e7d32', shape: 'clover8', bio: 'Botanist by day, overwaterer by night.', karma: 9311, joined: 640 },
    retrowave_rick: { color: '#e91e63', shape: 'sunny', bio: 'Synths, sunsets, sunglasses at night.', karma: 22014, joined: 810 },
    neon_nadia: { color: '#ff4081', shape: 'burst', bio: 'I make cover art that glows.', karma: 6702, joined: 300 },
    chef_tomasz: { color: '#f57c00', shape: 'cookie6', bio: 'Line cook turned home cook. Butter is a personality.', karma: 30118, joined: 850 },
    sourdough_sam: { color: '#a1887f', shape: 'bun', bio: 'My starter is older than my car.', karma: 12550, joined: 720 },
    css_wizard: { color: '#3d7bff', shape: 'squircle', bio: 'I can center a div. Ask me how.', karma: 41270, joined: 880 },
    null_pointer: { color: '#455a64', shape: 'pixelCircle', bio: 'undefined is not a function and neither am I before coffee.', karma: 15402, joined: 600 },
    stargazer_ana: { color: '#3949ab', shape: 'verySunny', bio: 'Bortle 4 balcony astronomer.', karma: 20877, joined: 770 },
    orbit_owen: { color: '#5c6bc0', shape: 'circle', bio: 'Launch nerd. I will tell you about orbital mechanics.', karma: 8820, joined: 410 },
    cozy_kit: { color: '#8b5cf6', shape: 'ghostish', bio: 'Professional turnip trader.', karma: 17733, joined: 690 },
    pixel_pia: { color: '#ff5252', shape: 'pixelTriangle', bio: 'Drawing tiny things with big feelings.', karma: 25190, joined: 830 },
    spoke_n_steel: { color: '#00897b', shape: 'cookie12', bio: 'Fixing bikes in a basement since 2009.', karma: 11010, joined: 560 },
    bookworm_bea: { color: '#b98c00', shape: 'clamShell', bio: 'Currently reading three books and finishing none.', karma: 14460, joined: 750 },
    shutter_sid: { color: '#607d8b', shape: 'gem', bio: '35mm forever, but I own a digital camera too.', karma: 19004, joined: 790 },
    wanderlust_wen: { color: '#0288d1', shape: 'arch', bio: 'Slow travel, fast trains.', karma: 16630, joined: 610 },
    marmalade_max: { color: '#ffa000', shape: 'puffy', bio: 'Orange cat owner, orange food enjoyer.', karma: 4410, joined: 200 },
    quiet_quinn: { color: '#7e57c2', shape: 'heart', bio: 'Mostly lurking. Sometimes helpful.', karma: 2208, joined: 150 },
    dev_dani: { color: '#1e88e5', shape: 'diamond', bio: 'Frontend at a small studio. Accessibility nerd.', karma: 9870, joined: 380 },
    tea_and_toast: { color: '#8d6e63', shape: 'softCookie', bio: 'Earl grey, hot.', karma: 3120, joined: 260 },
    river_rae: { color: '#26a69a', shape: 'puffyDiamond', bio: 'Kayaks, bikes, anything near water.', karma: 5530, joined: 340 },
    sunny_side: { color: '#fbc02d', shape: 'sunny', bio: 'Breakfast for dinner advocate.', karma: 7720, joined: 420 },
    grandma_ioana: { color: '#c62828', shape: 'flower', bio: 'Recipes from Cluj, translated with love by my grandson.', karma: 12890, joined: 330 },
  },

  posts: [
    {
      id: 'welcome', n: 'nookhq', author: 'nook_team', age: 60 * 26, pinned: true, flair: 'Feature tour',
      title: 'Welcome to Nook! Here’s what makes it different',
      body:
        'Hi and welcome! Nook is a home for communities (we call them **nooks**). If you have used forums before, a lot will feel familiar: join nooks, post, vote, comment. But we added a few things we always wanted:\n\n' +
        '- **Every nook has its own colour and shape.** Visit one and the whole app re-themes itself. In mixed feeds each post is tinted by the nook it came from.\n' +
        '- **Sparks.** Votes say *more of this*; Sparks say *how it made you feel*. Love, Insightful, Funny, Fire and Wow.\n' +
        '- **Highlights.** Long threads get a *Catch me up* card with the best of the conversation.\n' +
        '- **Calm mode.** Hide every score and count. Just the posts. Find it in Settings.\n' +
        '- **Collections.** Save posts into named shelves, like playlists for posts.\n' +
        '- **Events and pulse.** Nooks host live events you can RSVP to, and the wavy line on each nook shows how busy it is right now.\n' +
        '- **Streaks and badges.** Come back daily, earn shapes.\n\n' +
        'Press `?` anywhere to see keyboard shortcuts. Everything you do is saved in this browser only, so go wild.\n\n' +
        'Tell us what you think in the comments!',
      score: 4210, reactions: { love: 320, insight: 88, funny: 4, fire: 150, wow: 61 },
      comments: [
        { a: 'pixel_pia', t: 60 * 25, s: 402, b: 'The nook colours are SO good. Clicking between n/pixelart and n/houseplants feels like walking between rooms.', r: [
          { a: 'nook_team', t: 60 * 24, s: 210, b: 'That was exactly the idea. Glad it comes through!' },
          { a: 'leafy_lena', t: 60 * 23, s: 96, b: 'Plant Parenthood being green is non-negotiable 🌿' },
        ] },
        { a: 'quiet_quinn', t: 60 * 22, s: 351, b: 'Calm mode is the feature I didn’t know I needed. I post way more when I can’t see numbers.', r: [
          { a: 'dev_dani', t: 60 * 20, s: 88, b: 'Same. It changes how I read threads too. I actually read the replies instead of jumping to the top one.' },
        ] },
        { a: 'null_pointer', t: 60 * 21, s: 140, b: 'Keyboard shortcuts on day one? j/k navigation? You had me at j.', r: [] },
        { a: 'cozy_kit', t: 60 * 18, s: 77, b: 'Can we get a Spark for *cozy*? Asking for a nook.', r: [
          { a: 'nook_team', t: 60 * 17, s: 64, b: 'Noted! We are keeping the set small for now, but we’re listening.' },
        ] },
      ],
    },
    {
      id: 'monstera', n: 'houseplants', author: 'leafy_lena', age: 95, flair: 'Show off', type: 'image',
      art: { from: '#a8e063', to: '#2f7d32', angle: 150, symbol: 'potted_plant', shape: 'clover8' },
      title: 'My monstera finally gave me a leaf with holes after 2 years of waiting',
      body: 'I moved her to the east window in spring and started watering only when the top 5 cm were dry. Patience pays off. She is now officially taller than my cat.',
      score: 1843, reactions: { love: 210, insight: 3, funny: 12, fire: 64, wow: 40 },
      comments: [
        { a: 'moss_and_mist', t: 80, s: 422, b: 'Fenestrations! The holes come once the plant has enough light energy to “afford” them. East window was the right call.', r: [
          { a: 'leafy_lena', t: 70, s: 160, b: 'I love that they have to *afford* them. Plant economics.' },
          { a: 'tea_and_toast', t: 66, s: 48, b: 'So that’s why mine has been sulking in the hallway. Moving it today.', r: [
            { a: 'moss_and_mist', t: 60, s: 31, b: 'Go slowly! A sudden jump to direct sun can scorch the leaves. A week near the window first.' },
          ] },
        ] },
        { a: 'marmalade_max', t: 75, s: 211, b: 'Taller than your cat is the only unit of measurement I accept now.', r: [] },
        { a: 'quiet_quinn', t: 50, s: 39, b: 'What potting mix are you using?', r: [
          { a: 'leafy_lena', t: 44, s: 52, b: 'Roughly 1/3 bark, 1/3 perlite, 1/3 regular soil, plus a handful of worm castings.' },
        ] },
        { a: 'river_rae', t: 30, s: 12, b: 'Congrats on the first window leaf 🪟', r: [] },
      ],
    },
    {
      id: 'sarmale', n: 'homecooking', author: 'grandma_ioana', age: 210, flair: 'Family recipe', type: 'image',
      art: { from: '#ffb74d', to: '#c62828', angle: 135, symbol: 'soup_kitchen', shape: 'cookie6' },
      title: 'Grandma’s sarmale (cabbage rolls) for anyone who asked last week',
      body:
        'My grandson typed this up for me. Serves a whole family plus leftovers.\n\n' +
        '- 1 large sour cabbage (pickled), leaves separated\n' +
        '- 500 g pork mince + 250 g beef mince\n' +
        '- 1 cup rice, rinsed\n' +
        '- 2 onions, finely chopped and softened in oil\n' +
        '- Smoked bacon, dill, thyme, a little tomato juice\n\n' +
        'Mix meat, rice, onion, salt, pepper and dill. Roll small, tight parcels. Layer in a pot with chopped cabbage and bacon between the layers. Cover with tomato juice and water, then cook low and slow for **3 hours**. Serve with sour cream and polenta.\n\n' +
        '> They are better the next day. Do not argue with me on this.',
      score: 2930, reactions: { love: 540, insight: 40, funny: 22, fire: 210, wow: 18 },
      comments: [
        { a: 'chef_tomasz', t: 190, s: 640, b: 'The *do not argue with me on this* is the most grandmother sentence ever written. Saving this.', r: [
          { a: 'grandma_ioana', t: 180, s: 410, b: 'Good. Make them on Saturday, eat them on Sunday.' },
        ] },
        { a: 'sourdough_sam', t: 170, s: 288, b: 'Can you do this with fresh cabbage if you can’t find sour cabbage?', r: [
          { a: 'grandma_ioana', t: 160, s: 302, b: 'Yes. Blanch the leaves and add a little sauerkraut juice or lemon to the pot. Not the same, but still good.' },
          { a: 'marmalade_max', t: 150, s: 40, b: 'The polish shop near me sells whole sour cabbages, check eastern European grocers!' },
        ] },
        { a: 'sunny_side', t: 120, s: 96, b: 'Polenta on the side is the move. Made these for my in-laws and they asked for the recipe immediately.', r: [] },
        { a: 'wanderlust_wen', t: 100, s: 71, b: 'Had these in Cluj last year at a tiny place near the botanical garden. Still dreaming about them.', r: [
          { a: 'grandma_ioana', t: 90, s: 88, b: 'Then you know. Next time come to my kitchen instead 😊' },
        ] },
        { a: 'quiet_quinn', t: 40, s: 15, b: 'Three hours?? Worth it?', r: [
          { a: 'chef_tomasz', t: 35, s: 60, b: 'Absolutely worth it. It’s mostly hands-off time.' },
        ] },
      ],
    },
    {
      id: 'starting-style', n: 'webdev', author: 'css_wizard', age: 140, flair: 'TIL', type: 'link',
      link: { url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style', domain: 'developer.mozilla.org', title: '@starting-style - CSS | MDN' },
      title: 'TIL @starting-style finally lets you animate elements in from display: none, no JS needed',
      body: 'Combine `@starting-style` with `transition-behavior: allow-discrete` and you can fade in a popover or dialog the moment it appears. I deleted 40 lines of animation JS today.',
      score: 1320, reactions: { love: 40, insight: 260, funny: 2, fire: 90, wow: 33 },
      comments: [
        { a: 'dev_dani', t: 130, s: 210, b: 'And `display` in the transition list with `allow-discrete` for exit animations. Dialogs fading out properly is *chef’s kiss*.', r: [
          { a: 'css_wizard', t: 120, s: 88, b: 'Yes! The overlay property too, for top-layer stuff.' },
        ] },
        { a: 'null_pointer', t: 110, s: 150, b: 'Me, who wrote a 200-line animation library in 2019: 🙂', r: [
          { a: 'quiet_quinn', t: 100, s: 66, b: 'It served you well. Let it rest.' },
        ] },
        { a: 'tea_and_toast', t: 70, s: 18, b: 'Browser support okay now?', r: [
          { a: 'dev_dani', t: 65, s: 40, b: 'All the evergreen browsers support it. Treat it as progressive enhancement and you’re fine.' },
        ] },
      ],
    },
    {
      id: 'cozy-poll', n: 'cozygames', author: 'cozy_kit', age: 300, flair: 'Discussion', type: 'poll',
      title: 'What’s your comfort game for the cold months?',
      body: 'It’s getting dark at 5pm. I need to know what everyone’s hiding inside with.',
      poll: { options: [['Stardew Valley', 1420], ['Animal Crossing', 980], ['A Short Hike', 510], ['Spiritfarer', 430], ['Unpacking', 260]] },
      score: 860, reactions: { love: 120, insight: 0, funny: 8, fire: 20, wow: 2 },
      comments: [
        { a: 'marmalade_max', t: 280, s: 140, b: 'Stardew every winter since 2016. My farm has seen things.', r: [] },
        { a: 'quiet_quinn', t: 260, s: 120, b: 'A Short Hike is 2 hours of pure joy and I replay it every December.', r: [
          { a: 'cozy_kit', t: 250, s: 60, b: 'The music when you reach the top 🥹' },
        ] },
        { a: 'river_rae', t: 200, s: 40, b: 'Spiritfarer made me cry in a good way. Bring tissues.', r: [] },
      ],
    },
    {
      id: 'saturn', n: 'nightsky', author: 'stargazer_ana', age: 420, flair: 'Astrophoto', type: 'image',
      art: { from: '#0d1b4c', to: '#5c6bc0', angle: 200, symbol: 'nightlight', shape: 'verySunny' },
      title: 'Saturn from my balcony with a 130 mm reflector and a phone held up to the eyepiece',
      body: 'Stacked from 900 frames. The rings are almost edge-on this year so it looks like a tiny planet with a stick through it. Seeing was great for once!',
      score: 2210, reactions: { love: 190, insight: 30, funny: 15, fire: 120, wow: 300 },
      comments: [
        { a: 'orbit_owen', t: 400, s: 320, b: 'Phone-to-eyepiece and this sharp? You have the patience of a saint.', r: [
          { a: 'stargazer_ana', t: 390, s: 140, b: 'A phone clamp from a hardware store changed my life, honestly.' },
        ] },
        { a: 'quiet_quinn', t: 360, s: 98, b: 'Planet with a stick through it is accurate and I will never unsee it.', r: [] },
        { a: 'shutter_sid', t: 300, s: 64, b: 'What did you stack with?', r: [
          { a: 'stargazer_ana', t: 280, s: 70, b: 'AutoStakkert for stacking, Registax wavelets to sharpen. Both free!' },
        ] },
      ],
    },
    {
      id: 'synth-release', n: 'synthwave', author: 'neon_nadia', age: 55, flair: 'Artwork', type: 'image',
      art: { from: '#ff6a88', to: '#3a1c71', angle: 180, symbol: 'wb_twilight', shape: 'sunny' },
      title: 'Made a cover for a friend’s EP: “Midnight on Route 9”',
      body: 'Gradient sun, chrome text, a road that goes on forever. The classics. Feedback welcome, I still think the horizon is too low.',
      score: 740, reactions: { love: 130, insight: 2, funny: 0, fire: 160, wow: 22 },
      comments: [
        { a: 'retrowave_rick', t: 50, s: 120, b: 'Horizon is fine! If anything, a little scanline over the sun would push it.', r: [
          { a: 'neon_nadia', t: 45, s: 40, b: 'Ooh scanlines. Trying it tonight.' },
        ] },
        { a: 'pixel_pia', t: 40, s: 56, b: 'The colours are gorgeous. That pink to indigo fade!', r: [] },
      ],
    },
    {
      id: 'gear-cassette', n: 'synthwave', author: 'retrowave_rick', age: 900, flair: 'Discussion',
      title: 'Unpopular opinion: cassette releases are the best merch',
      body: 'They are cheap to make, they look amazing on a shelf, and nobody plays them, which means they last forever. I have 64 and no cassette player.',
      score: 512, reactions: { love: 30, insight: 4, funny: 140, fire: 40, wow: 2 },
      comments: [
        { a: 'neon_nadia', t: 880, s: 92, b: '“nobody plays them” is the realest merch review ever.', r: [] },
        { a: 'null_pointer', t: 850, s: 60, b: 'Get a $20 walkman, it’s a whole new hobby.', r: [
          { a: 'retrowave_rick', t: 840, s: 50, b: 'Don’t tempt me.' },
        ] },
      ],
    },
    {
      id: 'bread-fail', n: 'homecooking', author: 'sourdough_sam', age: 600, flair: 'Fail', type: 'image',
      art: { from: '#d7ccc8', to: '#5d4037', angle: 160, symbol: 'bakery_dining', shape: 'bun' },
      title: 'Twelve years of sourdough and today I forgot the salt',
      body: 'It looks perfect. It tastes like a sad cloud. We persevere.',
      score: 1290, reactions: { love: 80, insight: 1, funny: 420, fire: 10, wow: 5 },
      comments: [
        { a: 'chef_tomasz', t: 580, s: 310, b: 'Toast it with salted butter and nobody will ever know.', r: [
          { a: 'sourdough_sam', t: 570, s: 120, b: 'This is the way.' },
        ] },
        { a: 'sunny_side', t: 500, s: 140, b: '“Tastes like a sad cloud” is now how I will describe all bland food.', r: [] },
        { a: 'tea_and_toast', t: 420, s: 66, b: 'Make croutons! Salt them heavily. Redemption arc.', r: [] },
      ],
    },
    {
      id: 'tabs-poll', n: 'webdev', author: 'null_pointer', age: 1300, flair: 'Discussion', type: 'poll',
      title: 'It’s 2026. Tabs or spaces? Settle it once and for all.',
      body: 'Asking for a team that has been arguing in a pull request for three days.',
      poll: { options: [['Tabs (accessible, adjustable)', 2240], ['Spaces (consistent everywhere)', 1980], ['Whatever the formatter does', 3610]] },
      score: 1504, reactions: { love: 20, insight: 60, funny: 380, fire: 120, wow: 4 },
      comments: [
        { a: 'dev_dani', t: 1280, s: 420, b: 'Tabs let people with low vision set their own indent width. That ended the argument for my team.', r: [
          { a: 'css_wizard', t: 1250, s: 190, b: 'This is the only good argument in the entire history of this debate.' },
        ] },
        { a: 'quiet_quinn', t: 1200, s: 250, b: 'Whatever the formatter does. I have a life.', r: [] },
      ],
    },
    {
      id: 'center-div', n: 'webdev', author: 'dev_dani', age: 2400, flair: 'Showcase', type: 'image',
      art: { from: '#90caf9', to: '#1a237e', angle: 120, symbol: 'grid_view', shape: 'squircle' },
      title: 'I built a tiny design system for my studio’s sites: tokens, shapes and springy buttons',
      body: 'Everything is CSS variables, so a single seed colour re-themes a whole site. The buttons squish on press and spring back. Took a month of evenings; happy to answer questions.',
      score: 980, reactions: { love: 110, insight: 120, funny: 0, fire: 70, wow: 40 },
      comments: [
        { a: 'css_wizard', t: 2300, s: 160, b: 'Springy buttons are such a small thing but they make everything feel alive. Nice work!', r: [] },
        { a: 'null_pointer', t: 2250, s: 80, b: 'How are you generating the palettes from one colour?', r: [
          { a: 'dev_dani', t: 2200, s: 90, b: 'Material colour utilities. Give it a seed, get 49 colour roles back for light and dark.' },
        ] },
      ],
    },
    {
      id: 'kit-island', n: 'cozygames', author: 'marmalade_max', age: 180, flair: 'Screenshot', type: 'image',
      art: { from: '#b9f6ca', to: '#7c4dff', angle: 140, symbol: 'cottage', shape: 'ghostish' },
      title: 'Spent the whole weekend building a tiny lakeside village for my villagers',
      body: 'Every house has a garden and every garden has a frog statue. That is the law of this island.',
      score: 1102, reactions: { love: 260, insight: 0, funny: 30, fire: 50, wow: 70 },
      comments: [
        { a: 'cozy_kit', t: 170, s: 140, b: 'The frog law is a just law.', r: [] },
        { a: 'leafy_lena', t: 150, s: 77, b: 'I need to see the gardens up close!!', r: [
          { a: 'marmalade_max', t: 140, s: 40, b: 'Close-ups coming tomorrow 🐸' },
        ] },
      ],
    },
    {
      id: 'bike-commute', n: 'cycling', author: 'spoke_n_steel', age: 360, flair: 'Ride report', type: 'image',
      art: { from: '#80deea', to: '#00695c', angle: 170, symbol: 'directions_bike', shape: 'cookie12' },
      title: 'One year of commuting by bike: 3,840 km, 2 flats, 1 very confused heron',
      body: 'Started because the bus was always late. Kept going because it’s the best part of my day. Some notes:\n\n- Good lights matter more than a fast bike\n- Fenders. Get fenders.\n- The heron lives under the second bridge. Say hi.',
      score: 1610, reactions: { love: 300, insight: 120, funny: 70, fire: 90, wow: 20 },
      comments: [
        { a: 'river_rae', t: 340, s: 200, b: 'Fenders are the most underrated upgrade in cycling. Dry back, happy commute.', r: [] },
        { a: 'quiet_quinn', t: 300, s: 140, b: 'Please give us heron updates. Weekly if possible.', r: [
          { a: 'spoke_n_steel', t: 290, s: 160, b: 'Heron is fine. Heron is judging everyone. Heron is thriving.' },
        ] },
      ],
    },
    {
      id: 'bike-chain', n: 'cycling', author: 'river_rae', age: 1600, flair: 'Repair',
      title: 'PSA: clean your chain before you lube it, not after',
      body: 'I see so many people dripping lube onto a gritty chain. You’re making grinding paste! Degrease, dry, then lube, then wipe off the excess.',
      score: 420, reactions: { love: 10, insight: 140, funny: 6, fire: 12, wow: 3 },
      comments: [
        { a: 'spoke_n_steel', t: 1580, s: 90, b: 'And wipe the excess properly. The lube goes *inside* the rollers, not on the outside.', r: [] },
      ],
    },
    {
      id: 'lefthand', n: 'bookclub', author: 'bookworm_bea', age: 500, flair: 'Book club', pinned: true,
      title: 'Book club: “The Left Hand of Darkness” chapters 5–8 discussion',
      body: 'Spoilers for chapters 5–8 only. Questions to get us started:\n\n1. How did your view of Estraven change in chapter 6?\n2. What did you make of the Foretellers?\n3. ||The journey across the ice is coming. Are you ready?||',
      score: 690, reactions: { love: 90, insight: 70, funny: 2, fire: 15, wow: 10 },
      comments: [
        { a: 'tea_and_toast', t: 480, s: 120, b: 'The Foretellers scene is one of the strangest and most beautiful things I’ve read.', r: [
          { a: 'bookworm_bea', t: 470, s: 60, b: 'Right? “The unknown is what makes life possible” lives in my head now.' },
        ] },
        { a: 'quiet_quinn', t: 400, s: 80, b: 'I misjudged Estraven so badly at first. Le Guin plays you like a fiddle.', r: [] },
      ],
    },
    {
      id: 'book-rec', n: 'bookclub', author: 'tea_and_toast', age: 2000, flair: 'Recommendation',
      title: 'Books that feel like a warm blanket? Here are mine',
      body: '- *The House in the Cerulean Sea*\n- *A Psalm for the Wild-Built*\n- *Legends & Lattes*\n- *The Hobbit*, obviously\n\nWhat are yours?',
      score: 540, reactions: { love: 120, insight: 20, funny: 0, fire: 10, wow: 0 },
      comments: [
        { a: 'cozy_kit', t: 1980, s: 90, b: '*A Psalm for the Wild-Built* is a hug in book form.', r: [] },
        { a: 'bookworm_bea', t: 1900, s: 70, b: 'Adding *Howl’s Moving Castle* to the pile!', r: [] },
      ],
    },
    {
      id: 'sprite', n: 'pixelart', author: 'pixel_pia', age: 240, flair: 'OC', type: 'image',
      art: { from: '#ff8a80', to: '#ad1457', angle: 130, symbol: 'pets', shape: 'pixelTriangle' },
      title: 'A tiny cat that naps in 4 frames',
      body: '32×32, 6 colours. The tail flick was the hardest part. Free to use as a desktop pet if anyone wants it!',
      score: 1980, reactions: { love: 480, insight: 4, funny: 30, fire: 110, wow: 60 },
      comments: [
        { a: 'marmalade_max', t: 230, s: 260, b: 'My orange cat approves. He is currently doing the same animation on my keyboard.', r: [] },
        { a: 'neon_nadia', t: 200, s: 80, b: 'The squash on the breathing frame is so good.', r: [
          { a: 'pixel_pia', t: 190, s: 44, b: 'Thank you! Two pixels of squash is all it took.' },
        ] },
      ],
    },
    {
      id: 'palette', n: 'pixelart', author: 'neon_nadia', age: 1800, flair: 'Palette',
      title: 'Share your favourite 8-colour palette (mine is “Dusk Market”)',
      body: '`#1b1029 #3b1f4f #7a2f6b #c64f6f #f08a6a #ffc98a #8fd3c5 #f7f3e8`\n\nWarm shadows, one cool accent. Works for almost everything.',
      score: 330, reactions: { love: 50, insight: 40, funny: 0, fire: 20, wow: 6 },
      comments: [
        { a: 'pixel_pia', t: 1700, s: 50, b: 'That teal accent against the warm purples is lovely.', r: [] },
      ],
    },
    {
      id: 'street', n: 'photography', author: 'shutter_sid', age: 720, flair: 'Street', type: 'image',
      art: { from: '#cfd8dc', to: '#263238', angle: 160, symbol: 'umbrella', shape: 'gem' },
      title: 'Rainy evening, one red umbrella. Waited 40 minutes for this person to walk past.',
      body: '35 mm, f/2, 1/250. Sometimes street photography is just standing in the rain looking suspicious.',
      score: 2540, reactions: { love: 300, insight: 20, funny: 60, fire: 200, wow: 140 },
      comments: [
        { a: 'stargazer_ana', t: 700, s: 180, b: '“Standing in the rain looking suspicious” is also how I’d describe astronomy.', r: [] },
        { a: 'dev_dani', t: 650, s: 70, b: 'Did you ask them afterwards?', r: [
          { a: 'shutter_sid', t: 640, s: 120, b: 'Always. She laughed and asked for a print. Sending it next week.' },
        ] },
      ],
    },
    {
      id: 'night-train', n: 'travel', author: 'wanderlust_wen', age: 820, flair: 'Trip report', type: 'image',
      art: { from: '#4fc3f7', to: '#1a237e', angle: 190, symbol: 'train', shape: 'arch' },
      title: 'Vienna → Bucharest by sleeper train. 19 hours, zero regrets.',
      body: 'Shared a cabin with a retired teacher who gave me half her sandwiches and a list of every bakery in Brașov. Woke up to mountains. Planes could never.',
      score: 1720, reactions: { love: 260, insight: 60, funny: 10, fire: 80, wow: 90 },
      comments: [
        { a: 'grandma_ioana', t: 800, s: 210, b: 'Welcome to Romania! The bakery list from a retired teacher is the most reliable guide you will ever get.', r: [] },
        { a: 'river_rae', t: 760, s: 66, b: 'How was sleeping on the train? I always worry I won’t sleep.', r: [
          { a: 'wanderlust_wen', t: 750, s: 80, b: 'Earplugs and an eye mask and I slept like a baby. The rocking helps!' },
        ] },
      ],
    },
    {
      id: 'packing', n: 'travel', author: 'river_rae', age: 3000, flair: 'Tip',
      title: 'Roll your clothes, pack a tote bag, bring a clothes peg. That’s it, that’s the tip.',
      body: 'The clothes peg closes curtains in hotels, hangs wet socks, and clips open snack bags. Best travel item under €1.',
      score: 620, reactions: { love: 30, insight: 200, funny: 40, fire: 10, wow: 30 },
      comments: [
        { a: 'wanderlust_wen', t: 2900, s: 80, b: 'The curtain trick! Every hotel has the one gap that lets in the 5am sun.', r: [] },
      ],
    },
    {
      id: 'ask-skill', n: 'asknook', author: 'quiet_quinn', age: 150, flair: 'Fun',
      title: 'What’s a small skill that made your daily life noticeably better?',
      body: '',
      score: 3310, reactions: { love: 120, insight: 410, funny: 60, fire: 40, wow: 20 },
      comments: [
        { a: 'chef_tomasz', t: 140, s: 980, b: 'Sharpening my own knives. Cooking went from a chore to a joy overnight.', r: [
          { a: 'sourdough_sam', t: 135, s: 210, b: 'A sharp knife is a safe knife, too. Fewer slips.' },
        ] },
        { a: 'dev_dani', t: 130, s: 760, b: 'Touch typing. Took two weeks of 10 minutes a day.', r: [] },
        { a: 'spoke_n_steel', t: 125, s: 540, b: 'Fixing a flat tyre. Freedom.', r: [] },
        { a: 'leafy_lena', t: 110, s: 410, b: 'Taking cuttings. I haven’t paid for a plant in two years.', r: [
          { a: 'moss_and_mist', t: 100, s: 160, b: 'And now you have 93 plants. Coincidence? I think not.' },
        ] },
        { a: 'tea_and_toast', t: 90, s: 320, b: 'Saying “let me think about it” instead of yes. Life-changing.', r: [] },
        { a: 'stargazer_ana', t: 80, s: 190, b: 'Recognising five constellations. Every walk home at night is nicer.', r: [] },
      ],
    },
    {
      id: 'ask-poll', n: 'asknook', author: 'sunny_side', age: 700, flair: 'Poll', type: 'poll',
      title: 'Breakfast for dinner: valid or chaos?',
      body: 'My partner says pancakes at 8pm is “unhinged”. I need backup.',
      poll: { options: [['Completely valid', 5120], ['Only on weekends', 1240], ['Chaos', 890]] },
      score: 1470, reactions: { love: 60, insight: 0, funny: 340, fire: 20, wow: 4 },
      comments: [
        { a: 'chef_tomasz', t: 690, s: 220, b: 'Shakshuka is breakfast. Shakshuka is dinner. Shakshuka transcends time.', r: [] },
      ],
    },
    {
      id: 'pests', n: 'houseplants', author: 'tea_and_toast', age: 460, flair: 'Help',
      title: 'Tiny white fluffy dots on my succulent. Should I panic?',
      body: 'They look like little bits of cotton wool in the gaps between leaves. They appeared last week.',
      score: 210, reactions: { love: 2, insight: 30, funny: 0, fire: 0, wow: 4 },
      comments: [
        { a: 'moss_and_mist', t: 440, s: 160, b: 'Mealybugs. Don’t panic! Dab each one with a cotton bud dipped in rubbing alcohol, isolate the plant, check every few days.', r: [
          { a: 'tea_and_toast', t: 430, s: 40, b: 'Thank you so much, on it now.' },
        ] },
        { a: 'leafy_lena', t: 420, s: 50, b: 'Check the roots too, they love hiding there.', r: [] },
      ],
    },
    {
      id: 'prop', n: 'houseplants', author: 'moss_and_mist', age: 1500, flair: 'Propagation',
      title: 'Water vs. soil propagation: I tested 20 pothos cuttings so you don’t have to',
      body: '10 in water, 10 in moist soil, same window. After 6 weeks:\n\n- Water: 10/10 rooted, but 3 sulked after potting\n- Soil: 8/10 rooted, none sulked\n\nVerdict: water is easier to watch, soil is easier on the plant. Do what makes you happy.',
      score: 1120, reactions: { love: 70, insight: 330, funny: 2, fire: 30, wow: 40 },
      comments: [
        { a: 'leafy_lena', t: 1480, s: 120, b: 'Science! In my nook! I love this.', r: [] },
      ],
    },
    {
      id: 'meteor', n: 'nightsky', author: 'orbit_owen', age: 1100, flair: 'News', type: 'link',
      link: { url: 'https://science.nasa.gov/solar-system/meteors-meteorites/', domain: 'science.nasa.gov', title: 'Meteors & Meteorites - NASA Science' },
      title: 'Reminder: the next big meteor shower is this week. Here’s how to actually see it.',
      body: 'Get away from streetlights, give your eyes 20 minutes to adjust, and look about halfway up the sky, not at the radiant. Our watch party is in the events tab!',
      score: 880, reactions: { love: 40, insight: 180, funny: 0, fire: 30, wow: 60 },
      comments: [
        { a: 'stargazer_ana', t: 1080, s: 90, b: 'And put your phone away! One glance at a bright screen and you start over.', r: [] },
      ],
    },
    {
      id: 'space-poll', n: 'nightsky', author: 'stargazer_ana', age: 2600, flair: 'Question', type: 'poll',
      title: 'If you could see one thing in the sky with your own eyes, what would it be?',
      body: '',
      poll: { options: [['A total solar eclipse', 820], ['The northern lights', 1140], ['A bright comet', 460], ['The Milky Way from a dark site', 700]] },
      score: 640, reactions: { love: 50, insight: 2, funny: 0, fire: 10, wow: 90 },
      comments: [],
    },
    {
      id: 'game-rec', n: 'cozygames', author: 'quiet_quinn', age: 1900, flair: 'Recommendation',
      title: 'Small games that respect your time (under 5 hours)',
      body: '- A Short Hike\n- Unpacking\n- Tiny Glade\n- Lil Gator Game\n- Venba\n\nAll of them made me happy and none of them ate my weekend.',
      score: 720, reactions: { love: 150, insight: 60, funny: 0, fire: 20, wow: 4 },
      comments: [
        { a: 'cozy_kit', t: 1850, s: 80, b: 'Venba also teaches you to cook, kind of! Beautiful game.', r: [] },
      ],
    },
    {
      id: 'shakshuka', n: 'homecooking', author: 'sunny_side', age: 1250, flair: 'Recipe',
      title: 'The 20-minute shakshuka that saved my weeknights',
      body: 'Onion, garlic, a red pepper, tinned tomatoes, cumin, paprika, chilli. Simmer 10 minutes, make wells, crack in eggs, lid on for 6 minutes. Feta and parsley on top. Bread for dipping is mandatory.',
      score: 860, reactions: { love: 140, insight: 30, funny: 0, fire: 90, wow: 5 },
      comments: [
        { a: 'chef_tomasz', t: 1230, s: 70, b: 'A spoon of harissa in the sauce takes it to another level.', r: [] },
      ],
    },
    {
      id: 'a11y', n: 'webdev', author: 'dev_dani', age: 470, flair: 'Discussion',
      title: 'Please stop removing focus outlines. Style them instead.',
      body: 'Every week I review a site with `outline: none` everywhere. Keyboard users need to see where they are! Use `:focus-visible` to show a ring only for keyboard focus, then make it pretty.',
      score: 2130, reactions: { love: 210, insight: 520, funny: 4, fire: 130, wow: 10 },
      comments: [
        { a: 'css_wizard', t: 460, s: 340, b: '`:focus-visible` with an `outline-offset` of 2px and your brand colour. Done. It looks *nice*.', r: [] },
        { a: 'null_pointer', t: 440, s: 120, b: 'Printing this and taping it to my designer’s monitor.', r: [
          { a: 'dev_dani', t: 430, s: 90, b: 'Gently! Designers are usually on our side once they see it in action.' },
        ] },
      ],
    },
    {
      id: 'hq-calm', n: 'nookhq', author: 'nook_team', age: 4300, flair: 'Announcement',
      title: 'New: Calm mode hides every number on Nook',
      body: 'Scores, comment counts, member counts: gone, if you want them gone. Turn it on in **Settings → Feed**. Votes still work, you just won’t see the tallies.',
      score: 1880, reactions: { love: 400, insight: 90, funny: 2, fire: 60, wow: 20 },
      comments: [
        { a: 'quiet_quinn', t: 4200, s: 210, b: 'Turned it on the second I read this. Thank you.', r: [] },
      ],
    },
    {
      id: 'hq-bugs', n: 'nookhq', author: 'nook_team', age: 1440 * 4, flair: 'Bug',
      title: 'Weekly bug thread: tell us what broke',
      body: 'Found something weird? Describe what you did, what you expected, and what happened instead.',
      score: 240, reactions: { love: 5, insight: 4, funny: 1, fire: 0, wow: 0 },
      comments: [
        { a: 'null_pointer', t: 1440 * 4 - 60, s: 40, b: 'Not a bug, but the brand shape morphing when you open a nook made me click back and forth for five minutes.', r: [] },
      ],
    },
    {
      id: 'retro-gear', n: 'synthwave', author: 'retrowave_rick', age: 1700, flair: 'Gear', type: 'image',
      art: { from: '#f48fb1', to: '#4a148c', angle: 210, symbol: 'piano', shape: 'softBurst' },
      title: 'Finally found a working 1986 polysynth at a flea market for €60',
      body: 'Two keys were sticky. A cotton bud and some patience later, it sings. That pad sound is pure 1986.',
      score: 1560, reactions: { love: 210, insight: 4, funny: 10, fire: 300, wow: 160 },
      comments: [
        { a: 'neon_nadia', t: 1690, s: 160, b: '€60?! Flea market luck of the decade.', r: [] },
      ],
    },
    {
      id: 'landscape', n: 'photography', author: 'river_rae', age: 2200, flair: 'Landscape', type: 'image',
      art: { from: '#ffe082', to: '#00838f', angle: 175, symbol: 'landscape', shape: 'gem' },
      title: 'Morning fog on the river, shot from my kayak',
      body: 'Got up at 5. Paddled out in silence. Worth every yawn.',
      score: 1290, reactions: { love: 260, insight: 0, funny: 0, fire: 60, wow: 90 },
      comments: [
        { a: 'shutter_sid', t: 2150, s: 90, b: 'Shooting from a kayak and getting it level is a skill in itself.', r: [] },
      ],
    },
    {
      id: 'pixel-tut', n: 'pixelart', author: 'pixel_pia', age: 3100, flair: 'Tutorial',
      title: 'Three tips that instantly improved my sprites',
      body: '1. Pick your palette **first**.\n2. Avoid pillow shading: light from one direction.\n3. Zoom out often. If it doesn’t read at 1×, it doesn’t read.',
      score: 1430, reactions: { love: 120, insight: 410, funny: 0, fire: 40, wow: 10 },
      comments: [
        { a: 'neon_nadia', t: 3050, s: 70, b: '“If it doesn’t read at 1×, it doesn’t read” should be on a poster.', r: [] },
      ],
    },
  ],

  // what the inbox holds on a first visit
  notifications: [
    { id: 'n-welcome', kind: 'system', symbol: 'waving_hand', shape: 'cookie9', text: 'Welcome to Nook! Start with the feature tour in n/nookhq.', href: '#/n/nookhq/p/welcome', age: 2 },
    { id: 'n-event', kind: 'event', symbol: 'swap_horiz', shape: 'clover4', text: 'n/houseplants: “Cutting swap, live” starts soon.', href: '#/n/houseplants', age: 15 },
    { id: 'n-trend', kind: 'trending', symbol: 'trending_up', shape: 'softBurst', text: 'Trending in n/homecooking: Grandma’s sarmale recipe', href: '#/n/homecooking/p/sarmale', age: 40 },
  ],

  // what a newly made post in each kind of nook might hear back
  replies: [
    'This is great, thanks for sharing!',
    'Saving this for later.',
    'Okay this made my day 😄',
    'Came here to say exactly this.',
    'Do you have any tips for a total beginner?',
    'Underrated post. Have my upvote.',
    'I didn’t know I needed this until now.',
    'Following, I want to see how this turns out!',
    'Love this nook so much.',
    'Bookmarking for the weekend.',
  ],
};

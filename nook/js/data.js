/*
 * Nook's starting point: the nooks (communities) people can post in, each with
 * its colour, shape and rules. There are no made-up people, posts or numbers
 * here: everything else in Nook is written by the people who use it.
 */
window.NOOK_DATA = {
  communities: [
    {
      id: 'nookhq', title: 'Nook HQ', color: '#6750a4', shape: 'cookie9', symbol: 'campaign', category: 'Meta',
      tagline: 'Ideas, feedback and questions about Nook itself.',
      description: 'Tell us what you would change about Nook, report something that broke, or suggest a feature.',
      rules: ['Feedback is welcome, cruelty is not', 'One idea per post makes voting fair', 'Describe bugs step by step'],
      flairs: ['Idea', 'Feedback', 'Bug', 'Question'],
    },
    {
      id: 'houseplants', title: 'Plant Parenthood', color: '#3f8f4f', shape: 'clover4', symbol: 'potted_plant', category: 'Hobbies',
      tagline: 'For people whose windowsills are slowly becoming jungles.',
      description: 'Show off your plants, ask for help when they droop, and share what you have learned. Beginners very welcome.',
      rules: ['Be kind to beginners', 'Plant ID requests need a photo', 'No selling, swapping is fine'],
      flairs: ['Show off', 'Help', 'Propagation', 'Pests', 'Plant ID'],
    },
    {
      id: 'synthwave', title: 'Synthwave', color: '#e8467c', shape: 'sunny', symbol: 'graphic_eq', category: 'Music',
      tagline: 'Neon sunsets, gated reverb and cassettes that never die.',
      description: 'Share tracks, gear, and the art that goes with them.',
      rules: ['Credit the artist', 'Tag AI-generated tracks', 'Keep self-promotion to your own posts'],
      flairs: ['New release', 'Gear', 'Artwork', 'Discussion'],
    },
    {
      id: 'homecooking', title: 'Home Cooking', color: '#ff8a3d', shape: 'cookie6', symbol: 'soup_kitchen', category: 'Food',
      tagline: 'Recipes from real kitchens with real mess.',
      description: 'Your weeknight dinners, family recipes and kitchen experiments. Post the recipe or it didn’t happen.',
      rules: ['Recipe or it didn’t happen', 'No food shaming', 'Mark spicy opinions as spoilers'],
      flairs: ['Recipe', 'Question', 'Fail', 'Family recipe'],
    },
    {
      id: 'webdev', title: 'Web Dev', color: '#3d7bff', shape: 'pixelCircle', symbol: 'code', category: 'Tech',
      tagline: 'HTML, CSS, JS, and the endless argument about all three.',
      description: 'For people who build for the web. Show your projects, ask questions, share what you learned today.',
      rules: ['Show your code when asking for help', 'No framework wars', 'Be patient with beginners'],
      flairs: ['Showcase', 'Question', 'TIL', 'Discussion'],
    },
    {
      id: 'nightsky', title: 'Night Sky', color: '#4b5bd6', shape: 'verySunny', symbol: 'rocket_launch', category: 'Science',
      tagline: 'Looking up since forever.',
      description: 'Astronomy, astrophotography and space news. Whether you have a telescope or just a balcony, you belong here.',
      rules: ['Credit your photos and gear', 'No conspiracy theories', 'Spoiler-tag launch results'],
      flairs: ['Astrophoto', 'News', 'Question', 'Gear'],
    },
    {
      id: 'cozygames', title: 'Cozy Games', color: '#8b5cf6', shape: 'ghostish', symbol: 'sports_esports', category: 'Gaming',
      tagline: 'Farming, fishing, decorating. Zero jump scares.',
      description: 'Wholesome games and the people who love them. Share your farms, your islands and your little victories.',
      rules: ['Keep it wholesome', 'Tag spoilers', 'Screenshots need context'],
      flairs: ['Screenshot', 'Recommendation', 'Discussion', 'Achievement'],
    },
    {
      id: 'cycling', title: 'Two Wheels', color: '#00a6a6', shape: 'cookie12', symbol: 'directions_bike', category: 'Sports',
      tagline: 'Commuters, racers, tourers and people who just like bikes.',
      description: 'Routes, repairs, rides and everything else on two wheels.',
      rules: ['Share routes, not private addresses', 'Be nice to new riders', 'Keep helmet debates civil'],
      flairs: ['Ride report', 'Repair', 'Gear', 'Route'],
    },
    {
      id: 'bookclub', title: 'Book Nook', color: '#b98c00', shape: 'clamShell', symbol: 'menu_book', category: 'Books',
      tagline: 'Reading together, one chapter at a time.',
      description: 'Talk about the books you love, the one you are reading, and the pile you mean to get to.',
      rules: ['Spoiler-tag plot details', 'Recommendations need a reason', 'All genres welcome'],
      flairs: ['Recommendation', 'Review', 'Discussion', 'Reading now'],
    },
    {
      id: 'pixelart', title: 'Pixel Art', color: '#ff5252', shape: 'pixelTriangle', symbol: 'brush', category: 'Art',
      tagline: 'Every pixel placed on purpose.',
      description: 'Sprites, tilesets, animations and palettes. Critique is welcome when asked for.',
      rules: ['Original work only', 'Use the Critique flair if you want feedback', 'No tracing without credit'],
      flairs: ['OC', 'Critique', 'Tutorial', 'Palette'],
    },
    {
      id: 'photography', title: 'Light & Lens', color: '#5f7d95', shape: 'gem', symbol: 'photo_camera', category: 'Art',
      tagline: 'Photos, critique and the hunt for good light.',
      description: 'Share your shots and what you learned taking them. Gear talk welcome, gear snobbery less so.',
      rules: ['Post your own photos', 'Include settings if you can', 'Critique the photo, not the photographer'],
      flairs: ['Street', 'Landscape', 'Portrait', 'Critique', 'Gear'],
    },
    {
      id: 'travel', title: 'Wanderlust', color: '#0288d1', shape: 'arch', symbol: 'flight', category: 'Travel',
      tagline: 'Trip reports, itineraries and very specific questions about trains.',
      description: 'Plan trips, share stories, and find out which bakery in which town you absolutely cannot miss.',
      rules: ['Trip reports need a photo or a map', 'No referral links', 'Respect locals'],
      flairs: ['Trip report', 'Itinerary', 'Question', 'Tip'],
    },
    {
      id: 'asknook', title: 'Ask Nook', color: '#c2185b', shape: 'softBurst', symbol: 'forum', category: 'Discussion',
      tagline: 'Ask anything. Seriously, anything.',
      description: 'Open-ended questions for everyone on Nook.',
      rules: ['Questions only in titles', 'No personal info', 'Serious tag means serious answers'],
      flairs: ['Serious', 'Fun', 'Poll'],
    },
  ],

  // there are no made-up people: the only person here to begin with is you
  users: {},
  posts: [],
  notifications: [],
};

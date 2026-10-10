/**
 * Everything Squeak can say. He isn't a chatbot: every line is about greeting people,
 * finding trims, or showing them where a trim is.
 *
 * Placeholders: {name} {names} {query} {thing} {count} {kind} {left}
 * Squeak picks a random line from each list and avoids repeating the last one he used.
 */
export const LINES = {
  // First thing a newcomer sees. Every greeting ends with the same question.
  greet: [
    'Hello! What can I help you find today?',
    'Welcome to the atelier! What can I help you find today?',
    'Howdy! Fresh trims on the shelves today. What can I help you find today?',
    'Come on in! I know every ribbon and button in here. What can I help you find today?',
  ],
  greetNamed: [
    'Hello, {name}! What can I help you find today?',
    'Oh! {name}, welcome to the atelier. What can I help you find today?',
    '{name}! Good to see you. What can I help you find today?',
    'Hi, {name}! The shelves are fully stocked. What can I help you find today?',
  ],
  greetReturn: [
    'Back again! What can I help you find today?',
    'Hello again! What can I help you find today?',
    'Need another trim? What can I help you find today?',
  ],
  // Someone else joined while this person had Squeak open.
  arrival: [
    'Oh! {name} just walked in. Hello, {name}! What can I help you find today?',
    'A customer! Welcome, {name}. What can I help you find today?',
    'Welcome, {name}! What can I help you find today?',
    'A new face! Hi, {name}. What can I help you find today?',
  ],
  arrivalMany: [
    'Oh, visitors! Welcome, {names}! What can I help you find today?',
    'Hello, {names}! What can I help you find today?',
  ],

  // After clicking Squeak.
  prompt: [
    'What trim are we hunting for? Describe it, or give me a word.',
    'Tell me what it looks like, like "gold scalloped lace" or "red pom-poms".',
    'Ready when you are! Color, material, style, anything helps.',
    'Describe the trim and I\'ll go dig it up.',
    'Which trim do you need? I\'ll check every swatch.',
  ],
  // Clicking Squeak again while the search box is already open.
  poke: [
    'I\'m all ears! Type a trim and press Enter.',
    'Hehe, that tickles. What are we looking for?',
    'Still here! Try something like "black velvet ribbon".',
    'Just type what you\'re after and I\'ll fetch it.',
  ],
  emptyQuery: [
    'Type a word or a little description first, and I\'ll go looking.',
    'I need a hint! What color or kind of trim?',
  ],

  searching: [
    'Let me check the swatches for "{query}"…',
    'Rummaging through the trim bins for "{query}"…',
    'Hmm, "{query}"… one moment.',
    'Checking every spool for "{query}"…',
  ],
  // The model downloads once; Squeak says this while it loads.
  glasses: [
    'Let me get my magnifying glass. It takes a little while the first time…',
    'One moment, I\'m putting on my reading glasses for this one…',
  ],

  foundOne: [
    'Found it! It\'s {thing}.',
    'Aha, here it is: {thing}.',
    'Got one: {thing}.',
  ],
  foundMany: [
    'I found {count} that could fit! The closest is {thing}.',
    '{count} matches! My favorite is {thing}.',
    'Ooh, {count} candidates. Let\'s start with {thing}.',
  ],
  // Some of the words matched (a tag, a title or a frame name), but not all of them.
  partialOne: [
    'Not an exact match, but this is close: {thing}.',
    'This matches part of what you described: {thing}.',
  ],
  partialMany: [
    'Nothing matches every word, but {count} come close. The best is {thing}.',
    'I found {count} partial matches. The closest is {thing}.',
  ],
  guessOne: [
    'I\'m not totally sure, but this looks close: {thing}.',
    'Best I can tell, it might be {thing}.',
  ],
  guessMany: [
    'Nothing is labeled that way, but {count} trims look close. The nearest is {thing}.',
    'I\'m going by looks here. {count} could match, and the closest is {thing}.',
  ],
  next: [
    'How about this one? It\'s {thing}.',
    'Next up: {thing}.',
    'Here\'s another: {thing}.',
  ],
  wrap: [
    'That\'s all of them! Back to the first: {thing}.',
  ],
  askCloser: [
    'Would you like to see it up close?',
    'Want me to take you to it?',
    'Shall we go take a closer look?',
  ],

  going: ['Follow me!', 'This way!', 'Off we go!'],
  arrived: [
    'Here it is! I\'ve selected it so it\'s easy to spot.',
    'Ta-da! There\'s your {kind}.',
    'Right here! Take a good look.',
    'Here we are! Click me if you need another one.',
  ],
  declined: [
    'No problem! Click me whenever you need another trim.',
    'Alright! I\'ll be right here if you need me.',
    'Okay! Just click me to search again.',
  ],

  none: [
    'I checked every swatch, but nothing looks like "{query}". Try a color or a material?',
    'Hmm, no "{query}" on this board that I can see. Maybe describe it another way?',
    'I came up empty for "{query}". Try something like "white scalloped lace".',
  ],
  noneYet: [
    'Nothing yet for "{query}", but I still have {left} trims to look at. Try again in a minute?',
  ],
  missing: [
    'Hmm, that one seems to have wandered off. It may have been moved or deleted.',
  ],
  boardError: [
    'I can\'t read the board right now. Check that the app has permission to view it, then try again.',
  ],

  // Opened outside Miro (local preview): no board to search yet.
  preview: [
    'I\'d love to find "{query}", but there\'s no board here yet. Open me inside Miro and I\'ll go look!',
    'This is just a preview, so my shelves are empty. Open me in Miro to search for "{query}".',
  ],

  // The "Show Squeak to everyone who opens this board" switch (one setting shared by the whole board).
  homeOn: [
    'This is my shop now! I\'ll pop up for everyone who opens this board.',
    'Moving in! From now on I\'ll greet everyone who opens this board.',
  ],
  homeOff: [
    'Got it, I\'ll stop popping up on this board. Anyone can bring me back from the + menu.',
    'Okay! I\'ll stay behind the counter here. Click + and search "trim" if you need me.',
  ],
  homeError: [
    'Only people who can edit this board can change that. Ask an editor to switch me on or off.',
  ],

  // "Fix this label"
  fixPrompt: [
    'Oops! I called it {thing}. What is it really? I\'ll remember.',
    'My mistake! Tell me what this one actually is.',
  ],
  fixEmpty: ['Type what it is, like "gold O-ring", and I\'ll write it down.'],
  fixThanks: [
    'Got it, {label}! I\'ll remember that from now on.',
    'Noted: {label}. Thanks for teaching me!',
  ],

  catalogDone: [
    'All done! I\'ve looked at all {count} trim photos, so you can search by description now.',
    'Finished cataloguing {count} trims! Describe one and I\'ll find it.',
  ],
  catalogFailed: [
    'My magnifying glass isn\'t working right now, so I\'ll search by names and labels only.',
  ],
};

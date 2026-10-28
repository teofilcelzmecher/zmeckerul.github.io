// The moderation rules against sentences that must pass and ones that must be caught, in English and Romanian.
// Run: node nook/tools/moderation-test.js
'use strict';

const mod = require('../js/moderation.js');

const ZW = String.fromCharCode(8203); // an invisible zero-width space
const CYR_P = String.fromCharCode(1088); // Cyrillic "р", which looks like a Latin p
const CYR_A = String.fromCharCode(1072); // Cyrillic "а"

const verdict = (t) => {
  const r = mod.check([t], { kind: 'comment' });
  return r.block ? 'BLOCK' : r.warn.length ? 'WARN' : r.care ? 'CARE' : r.strong ? 'STRONG' : 'ok';
};

const cases = {
  ok: [
    // English that contains listed words inside it
    'This spicy curry recipe uses lots of spice', 'My cat loves the cocoon of blankets', 'Classic assessment of the assets',
    'The future of the web is bright', 'Fire retardant paint works', 'I live near Scunthorpe', 'Pakistan has amazing mountains',
    'ha ha ha ha that is funny', 'Is 2024-10-27 a Monday?', 'I took CS50 HARVARD COURSE online', 'Shiitake mushrooms are great',
    'Let it go, die-hard fans', 'Assam tea please', 'Wait.......... what?', 'At the end my friend left', 'The basement is cocky cold',
    'Peacock feathers', 'Hancock park', 'Futsal on Sunday?',
    // Romanian that contains listed words inside it, or sounds close
    'Muzica populară e frumoasă', 'Pădurea de fag e superbă', 'Am manipulat datele din tabel', 'Copula verbului a fi',
    'Scapula e un os din umăr', 'Mâine am curs de engleză', 'Cursa de biciclete a fost tare', 'Am fost în vacanță la Pisa',
    'Muierea din poveste era înțeleaptă', 'Ce pulpă de pui bună', 'Mi-am luat un pulover nou', 'Cocoșul cântă dimineața',
    'Mama ta e foarte drăguță', 'Vreau o pizza cu ciuperci', 'Coaja de portocală e amară', 'Avem cacao fierbinte?',
    'Pentru mine e un lucru futil', 'Muzica futuristă e ciudată', 'Ne vedem la cursuri', 'Jocul ăsta e retro tare',
    'Ți-am zis că vin mâine', 'Am răcit și mă doare capul', 'Mă omor de râs cu tine', 'Să mori tu că ai câștigat!',
    // words that contain or sound like the crude list, and must stay untouched
    'Thorny bushes everywhere', 'Happiness is a warm budgie', 'The pen is mightier than the sword', 'Peninsula Balcanică',
    'Trebuie să pornesc mașina', 'A porni calculatorul e ușor', 'Cum ești azi?', 'Cum a fost la școală?', 'A blue tit visited my feeder',
    // close to the sexual, adult-site and scam rules, and fine
    'Sending pics of my new plant!', 'We learned about sex education in biology', 'Fukushima trip photos', 'Is Robux worth buying?',
    'What are you wearing to the party?', 'I earned 50 lei yesterday', 'The nude paintings in the Louvre are famous',
    'Show me your drawings!', 'Don’t tell me the ending', 'My parents said hi', 'Am trimis poze cu pisica', 'Arată-mi desenele tale',
    'Free shipping on plants this week', 'The new Nitro skin looks cool', 'I want to have fun this weekend', 'Let’s meet at the library',
    'Sussex is a lovely county', 'Essex and Middlesex', 'Let’s go to the free museum day', 'u/ana u/bob u/cris what do you think?',
    // close to the threat and hate phrases, and fine
    'I beat you at FIFA again', 'I will beat you next round', 'Haha te-am bătut la FIFA', 'O să te bat la șah mâine',
    'Do you know where the library is?', 'Where do you live, roughly? Which country?', 'Send me pics of your cat',
    'Send me pics of your body of work', 'Nobody would believe you, it was so funny', 'The world is better with you in it',
    'Go back to your country’s page for the results', 'You should just do it', 'You don’t deserve to lose like that',
    'Știu unde stai la cantină', 'Nu meriți să pierzi așa', 'Lumea ar fi mai bună fără războaie',
    'We went to jump off the bridge into the lake at camp, so fun', 'Send me a pic of you in your new jersey!',
  ],
  STRONG: [
    'what the fuck', 'this is bullshit', 'f.u.c.k this', 'fuuuuck yes', 'sh1t happens', 'f u c k',
    'du-te în pula mea', 'ești o pizdă', 'muie steaua', 'futu-ți mama', 'ce căcat de joc', 'taci curvo',
    'p.u.l.a', 'p u l a', 'pvla', 'mvie', 'puuuuula', 'p' + ZW + 'ula', CYR_P + 'ul' + CYR_A, 'plm frate', 'fmm de viață',
    'morții mă-tii', 'ești un labagiu', 'muistule', 'pizdos mic', 'te doare-n cur', 'zdreanță ce ești', 'târfă',
    'Its me penis man', 'p3nis', 'so horny', 'watching porn', 'filme porno', 'vaginul', 'pornhub link',
    // letters drawn as emoji or in boxes
    '🅵🆄🅲🅺 this', '🇫🇺🇨🇰 off', '🄵🅄🄲🄺',
  ],
  BLOCK: [
    'you are a f4ggot', 'kys loser', 'kill yourself', 'k1ll urself now', 'I will kill you', 'go die', 'stupid n1gger',
    'check bit.ly/abc', 'aaaaaaaaaaaaaaaa', 'spam spam spam spam spam spam spam spam spam',
    'a https://a.com b https://b.com c https://c.com d https://d.com',
    'omoară-te', 'sinucide-te', 'spânzură-te', 'aruncă-te de pe bloc', 'taie-ți venele', 'te omor', 'te ucid mâine',
    'îți tai gâtul', 'du-te și mori', 'sper să mori naibii', 'ești un poponar', 'bozgorule', 'jidanii', 'ești retardat',
    'p0p0nar', 'h0malau',
    // asking for or offering nudes, and sex
    'send nudes', 'send me ur nudes pls', 's3nd n00dz', 'send. nudes', 'trade nudes?', 'selling nudes dm', 'wanna sext', 'lets fuck',
    'show me your boobs', 'dm me for nudes', 'nudes for robux', 'send dick pics', 'trimite-mi poze nud', 'trimite-mi o poză goală',
    'arată-mi țâțele', 'vrei să ne futem?', 'vând nuduri', 'hai să facem sex',
    // adult sites, scams and mention spam
    'check out pornhub.com', 'my site xvideos.com/abc', 'hot girls at www.chaturbate.com', 'go to cams.xxx',
    'free robux!!!', 'FREE V-BUCKS GENERATOR', 'free nitro click here', 'double your bitcoin today', 'earn $500 per day from home',
    'robux gratis aici', 'câștigă 300 lei pe zi', 'u/aa1 u/bb2 u/cc3 u/dd4 u/ee5 u/ff6 u/gg7 u/hh8 u/ii9 look',
    // threats, death wishes and hate with no bad word in them
    'I know where you live', 'I’m going to find where u live', 'I will beat you up after school', 'nobody would miss you',
    'no one would care if u died', 'the world would be better off without you', 'people like you shouldn’t exist',
    'you don’t deserve to live', 'you should just die', 'go back to your country', 'go back to ur own country',
    'știu unde locuiești', 'o să-ți fac rău', 'nu meriți să trăiești', 'oamenii ca tine n-ar trebui să existe',
    'nimeni nu te-ar plânge', 'lumea ar fi mai bună fără tine', 'du-te înapoi în țara ta',
    'send me pics of your body', 'I want to see you naked', 'trimite-mi poze cu tine dezbrăcată', 'go jump off a bridge',
    'send me a pic in your underwear', 'show me a photo of you in ur bra', 'let’s have sex tonight', "let's have sex",
  ],
  WARN: [
    'call me on +40 712 345 678', 'my email is someone@example.com', 'card 4111 1111 1111 1111',
    'IBAN RO49AAAA1B31007593840000', 'WHY IS NOBODY ANSWERING ME', 'password: hunter2', 'parola: 123456abc', 'sună-mă la 0712 345 678',
  ],
  CARE: ['i want to die', 'sometimes I think about suicide', 'vreau să mor', 'nu mai vreau să trăiesc', 'mă sinucid', 'mă tai pe mâini'],
};

// warning signs in private messages: sent, and flagged for a moderator (never in posts or comments)
const flags = {
  yes: [
    'don’t tell your parents about this', 'dont tell ur parents ok?', 'keep this a secret between us', 'keep our chat a secret',
    'are you home alone rn?', 'are u alone', 'what are you wearing?', 'what r u wearing right now', 'how old are you? whats your snap',
    'send me a pic of you in your pyjamas', 'lets meet in person, just us', 'can we meet secretly', 'nu le spune părinților',
    'ești singură acasă?', 'ce porți pe tine?', 'să rămână între noi', 'hai să ne vedem singuri',
  ],
  no: [
    'don’t tell me the ending!', 'what are you wearing to the party?', 'are you alone in the group project?', 'how old is your cat?',
    'my parents say hi', 'send me the homework pls', 'lets meet at the park with everyone', 'nu-i spune lui Andrei de cadou',
    'ce porți la nuntă?', 'ești singur în echipă?',
  ],
};

let wrong = 0;
for (const [want, list] of Object.entries(flags)) {
  for (const t of list) {
    const r = mod.check([t], { kind: 'message' });
    const got = r.flag ? 'yes' : 'no';
    if (got !== want || r.block) {
      wrong++;
      console.log(`WRONG flag ${want} → ${got}${r.block ? ' (blocked: ' + r.block.rule + ')' : ''}: ${t}`);
    }
    if (mod.check([t], { kind: 'comment' }).flag) {
      wrong++;
      console.log(`WRONG: flagged outside a private message: ${t}`);
    }
  }
}

for (const [want, list] of Object.entries(cases)) {
  for (const t of list) {
    const got = verdict(t);
    if (got !== want) {
      wrong++;
      console.log(`MISS want ${want} got ${got}: ${JSON.stringify(t)}`);
    }
  }
}
const total = Object.values(cases).reduce((n, list) => n + list.length, 0);
console.log(wrong ? `${wrong} of ${total} wrong` : `all ${total} cases right`);
console.log(mod.soften('Du-te în pula mea, futu-ți morții mă-tii! Muzica populară e frumoasă.'));
process.exitCode = wrong ? 1 : 0;

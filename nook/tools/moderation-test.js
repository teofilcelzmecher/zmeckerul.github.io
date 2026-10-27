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
  ],
  STRONG: [
    'what the fuck', 'this is bullshit', 'f.u.c.k this', 'fuuuuck yes', 'sh1t happens', 'f u c k',
    'du-te în pula mea', 'ești o pizdă', 'muie steaua', 'futu-ți mama', 'ce căcat de joc', 'taci curvo',
    'p.u.l.a', 'p u l a', 'pvla', 'mvie', 'puuuuula', 'p' + ZW + 'ula', CYR_P + 'ul' + CYR_A, 'plm frate', 'fmm de viață',
    'morții mă-tii', 'ești un labagiu', 'muistule', 'pizdos mic', 'te doare-n cur', 'zdreanță ce ești', 'târfă',
    'Its me penis man', 'p3nis', 'send nudes', 'so horny', 'watching porn', 'filme porno', 'vaginul', 'pornhub link',
  ],
  BLOCK: [
    'you are a f4ggot', 'kys loser', 'kill yourself', 'k1ll urself now', 'I will kill you', 'go die', 'stupid n1gger',
    'check bit.ly/abc', 'aaaaaaaaaaaaaaaa', 'spam spam spam spam spam spam spam spam spam',
    'a https://a.com b https://b.com c https://c.com d https://d.com',
    'omoară-te', 'sinucide-te', 'spânzură-te', 'aruncă-te de pe bloc', 'taie-ți venele', 'te omor', 'te ucid mâine',
    'îți tai gâtul', 'du-te și mori', 'sper să mori naibii', 'ești un poponar', 'bozgorule', 'jidanii', 'ești retardat',
    'p0p0nar', 'h0malau',
  ],
  WARN: [
    'call me on +40 712 345 678', 'my email is someone@example.com', 'card 4111 1111 1111 1111',
    'IBAN RO49AAAA1B31007593840000', 'WHY IS NOBODY ANSWERING ME', 'password: hunter2', 'parola: 123456abc', 'sună-mă la 0712 345 678',
  ],
  CARE: ['i want to die', 'sometimes I think about suicide', 'vreau să mor', 'nu mai vreau să trăiesc', 'mă sinucid', 'mă tai pe mâini'],
};

let wrong = 0;
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

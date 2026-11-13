// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * The page Spotify sends someone back to once they've said yes (or no) to Budgie seeing what they play (1.7). Spotify's
 * answer (a one-time code, and the state Budgie's server gave the link) goes to the server, which finishes linking; the
 * state says whose account it is, so this page needs no sign-in of its own (it may open in another browser, from the
 * phone or computer app). The code leaves the address bar at once, so it's never kept in the browser's history.
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const base = String(read('nook-api') || (window.NOOK_CONFIG && window.NOOK_CONFIG.api) || '').replace(/\/$/, '');
  const box = document.getElementById('linked');
  const shape = document.getElementById('linked-shape');

  // in the language Budgie is in here, or else the browser's (this page may open in a browser Budgie's never been in)
  const LANGS = ['ro', 'es', 'fr', 'de', 'it'];
  const lang = [read('nook-lang'), ...(navigator.languages || [navigator.language])].map((l) => String(l || '').slice(0, 2).toLowerCase()).find((l) => l === 'en' || LANGS.includes(l)) || 'en';
  const WORDS = {
    'Linking Spotify…': ['Se leagă Spotify…', 'Vinculando Spotify…', 'Association de Spotify…', 'Spotify wird verknüpft…', 'Collegamento di Spotify…'],
    'Just a moment.': ['O clipă.', 'Un momento.', 'Un instant.', 'Einen Moment.', 'Un attimo.'],
    'Go to Budgie': ['Mergi la Budgie', 'Ir a Budgie', 'Aller sur Budgie', 'Zu Budgie', 'Vai su Budgie'],
    'Nothing to link here': ['Nimic de legat aici', 'Nada que vincular aquí', 'Rien à associer ici', 'Hier gibt es nichts zu verknüpfen', 'Niente da collegare qui'],
    'Link Spotify from Settings → Activity in Budgie.': ['Leagă Spotify din Setări → Activitate în Budgie.', 'Vincula Spotify desde Ajustes → Actividad en Budgie.', 'Associe Spotify depuis Paramètres → Activité dans Budgie.', 'Verknüpfe Spotify in Budgie unter Einstellungen → Aktivität.', 'Collega Spotify da Impostazioni → Attività in Budgie.'],
    'Budgie’s server isn’t set up': ['Serverul Budgie nu e configurat', 'El servidor de Budgie no está configurado', 'Le serveur de Budgie n’est pas configuré', 'Budgies Server ist nicht eingerichtet', 'Il server di Budgie non è configurato'],
    'Try again in a moment.': ['Încearcă din nou peste o clipă.', 'Inténtalo de nuevo en un momento.', 'Réessaie dans un instant.', 'Versuch es gleich noch einmal.', 'Riprova tra un attimo.'],
    'Spotify is linked': ['Spotify este legat', 'Spotify está vinculado', 'Spotify est associé', 'Spotify ist verknüpft', 'Spotify è collegato'],
    'Linked as {0}.': ['Legat ca {0}.', 'Vinculado como {0}.', 'Associé en tant que {0}.', 'Verknüpft als {0}.', 'Collegato come {0}.'],
    'Your friends can now see what you play on Spotify. You can close this page and go back to Budgie.': ['Prietenii tăi pot vedea acum ce asculți pe Spotify. Poți închide pagina asta și să te întorci la Budgie.', 'Ahora tus amigos pueden ver lo que escuchas en Spotify. Puedes cerrar esta página y volver a Budgie.', 'Tes amis peuvent maintenant voir ce que tu écoutes sur Spotify. Tu peux fermer cette page et revenir sur Budgie.', 'Deine Freunde sehen jetzt, was du auf Spotify hörst. Du kannst diese Seite schließen und zu Budgie zurückkehren.', 'Ora i tuoi amici possono vedere cosa ascolti su Spotify. Puoi chiudere questa pagina e tornare su Budgie.'],
    'Spotify didn’t link': ['Spotify nu s-a legat', 'Spotify no se vinculó', 'Spotify ne s’est pas associé', 'Spotify wurde nicht verknüpft', 'Spotify non si è collegato'],
    'Try again from Settings → Activity in Budgie.': ['Încearcă din nou din Setări → Activitate în Budgie.', 'Inténtalo de nuevo desde Ajustes → Actividad en Budgie.', 'Réessaie depuis Paramètres → Activité dans Budgie.', 'Versuch es in Budgie unter Einstellungen → Aktivität noch einmal.', 'Riprova da Impostazioni → Attività in Budgie.'],
    'Can’t reach Budgie’s server': ['Serverul Budgie nu răspunde', 'No se puede contactar con el servidor de Budgie', 'Impossible de joindre le serveur de Budgie', 'Budgies Server ist nicht erreichbar', 'Impossibile raggiungere il server di Budgie'],
    'Check your connection, then try again from Settings → Activity in Budgie.': ['Verifică-ți conexiunea, apoi încearcă din nou din Setări → Activitate în Budgie.', 'Comprueba tu conexión y vuelve a intentarlo desde Ajustes → Actividad en Budgie.', 'Vérifie ta connexion, puis réessaie depuis Paramètres → Activité dans Budgie.', 'Prüfe deine Verbindung und versuch es dann in Budgie unter Einstellungen → Aktivität noch einmal.', 'Controlla la connessione, poi riprova da Impostazioni → Attività in Budgie.'],
    // what the server may answer
    'This link to Spotify has run out. Start again from Settings → Activity in Budgie.': ['Linkul către Spotify a expirat. Începe din nou din Setări → Activitate în Budgie.', 'Este enlace a Spotify ha caducado. Empieza de nuevo desde Ajustes → Actividad en Budgie.', 'Ce lien vers Spotify a expiré. Recommence depuis Paramètres → Activité dans Budgie.', 'Dieser Link zu Spotify ist abgelaufen. Fang in Budgie unter Einstellungen → Aktivität neu an.', 'Questo link a Spotify è scaduto. Ricomincia da Impostazioni → Attività in Budgie.'],
    'You didn’t let Budgie see what you play on Spotify, so nothing is linked.': ['Nu i-ai permis lui Budgie să vadă ce asculți pe Spotify, așa că nu s-a legat nimic.', 'No dejaste que Budgie viera lo que escuchas en Spotify, así que no se vinculó nada.', 'Tu n’as pas laissé Budgie voir ce que tu écoutes sur Spotify, donc rien n’est associé.', 'Du hast Budgie nicht erlaubt zu sehen, was du auf Spotify hörst, also ist nichts verknüpft.', 'Non hai permesso a Budgie di vedere cosa ascolti su Spotify, quindi non è stato collegato niente.'],
    'Spotify didn’t link. Try again from Settings → Activity in Budgie.': ['Spotify nu s-a legat. Încearcă din nou din Setări → Activitate în Budgie.', 'Spotify no se vinculó. Inténtalo de nuevo desde Ajustes → Actividad en Budgie.', 'Spotify ne s’est pas associé. Réessaie depuis Paramètres → Activité dans Budgie.', 'Spotify wurde nicht verknüpft. Versuch es in Budgie unter Einstellungen → Aktivität noch einmal.', 'Spotify non si è collegato. Riprova da Impostazioni → Attività in Budgie.'],
    'Spotify didn’t send what Budgie needs. Try again from Settings → Activity in Budgie.': ['Spotify n-a trimis ce îi trebuie lui Budgie. Încearcă din nou din Setări → Activitate în Budgie.', 'Spotify no envió lo que Budgie necesita. Inténtalo de nuevo desde Ajustes → Actividad en Budgie.', 'Spotify n’a pas envoyé ce dont Budgie a besoin. Réessaie depuis Paramètres → Activité dans Budgie.', 'Spotify hat nicht geschickt, was Budgie braucht. Versuch es in Budgie unter Einstellungen → Aktivität noch einmal.', 'Spotify non ha inviato ciò che serve a Budgie. Riprova da Impostazioni → Attività in Budgie.'],
    'Spotify didn’t finish linking. Try again in a minute.': ['Spotify n-a terminat legarea. Încearcă din nou într-un minut.', 'Spotify no terminó de vincularse. Inténtalo de nuevo en un minuto.', 'Spotify n’a pas fini l’association. Réessaie dans une minute.', 'Spotify hat das Verknüpfen nicht abgeschlossen. Versuch es in einer Minute noch einmal.', 'Spotify non ha finito il collegamento. Riprova tra un minuto.'],
    'Spotify doesn’t let this account use this Budgie server’s Spotify app yet. Ask whoever runs Budgie to add you in Spotify’s developer dashboard (User Management), then link it again.': ['Spotify nu lasă încă acest cont să folosească aplicația Spotify a acestui server Budgie. Roagă-l pe cel care se ocupă de Budgie să te adauge în panoul de dezvoltator Spotify (User Management), apoi leagă-l din nou.', 'Spotify todavía no deja que esta cuenta use la app de Spotify de este servidor de Budgie. Pide a quien gestiona Budgie que te añada en el panel de desarrolladores de Spotify (User Management) y vuelve a vincularla.', 'Spotify ne laisse pas encore ce compte utiliser l’app Spotify de ce serveur Budgie. Demande à la personne qui gère Budgie de t’ajouter dans le tableau de bord développeur de Spotify (User Management), puis associe-le à nouveau.', 'Spotify lässt dieses Konto die Spotify-App dieses Budgie-Servers noch nicht nutzen. Bitte die Person, die Budgie betreibt, dich im Spotify-Entwickler-Dashboard (User Management) hinzuzufügen, und verknüpfe es dann noch einmal.', 'Spotify non permette ancora a questo account di usare l’app Spotify di questo server Budgie. Chiedi a chi gestisce Budgie di aggiungerti nella dashboard sviluppatori di Spotify (User Management), poi collegalo di nuovo.'],
    'That’s a lot of tries. Wait a little and try again.': ['Sunt multe încercări. Așteaptă puțin și încearcă din nou.', 'Son muchos intentos. Espera un poco y vuelve a intentarlo.', 'Ça fait beaucoup d’essais. Attends un peu et réessaie.', 'Das sind viele Versuche. Warte kurz und versuch es noch einmal.', 'Sono tanti tentativi. Aspetta un po’ e riprova.'],
  };
  const t = (english, value) => {
    const i = LANGS.indexOf(lang);
    const words = (i >= 0 && WORDS[english] && WORDS[english][i]) || english;
    return value == null ? words : words.replace('{0}', value);
  };
  if (lang !== 'en') {
    document.documentElement.lang = lang;
    for (const id of ['linked-title', 'linked-text', 'linked-back']) {
      const el = document.getElementById(id);
      el.textContent = t(el.textContent.trim());
    }
    document.title = t('Linking Spotify…').replace(/…$/, '') + ' · Budgie';
  }

  const say = (title, text, ok) => {
    document.getElementById('linked-title').textContent = t(title);
    document.getElementById('linked-text').textContent = text;
    box.classList.toggle('ok', ok === true);
    box.classList.toggle('no', ok === false);
    if (shape.transitionTo) shape.transitionTo(ok ? 'sunny' : 'ghostish', { spring: true });
  };
  history.replaceState(null, '', location.pathname);
  if (!q.get('state')) return say('Nothing to link here', t('Link Spotify from Settings → Activity in Budgie.'), false);
  if (!base) return say('Budgie’s server isn’t set up', t('Try again in a moment.'), false);
  fetch(base + '/api/music/spotify/done', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ code: q.get('code') || '', state: q.get('state') || '', error: q.get('error') || '' }),
  })
    .then((res) => res.json().then((answer) => ({ ok: res.ok, answer }), () => ({ ok: false, answer: {} })))
    .then(({ ok, answer }) => {
      if (ok) say('Spotify is linked', (answer.account ? t('Linked as {0}.', answer.account) + ' ' : '') + t('Your friends can now see what you play on Spotify. You can close this page and go back to Budgie.'), true);
      else say('Spotify didn’t link', t(answer.error || 'Try again from Settings → Activity in Budgie.'), false);
    })
    .catch(() => say('Can’t reach Budgie’s server', t('Check your connection, then try again from Settings → Activity in Budgie.'), false));
})();

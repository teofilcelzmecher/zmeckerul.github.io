// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// The desktop app's own words (its tray menu, the window that rings, the screen picker, the offline page), in
// Budgie's six languages. Everything else people read is the website's, already in their language: the app follows
// the language the website is in.
'use strict';

const WORDS = {
  open: ['Open Budgie', 'Deschide Budgie', 'Abrir Budgie', 'Ouvrir Budgie', 'Budgie öffnen', 'Apri Budgie'],
  notifications: ['Notifications', 'Notificări', 'Notificaciones', 'Notifications', 'Mitteilungen', 'Notifiche'],
  startup: ['Start with your computer', 'Pornește odată cu calculatorul', 'Abrir al iniciar el ordenador', 'Lancer au démarrage de l’ordinateur', 'Mit dem Computer starten', 'Avvia con il computer'],
  update: ['Get Budgie {0}', 'Descarcă Budgie {0}', 'Descargar Budgie {0}', 'Télécharger Budgie {0}', 'Budgie {0} holen', 'Scarica Budgie {0}'],
  quit: ['Quit Budgie', 'Închide Budgie de tot', 'Salir de Budgie', 'Quitter Budgie', 'Budgie beenden', 'Esci da Budgie'],
  unread: ['{0} unread', '{0} necitite', '{0} sin leer', '{0} non lus', '{0} ungelesen', '{0} da leggere'],
  stillTitle: ['Budgie is still running', 'Budgie rulează în continuare', 'Budgie sigue abierto', 'Budgie tourne toujours', 'Budgie läuft weiter', 'Budgie è ancora attivo'],
  stillBody: [
    'You’ll still get calls and messages. To quit, use Budgie’s icon in the tray, or press Ctrl+Q.',
    'Vei primi în continuare apeluri și mesaje. Ca să-l închizi de tot, folosește iconița Budgie din bara de sistem sau apasă Ctrl+Q.',
    'Seguirás recibiendo llamadas y mensajes. Para salir, usa el icono de Budgie en la bandeja del sistema o pulsa Ctrl+Q.',
    'Tu recevras toujours les appels et les messages. Pour quitter, utilise l’icône de Budgie dans la zone de notification, ou appuie sur Ctrl+Q.',
    'Du bekommst weiter Anrufe und Nachrichten. Zum Beenden nutze das Budgie-Symbol im Infobereich oder drücke Strg+Q.',
    'Riceverai ancora chiamate e messaggi. Per uscire, usa l’icona di Budgie nell’area di notifica o premi Ctrl+Q.',
  ],
  updateTitle: ['A newer Budgie is out', 'A apărut un Budgie mai nou', 'Hay un Budgie más nuevo', 'Un Budgie plus récent est sorti', 'Ein neueres Budgie ist da', 'È uscito un Budgie più recente'],
  updateBody: [
    'Budgie {0} for your computer is ready to download.',
    'Budgie {0} pentru calculator poate fi descărcat.',
    'Budgie {0} para tu ordenador está listo para descargar.',
    'Budgie {0} pour ton ordinateur est prêt à être téléchargé.',
    'Budgie {0} für deinen Computer kann geladen werden.',
    'Budgie {0} per il tuo computer è pronto da scaricare.',
  ],
  share: ['Share your screen', 'Partajează ecranul', 'Compartir pantalla', 'Partager l’écran', 'Bildschirm teilen', 'Condividi lo schermo'],
  screens: ['Screens', 'Ecrane', 'Pantallas', 'Écrans', 'Bildschirme', 'Schermi'],
  windows: ['Windows', 'Ferestre', 'Ventanas', 'Fenêtres', 'Fenster', 'Finestre'],
  wholeScreen: ['Your whole screen', 'Tot ecranul', 'Toda la pantalla', 'Tout ton écran', 'Dein ganzer Bildschirm', 'Tutto lo schermo'],
  screenN: ['Screen {0}', 'Ecranul {0}', 'Pantalla {0}', 'Écran {0}', 'Bildschirm {0}', 'Schermo {0}'],
  sound: ['Share sound', 'Partajează și sunetul', 'Compartir el sonido', 'Partager le son', 'Ton teilen', 'Condividi l’audio'],
  soundNote: [
    'Everything your computer plays goes too, the call included, so the others may hear themselves. Best for videos and games.',
    'Pleacă tot ce redă calculatorul, inclusiv apelul, așa că ceilalți s-ar putea auzi pe ei înșiși. Merge cel mai bine la clipuri și jocuri.',
    'Se comparte todo lo que suena en tu ordenador, también la llamada, así que los demás podrían oírse a sí mismos. Ideal para vídeos y juegos.',
    'Tout ce que joue ton ordinateur est partagé, l’appel aussi, donc les autres pourraient s’entendre. Idéal pour les vidéos et les jeux.',
    'Alles, was dein Computer abspielt, geht mit, auch der Anruf, also hören die anderen sich vielleicht selbst. Am besten für Videos und Spiele.',
    'Viene condiviso tutto ciò che suona il computer, anche la chiamata, quindi gli altri potrebbero sentirsi. Ideale per video e giochi.',
  ],
  cancel: ['Cancel', 'Anulează', 'Cancelar', 'Annuler', 'Abbrechen', 'Annulla'],
  go: ['Share', 'Partajează', 'Compartir', 'Partager', 'Teilen', 'Condividi'],
  offline: ['You’re offline', 'Nu ești conectat la internet', 'Estás sin conexión', 'Tu es hors ligne', 'Du bist offline', 'Sei offline'],
  offlineBody: [
    'Budgie connects again as soon as you’re back online.',
    'Budgie se reconectează imediat ce revii online.',
    'Budgie se conectará de nuevo en cuanto vuelvas a tener conexión.',
    'Budgie se reconnecte dès que tu es de nouveau en ligne.',
    'Budgie verbindet sich wieder, sobald du online bist.',
    'Budgie si ricollega appena torni online.',
  ],
  retry: ['Try again', 'Încearcă din nou', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Riprova'],
  cut: ['Cut', 'Decupează', 'Cortar', 'Couper', 'Ausschneiden', 'Taglia'],
  copy: ['Copy', 'Copiază', 'Copiar', 'Copier', 'Kopieren', 'Copia'],
  paste: ['Paste', 'Lipește', 'Pegar', 'Coller', 'Einfügen', 'Incolla'],
  selectAll: ['Select all', 'Selectează tot', 'Seleccionar todo', 'Tout sélectionner', 'Alles auswählen', 'Seleziona tutto'],
  copyLink: ['Copy link', 'Copiază linkul', 'Copiar enlace', 'Copier le lien', 'Link kopieren', 'Copia link'],
  openLink: ['Open in your browser', 'Deschide în browser', 'Abrir en el navegador', 'Ouvrir dans le navigateur', 'Im Browser öffnen', 'Apri nel browser'],
  copyImage: ['Copy picture', 'Copiază poza', 'Copiar imagen', 'Copier l’image', 'Bild kopieren', 'Copia immagine'],
  saveImage: ['Save picture as…', 'Salvează poza ca…', 'Guardar imagen como…', 'Enregistrer l’image sous…', 'Bild speichern unter…', 'Salva immagine come…'],
  addWord: ['Add to dictionary', 'Adaugă în dicționar', 'Añadir al diccionario', 'Ajouter au dictionnaire', 'Zum Wörterbuch hinzufügen', 'Aggiungi al dizionario'],
  noSuggestions: ['No suggestions', 'Nicio sugestie', 'Sin sugerencias', 'Aucune suggestion', 'Keine Vorschläge', 'Nessun suggerimento'],
  answer: ['Answer', 'Răspunde', 'Contestar', 'Répondre', 'Annehmen', 'Rispondi'],
  decline: ['Decline', 'Respinge', 'Rechazar', 'Refuser', 'Ablehnen', 'Rifiuta'],
  // the tray: whether Budgie may show the song you're listening to and the game you're playing, and what it sees now
  sharePlaying: [
    'Share what I’m playing',
    'Arată ce ascult și ce joc',
    'Mostrar lo que escucho y juego',
    'Montrer ce que j’écoute et ce à quoi je joue',
    'Zeigen, was ich höre und spiele',
    'Mostra cosa ascolto e a cosa gioco',
  ],
  listeningTo: ['Listening to {0}', 'Asculți {0}', 'Escuchando {0}', 'En écoute : {0}', 'Du hörst {0}', 'Stai ascoltando {0}'],
  playingGame: ['Playing {0}', 'Joci {0}', 'Jugando a {0}', 'En jeu : {0}', 'Du spielst {0}', 'Stai giocando a {0}'],
};
const LANGS = ['en', 'ro', 'es', 'fr', 'de', 'it'];

/** a word in a language (English when there's none), with its {0} filled in */
function say(lang, key, args = []) {
  const row = WORDS[key];
  if (!row) return key;
  const i = Math.max(0, LANGS.indexOf(lang));
  return (row[i] || row[0]).replace(/\{(\d+)\}/g, (_, n) => (args[n] == null ? '' : String(args[n])));
}

// the app uses it, and so does its offline page (which has no app to ask)
if (typeof module !== 'undefined' && module.exports) module.exports = { say, has: (lang) => LANGS.includes(lang), keys: Object.keys(WORDS) };
else window.BUDGIE_WORDS = say;

// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nest chat (Budgie 1.5), in the app: #/n/<nest>/chat and #/n/<nest>/chat/<channel>.
 *
 * Every nest has channels (#general first), shown as a row of chips under the chat's header, with a dot on any that
 * has something new since you last looked. It's a chat like the others (the same bubbles, pictures, GIFs and
 * stickers), with each run of messages saying who it's from. Anyone can read; joining the nest is what lets you
 * talk (the box to write in says so, with a Join button, until you do), and someone banned from the nest is told
 * why instead. Its admins have a Channels button: add one, give it a topic, rename it, move it up or down, delete
 * it. Hold (or right-click) a message to copy, report or delete it (yours, or anyone's for the nest's team).
 *
 * It's live: the open channel tells the server so every half a minute, and new messages arrive over the live
 * connection as they're sent (or, without one, with a look every few seconds). Messages from someone you blocked
 * are hidden, as in group chats.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store || !Nook.views) return;
  const { store, ui, fx, api } = Nook;
  const views = Nook.views;
  const { esc, icon } = ui;
  const app = () => Nook.app;
  const serverHas = () => !!(views.serverAt && views.serverAt('1.5.0'));

  // per nest: { channels, member, banned, manage, remove, at } as the server last said; per channel: its messages
  const nests = new Map();
  const threads = new Map();
  const threadOf = (id) => {
    if (!threads.has(id)) threads.set(id, { messages: [], loaded: false, more: false });
    return threads.get(id);
  };

  // what was last seen in each channel, on this device, for the dots
  const SEEN = 'nook-channels-seen';
  const seen = (() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN)) || {};
    } catch (_) {
      return {};
    }
  })();
  const saw = (channel, id) => {
    if (!id || (seen[channel] || 0) >= id) return;
    seen[channel] = id;
    try {
      localStorage.setItem(SEEN, JSON.stringify(seen));
    } catch (_) {
      /* private mode: dots come back next time */
    }
  };

  async function loadNest(nook) {
    const r = await api.get(`/api/nooks/${encodeURIComponent(nook)}/channels`);
    const was = nests.get(nook);
    const next = Object.assign({}, r, { at: Date.now() });
    nests.set(nook, next);
    return !was || JSON.stringify(was.channels) !== JSON.stringify(r.channels) || was.manage !== r.manage || was.remove !== r.remove || JSON.stringify(was.banned) !== JSON.stringify(r.banned);
  }

  async function loadThread(id, { older = false } = {}) {
    const t = threadOf(id);
    const first = t.messages[0];
    const r = await api.get(`/api/channels/${id}/messages${older && first ? '?before=' + first.id : ''}`);
    t.messages = older ? r.messages.concat(t.messages) : r.messages;
    if (!older || !t.loaded) t.more = !!r.more;
    else t.more = !!r.more;
    t.loaded = true;
    return t;
  }
  /** what's new since the newest one here (the look every few seconds, when there's no live connection) */
  async function newer(id) {
    const t = threadOf(id);
    if (!t.loaded) return false;
    const last = t.messages.filter((m) => typeof m.id === 'number').pop();
    const r = await api.get(`/api/channels/${id}/messages?after=${last ? last.id : 0}`);
    const fresh = r.messages.filter((m) => !t.messages.some((x) => x.id === m.id));
    t.messages = t.messages.concat(fresh);
    return fresh.length > 0;
  }

  const here = () => {
    const m = /^#\/n\/([^/?#]+)\/chat(?:\/([^/?#]+))?/.exec(location.hash);
    return m ? { nook: decodeURIComponent(m[1]), channel: m[2] ? decodeURIComponent(m[2]) : 'general' } : null;
  };
  const repaint = () => {
    const main = document.getElementById('main');
    if (main && main._onMessages) main._onMessages();
  };

  // ---- the page ------------------------------------------------------------------------------------------------

  function nestChat(params) {
    if (!serverHas()) return views.notFound('Nest chat needs a newer Budgie server.');
    const c = store.community(params.nook);
    if (!c) return views.notFound('That nest doesn’t exist.');
    const st = nests.get(c.id);
    const name = params.channel || 'general';
    const ch = st ? st.channels.find((x) => x.name === name) : null;
    const member = store.state.joined.includes(c.id);
    const chip = (x) =>
      `<a class="chip ch-chip" href="#/n/${esc(c.id)}/chat/${encodeURIComponent(x.name)}"${x.name === name ? ' aria-current="page"' : ''} data-m3-ripple>` +
      `<span class="ch-hash" aria-hidden="true">#</span>${esc(x.name)}${x.name !== name && x.lastId > (seen[x.id] || 0) ? '<i class="ch-new" aria-label="New messages"></i>' : ''}</a>`;
    const head =
      `<div class="chat-head ch-head"><a class="m3-toolbar-btn" href="#/n/${esc(c.id)}" data-effect="nudge-left" data-shape="cookie7" aria-label="Back to n/${esc(c.id)}">${icon('arrow_back')}</a>` +
      `<a class="chat-who" href="#/n/${esc(c.id)}">${ui.nookIcon(c, 40, 22)}<span><b translate="no"><span class="ch-hash">#</span>${esc(name)}</b><small>${ch && ch.topic ? esc(ch.topic) : 'n/' + esc(c.id)}</small></span></a>` +
      (st && st.manage ? `<button type="button" class="m3-icon-btn" data-ch-manage aria-label="Channels in n/${esc(c.id)}" data-tooltip="Channels">${icon('tune')}</button>` : '') +
      `<nav class="ch-chips" aria-label="Channels in n/${esc(c.id)}">${st ? st.channels.map(chip).join('') : '<m3-loading aria-label="Loading channels"></m3-loading>'}</nav></div>`;
    const locked =
      st && st.banned
        ? `<div class="card chat-locked"><p>${icon('block')}You’re banned from n/${esc(c.id)}${st.banned.until ? ` until ${esc(new Date(st.banned.until).toLocaleDateString())}` : ''}, so you can read its chat but not talk there. Reason: ${esc(st.banned.reason || '')}</p></div>`
        : !member
        ? `<div class="card chat-locked"><p>Join n/${esc(c.id)} to talk in its channels. Anyone can read them.</p><div class="toolbar">${views.joinButton(c, false)}</div></div>`
        : '';
    return {
      title: `#${name} · n/${c.id}`,
      nook: c,
      brand: 'cookie9',
      html: views.chatPage(head, { placeholder: `Message #${name}`, locked }),
      mount(root) {
        // the channels, fresh now and then: the page is drawn again if they changed
        if (!st || Date.now() - st.at > 60000)
          loadNest(c.id).then(
            (changed) => {
              const now = here();
              if (changed && now && now.nook === c.id) app().rerender();
            },
            (error) => {
              const list = root.querySelector('#chat-list');
              if (list) list.innerHTML = `<p class="muted chat-empty">${esc(error.message)}</p>`;
            }
          );
        if (st && !ch) {
          // a channel that isn't there (deleted, or a typo): #general instead
          location.replace(`#/n/${encodeURIComponent(c.id)}/chat`);
          return;
        }
        if (!ch) return;
        const remove = async (m) => {
          try {
            await api.del(`/api/channel-messages/${m.id}`);
            const t = threadOf(ch.id);
            t.messages = t.messages.filter((x) => x.id !== m.id);
            repaint();
            M3.snackbar('Message deleted');
          } catch (error) {
            app().showError(error);
          }
        };
        views.mountChat(root, {
          thread: () => threadOf(ch.id),
          load: (options) => loadThread(ch.id, options),
          send: async (body, extra) => {
            const r = await api.post(`/api/channels/${ch.id}/messages`, Object.assign({ body }, extra));
            const t = threadOf(ch.id);
            if (!t.messages.some((x) => x.id === r.message.id)) t.messages.push(r.message);
            saw(ch.id, r.message.id);
            return r.message;
          },
          read: () => {
            const last = threadOf(ch.id).messages.filter((m) => typeof m.id === 'number').pop();
            if (last) saw(ch.id, last.id);
          },
          reportKind: 'chmessage',
          canDelete: (m) => typeof m.id === 'number' && (m.mine || !!(nests.get(c.id) || {}).remove),
          remove,
          render: (all) => views.chatHTML(all, null, true),
          empty: () =>
            `<div class="chat-empty">${ui.nookIcon(c, 72, 36)}<b translate="no">#${esc(name)}</b><span class="muted">${ch.topic ? esc(ch.topic) : `The start of #${esc(name)} in n/${esc(c.id)}. Say hi!`}</span></div>`,
        });
        // it's open: the server sends what's said here at once (said again every half a minute while it's open)
        const watch = () => document.visibilityState === 'visible' && api.post(`/api/channels/${ch.id}/watch`, {}).catch(() => {});
        watch();
        const watching = setInterval(watch, 30000);
        // and without a live connection, a look every few seconds
        const looking = setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          newer(ch.id).then((fresh) => fresh && repaint(), () => {});
        }, 8000);
        const onVisible = () => document.visibilityState === 'visible' && (watch(), newer(ch.id).then((fresh) => fresh && repaint(), () => {}));
        document.addEventListener('visibilitychange', onVisible);
        app().onLeave(() => {
          clearInterval(watching);
          clearInterval(looking);
          document.removeEventListener('visibilitychange', onVisible);
        });
        // the chip of where you are, in view
        const current = root.querySelector('.ch-chip[aria-current]');
        if (current) current.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        const manage = root.querySelector('[data-ch-manage]');
        if (manage) manage.addEventListener('click', () => manageChannels(c));
      },
    };
  }
  views.nestChat = nestChat;

  // joining (or leaving) the nest whose chat is open: once the button has had its moment, the box opens (or locks)
  store.on('joined', ({ id }) => {
    const now = here();
    if (!now || now.nook !== id) return;
    setTimeout(() => {
      const still = here();
      if (still && still.nook === id) app().rerender();
    }, 600);
  });

  // what's said in a channel you have open arrives at once
  Nook.hook('signal', (type, data) => {
    if (type !== 'channel' || !data || !data.channel) return;
    const t = threads.get(data.channel);
    if (!t || !t.loaded) return;
    if (data.deleted) t.messages = t.messages.filter((m) => m.id !== data.deleted);
    else if (data.message && !t.messages.some((m) => m.id === data.message.id)) t.messages.push(data.message);
    const now = here();
    const st = now && nests.get(now.nook);
    const open = st && st.channels.find((x) => x.name === now.channel);
    if (open && open.id === data.channel) repaint();
  });

  // ---- the nest's admins: adding, changing, moving and deleting channels ----------------------------------------

  function editChannel(c, ch) {
    return ui.sheet({
      headline: ch ? `#${ch.name}` : 'New channel',
      symbol: ch ? 'edit' : 'add_comment',
      shape: 'puffy',
      html:
        (ch && ch.name === 'general'
          ? ''
          : `<div class="field"><label for="ch-name">Name</label><div class="ch-name-row"><span class="ch-hash" aria-hidden="true">#</span><input class="m3-field" id="ch-name" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="memes" value="${esc(ch ? ch.name : '')}"></div>` +
            '<small class="muted">Small letters, numbers and dashes, like help-desk.</small></div>') +
        `<div class="field"><label for="ch-topic">Topic (optional)</label><input class="m3-field" id="ch-topic" maxlength="120" autocomplete="off" placeholder="What it’s for" value="${esc(ch ? ch.topic || '' : '')}"></div>` +
        '<span class="error" id="ch-err" role="alert"></span>',
      actions: [
        { label: 'Cancel', value: null },
        {
          label: ch ? 'Save' : 'Add channel',
          variant: 'filled',
          run(close, body) {
            const nameBox = body.querySelector('#ch-name');
            const fields = { topic: body.querySelector('#ch-topic').value.trim() };
            if (nameBox) fields.name = nameBox.value.trim();
            const err = body.querySelector('#ch-err');
            err.textContent = '';
            (ch ? api.patch(`/api/channels/${ch.id}`, fields) : api.post(`/api/nooks/${encodeURIComponent(c.id)}/channels`, fields))
              .then((r) => close(r.channel || (r.channels || []).find((x) => x.id === ch.id) || true))
              .catch((error) => (err.textContent = error.message));
            return false;
          },
        },
      ],
    });
  }

  function manageChannels(c) {
    const row = (x, i, all) =>
      `<div class="ch-row" data-ch="${x.id}"><span class="row-text"><b translate="no"><span class="ch-hash">#</span>${esc(x.name)}</b><small>${x.topic ? esc(x.topic) : 'No topic'}</small></span>` +
      `<button type="button" class="m3-icon-btn small" data-ch-act="up" aria-label="Move #${esc(x.name)} up"${i === 0 ? ' disabled' : ''}>${icon('arrow_upward')}</button>` +
      `<button type="button" class="m3-icon-btn small" data-ch-act="down" aria-label="Move #${esc(x.name)} down"${i === all.length - 1 ? ' disabled' : ''}>${icon('arrow_downward')}</button>` +
      `<button type="button" class="m3-icon-btn small" data-ch-act="edit" aria-label="Change #${esc(x.name)}">${icon('edit')}</button>` +
      (x.name === 'general' ? '' : `<button type="button" class="m3-icon-btn small" data-ch-act="delete" aria-label="Delete #${esc(x.name)}">${icon('delete')}</button>`) +
      '</div>';
    return ui.sheet({
      headline: 'Channels',
      symbol: 'forum',
      shape: 'cookie9',
      html: `<p class="muted" style="margin-top:0">Up to 20 in n/${esc(c.id)}. Everyone can read them; members can talk.</p><div class="ch-list"></div>`,
      setup(body) {
        const list = body.querySelector('.ch-list');
        const paint = () => {
          const all = (nests.get(c.id) || { channels: [] }).channels;
          list.innerHTML = all.map(row).join('');
        };
        const refresh = (r) => {
          const st = nests.get(c.id);
          if (st && r && r.channels) st.channels = r.channels;
          paint();
          app().rerender();
        };
        paint();
        list.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-ch-act]');
          if (!b) return;
          const st = nests.get(c.id);
          const x = st && st.channels.find((y) => String(y.id) === b.closest('[data-ch]').dataset.ch);
          if (!x) return;
          const act = b.dataset.chAct;
          try {
            if (act === 'up' || act === 'down') refresh(await api.patch(`/api/channels/${x.id}`, { move: act === 'up' ? -1 : 1 }));
            else if (act === 'edit') {
              if (await editChannel(c, x)) {
                await loadNest(c.id);
                refresh();
              }
            } else if (act === 'delete') {
              const yes = await ui.sheet({
                headline: `Delete #${x.name}?`,
                symbol: 'delete',
                shape: 'softBurst',
                html: '<p>It goes for everyone, with everything said in it. This can’t be undone.</p>',
                actions: [{ label: 'Cancel', value: false }, { label: 'Delete', variant: 'filled', value: true }],
              });
              if (yes) refresh(await api.del(`/api/channels/${x.id}`));
            }
          } catch (error) {
            app().showError(error);
          }
        });
      },
      actions: [
        {
          label: 'New channel',
          variant: 'tonal',
          symbol: 'add',
          run(close, body) {
            // (it stays open: the new one joins the list)
            editChannel(c).then(async (made) => {
              if (!made) return;
              await loadNest(c.id);
              body.querySelector('.ch-list').innerHTML = (nests.get(c.id) || { channels: [] }).channels.map((x, i, all) => row(x, i, all)).join('');
              app().rerender();
            }, () => {});
            return false;
          },
        },
        { label: 'Done', value: null, variant: 'filled' },
      ],
    });
  }

  Nook.channels = { loadNest, nests };
})();

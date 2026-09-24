(function () {
    'use strict';

    if (!window.WC) return;

    const state = {
        peerId: WC.initialPeerId || null,
        peer: null,
        messages: [],
        lastMessageId: 0,
        replyTo: null,
        pollTimer: null,
        typingTimer: null,
        typingPollTimer: null,
        isTypingSent: false,
        mediaRecorder: null,
        voiceChunks: [],
        voicePcmChunks: [],
        voiceAudioContext: null,
        voiceProcessor: null,
        voiceStartedAt: null,
        voiceTimerInterval: null,
        reactionTargetId: null,
        pendingAttach: null,
        pendingAttachUrl: null,
        blockStatus: null,
        canMessage: true,
    };

    const els = {
        shell: document.getElementById('chatShell'),
        conversationList: document.getElementById('conversationList'),
        chatMessages: document.getElementById('chatMessages'),
        chatHeaderName: document.getElementById('chatHeaderName'),
        chatHeaderStatus: document.getElementById('chatHeaderStatus'),
        chatHeaderAvatar: document.getElementById('chatHeaderAvatar'),
        chatComposer: document.getElementById('chatComposer'),
        blockBanner: document.getElementById('chatBlockBanner'),
        messageInput: document.getElementById('messageInput'),
        btnSend: document.getElementById('btnSendMessage'),
        typingIndicator: document.getElementById('typingIndicator'),
        btnCancelReply: document.getElementById('btnCancelReply'),
        btnAttachImage: document.getElementById('btnAttachImage'),
        btnAttachFile: document.getElementById('btnAttachFile'),
        attachPreview: document.getElementById('attachPreview'),
        attachPreviewImg: document.getElementById('attachPreviewImg'),
        attachPreviewTitle: document.getElementById('attachPreviewTitle'),
        attachPreviewName: document.getElementById('attachPreviewName'),
        btnClearAttach: document.getElementById('btnClearAttach'),
        btnVoice: document.getElementById('btnVoice'),
        btnEmoji: document.getElementById('btnEmoji'),
        emojiPicker: document.getElementById('emojiPicker'),
        imageInput: document.getElementById('imageInput'),
        fileInput: document.getElementById('fileInput'),
        voiceRecordingBar: document.getElementById('voiceRecordingBar'),
        voiceTimer: document.getElementById('voiceTimer'),
        btnCancelVoice: document.getElementById('btnCancelVoice'),
        btnSendVoice: document.getElementById('btnSendVoice'),
        contactPanel: document.getElementById('contactPanel'),
        reactionPicker: document.getElementById('reactionPicker'),
        btnBackToList: document.getElementById('btnBackToList'),
        btnShowInfo: document.getElementById('btnShowInfo'),
        btnCloseInfo: document.getElementById('btnCloseInfo'),
        chatHeaderActions: document.getElementById('chatHeaderActions'),
        btnVoiceCall: document.getElementById('btnVoiceCall'),
        btnVideoCall: document.getElementById('btnVideoCall'),
        conversationsCol: document.getElementById('chatConversationsCol'),
        mainCol: document.getElementById('chatMainCol'),
        infoCol: document.getElementById('chatInfoCol'),
    };

    const reactionEmojis = WC.reactionEmojis || ['👍', '❤️', '😂', '😮', '😢', '👏'];
    const composeEmojis = [
        '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤗', '🤔',
        '😎', '😭', '😡', '👍', '👎', '👏', '🙏', '🔥', '❤️', '💯',
        '🎉', '✨', '🌟', '💪', '🤝', '👋', '🫡', '😅', '🥺', '😴'
    ];

    function deliveryLabel(status, isMine) {
        if (!isMine) return '';
        if (status === 'read') return '<span class="wc-msg-status read" title="Read">✓✓ Read</span>';
        if (status === 'delivered') return '<span class="wc-msg-status" title="Delivered">✓✓</span>';
        return '<span class="wc-msg-status" title="Sent">✓</span>';
    }

    function applyReceipts(receipts) {
        if (!receipts || !receipts.length) return false;
        let changed = false;
        receipts.forEach(function (r) {
            const id = parseInt(r.id, 10);
            const status = r.delivery_status;
            const msg = state.messages.find(function (m) { return m.id === id; });
            if (!msg || !msg.is_mine) return;
            if (msg.delivery_status === status) return;
            msg.delivery_status = status;
            changed = true;

            const root = els.chatMessages && els.chatMessages.querySelector('[data-message-id="' + id + '"]');
            if (!root) return;
            const meta = root.querySelector('.wc-msg-meta');
            if (!meta) return;
            const existing = meta.querySelector('.wc-msg-status');
            const html = deliveryLabel(status, true);
            if (existing) {
                if (html) existing.outerHTML = html;
                else existing.remove();
            } else if (html) {
                meta.insertAdjacentHTML('beforeend', html);
            }
        });
        return changed;
    }

    function formatVoiceDuration(sec) {
        if (!sec) return '0:00';
        const s = Math.round(sec);
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + String(r).padStart(2, '0');
    }

    function renderCallLogHtml(msg) {
        const info = msg.call_info || {};
        const outcome = info.outcome || 'ended';
        const isVideo = info.call_type === 'video';
        const typeLabel = isVideo ? 'Video call' : 'Voice call';
        const callType = isVideo ? 'video' : 'voice';
        const incoming = !msg.is_mine;
        const declined = outcome === 'rejected' || outcome === 'missed' || outcome === 'cancelled';
        const dur = (outcome === 'ended' && (info.duration != null || msg.voice_duration != null))
            ? formatVoiceDuration(info.duration != null ? info.duration : msg.voice_duration)
            : '';

        let title = typeLabel;
        let subtitle = '';
        const arrow = msg.is_mine ? 'fa-arrow-up' : 'fa-arrow-down';

        if (outcome === 'rejected') {
            if (incoming) {
                title = typeLabel + ' from ' + WC.escapeHtml(info.caller_name || 'User');
                subtitle = 'Declined';
            } else {
                title = typeLabel;
                subtitle = 'Declined';
            }
        } else if (outcome === 'missed') {
            title = incoming ? ('Missed ' + typeLabel.toLowerCase()) : typeLabel;
            subtitle = incoming ? '' : 'No answer';
        } else if (outcome === 'cancelled') {
            title = typeLabel;
            subtitle = 'Cancelled';
        } else if (outcome === 'ended') {
            title = typeLabel;
            subtitle = dur;
        }

        const iconClass = isVideo
            ? (declined ? 'fa-solid fa-video-slash' : 'fa-solid fa-video')
            : (declined ? 'fa-solid fa-phone-slash' : 'fa-solid fa-phone');
        const stateClass = declined ? 'is-declined' : 'is-ok';

        return (
            '<button type="button" class="wc-call-log ' + stateClass + '" data-call-back="' + callType + '" title="Call back">' +
            '<div class="wc-call-log-icon"><i class="' + iconClass + '"></i></div>' +
            '<div class="wc-call-log-body">' +
            '<div class="wc-call-log-title">' + title + '</div>' +
            (subtitle
                ? ('<div class="wc-call-log-sub"><span class="wc-call-log-arrow"><i class="fa-solid ' + arrow + '"></i></span> ' +
                    WC.escapeHtml(subtitle) + '</div>')
                : '') +
            '</div></button>'
        );
    }

    function callBack(callType) {
        if (!state.peerId) {
            WC.toast('Select a conversation first.', 'warning');
            return;
        }
        const isVideo = callType === 'video';
        if (!WC.Calls || typeof WC.Calls.startVoice !== 'function') {
            WC.toast('Calling module failed to load. Refresh the page.', 'error');
            return;
        }
        const starter = isVideo ? WC.Calls.startVideo : WC.Calls.startVoice;
        Promise.resolve(starter.call(WC.Calls, state.peerId)).catch(function (e) {
            WC.toast((e && e.message) ? e.message : ('Unable to start ' + (isVideo ? 'video' : 'voice') + ' call.'), 'error');
        });
    }
    function replyLabel(reply) {
        if (!reply) return '';
        if (reply.is_deleted) return 'Original message deleted';
        const t = reply.message_type || 'text';
        if (t === 'image') return 'Photo';
        if (t === 'file') return reply.file_name || 'File';
        if (t === 'voice') return 'Voice message';
        if (t === 'call') return reply.body || 'Call';
        const body = (reply.body || '').trim();
        return body || 'Message';
    }

    function replyQuoteHtml(reply) {
        const text = WC.escapeHtml(replyLabel(reply));
        const id = reply && reply.id ? String(reply.id) : '';
        return (
            '<button type="button" class="wc-msg-reply" data-jump-to="' + WC.escapeHtml(id) + '" title="View original message">' +
            '<div class="wc-msg-reply-label">Reply</div>' +
            '<div class="wc-msg-reply-text">' + text + '</div>' +
            '</button>'
        );
    }
    function messageBodyHtml(msg) {
        if (msg.is_deleted) {
            return '<div class="wc-msg-text text-muted">Message deleted</div>';
        }

        let html = '';

        if (msg.reply_to) {
            html += replyQuoteHtml(msg.reply_to);
        }

        if (msg.message_type === 'text') {
            html += '<div class="wc-msg-text">' + WC.escapeHtml(msg.body || '') + '</div>';
        } else if (msg.message_type === 'image' && msg.file_url) {
            html += '<div class="wc-msg-media"><a href="' + WC.escapeHtml(msg.file_url) + '" target="_blank" rel="noopener"><img src="' + WC.escapeHtml(msg.file_url) + '" alt="Image"></a></div>';
            if (msg.body) {
                html += '<div class="wc-msg-text mt-1">' + WC.escapeHtml(msg.body) + '</div>';
            }
        } else if (msg.message_type === 'file' && msg.file_url) {
            html += '<div class="wc-msg-file"><a href="' + WC.escapeHtml(msg.file_url) + '" target="_blank" rel="noopener"><i class="fa-solid fa-file"></i> ' + WC.escapeHtml(msg.file_name || 'Download file') + '</a></div>';
            if (msg.body) {
                html += '<div class="wc-msg-text mt-1">' + WC.escapeHtml(msg.body) + '</div>';
            }
        } else if (msg.message_type === 'voice' && msg.file_url) {
            const dur = msg.voice_duration ? formatVoiceDuration(msg.voice_duration) : '0:00';
            const durAttr = msg.voice_duration != null ? String(msg.voice_duration) : '';
            html += '<div class="wc-msg-voice" data-voice-src="' + WC.escapeHtml(msg.file_url) + '" data-voice-duration="' + WC.escapeHtml(durAttr) + '">' +
                '<button type="button" class="wc-voice-btn" data-voice-play aria-label="Play voice message">' +
                '<i class="fa-solid fa-play"></i></button>' +
                '<div class="wc-voice-track"><div class="wc-voice-fill"></div></div>' +
                '<span class="wc-voice-time">' + dur + '</span>' +
                '</div>';
        } else if (msg.message_type === 'call') {
            html += renderCallLogHtml(msg);
        }

        return html;
    }

    function reactionsHtml(msg) {
        if (!msg.reactions || !msg.reactions.length) return '';
        return '<div class="wc-msg-reactions">' + msg.reactions.map(function (r) {
            const cls = r.reacted ? 'wc-reaction-chip active' : 'wc-reaction-chip';
            return '<button type="button" class="' + cls + '" data-react-toggle="' + msg.id + '" data-emoji="' + WC.escapeHtml(r.emoji) + '">' +
                WC.escapeHtml(r.emoji) + ' ' + r.count + '</button>';
        }).join('') + '</div>';
    }

    function messageHtml(msg) {
        const mine = msg.is_mine ? 'mine' : 'them';
        const deleted = msg.is_deleted ? 'deleted' : '';
        const isCall = msg.message_type === 'call';
        const actions = msg.is_deleted ? '' : (
            '<div class="wc-msg-actions">' +
            '<button type="button" class="wc-msg-action-btn" data-reply="' + msg.id + '" title="Reply"><i class="fa-solid fa-reply"></i></button>' +
            '<button type="button" class="wc-msg-action-btn" data-react-open="' + msg.id + '" title="React"><i class="fa-regular fa-face-smile"></i></button>' +
            (msg.is_mine ? '<button type="button" class="wc-msg-action-btn text-danger" data-delete="' + msg.id + '" title="Delete"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</div>'
        );

        return (
            '<div class="wc-msg ' + mine + ' ' + deleted + (isCall ? ' wc-msg-call' : '') + '" data-message-id="' + msg.id + '">' +
            '<div class="wc-msg-bubble' + (isCall ? ' wc-call-bubble' : '') + '">' +
            messageBodyHtml(msg) +
            reactionsHtml(msg) +
            '<div class="wc-msg-meta">' +
            '<span>' + WC.formatTime(msg.created_at) + '</span>' +
            deliveryLabel(msg.delivery_status, msg.is_mine) +
            '</div>' +
            actions +
            '</div></div>'
        );
    }

    function renderMessages() {
        if (!state.peerId) {
            els.chatMessages.innerHTML = '<div class="wc-chat-empty"><div><i class="fa-regular fa-comments fa-3x mb-3 text-primary"></i><p class="mb-0">Choose a friend to start chatting.</p></div></div>';
            return;
        }

        if (!state.messages.length) {
            els.chatMessages.innerHTML = '<div class="wc-chat-empty"><p class="mb-0">No messages yet. Say hello!</p></div>';
            return;
        }

        els.chatMessages.innerHTML = state.messages.map(messageHtml).join('');
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
        syncReplyUi();
    }

    function renderConversations(conversations) {
        if (!conversations.length) {
            els.conversationList.innerHTML = '<div class="wc-empty-state">No conversations yet.<br><a href="' + WC.appUrl + '/friends.php">Find friends</a></div>';
            return;
        }

        els.conversationList.innerHTML = conversations.map(function (c) {
            const p = c.peer;
            const active = state.peerId === p.id ? 'active' : '';
            const unread = c.unread_count > 0 ? '<span class="wc-badge-unread">' + (c.unread_count > 99 ? '99+' : c.unread_count) + '</span>' : '';
            return (
                '<div class="wc-list-item ' + active + '" data-peer-id="' + p.id + '">' +
                '<img src="' + WC.escapeHtml(p.avatar) + '" alt="" class="wc-avatar">' +
                '<span class="' + WC.presenceClass(p.presence) + '"></span>' +
                '<div class="wc-list-meta">' +
                '<p class="wc-list-title">' + WC.escapeHtml(p.username) + '</p>' +
                '<p class="wc-list-sub">' + WC.escapeHtml((c.last_message && c.last_message.preview) || 'No messages yet') + '</p>' +
                '</div>' +
                unread +
                '</div>'
            );
        }).join('');
    }

    function renderContactPanel() {
        if (!state.peer) {
            els.contactPanel.innerHTML = '<div class="wc-chat-empty"><p class="mb-0">Select a conversation to view details.</p></div>';
            return;
        }

        const p = state.peer;
        els.contactPanel.innerHTML =
            '<div class="text-center">' +
            '<img src="' + WC.escapeHtml(p.avatar) + '" alt="" class="wc-avatar wc-avatar-lg">' +
            '<div class="wc-contact-name">' + WC.escapeHtml(p.username) + '</div>' +
            '<div class="wc-contact-status"><span class="' + WC.presenceClass(p.presence) + '"></span> ' + WC.escapeHtml(p.presence) + ' · ' + WC.escapeHtml(p.last_seen_label || '') + '</div>' +
            (p.status_message ? '<p class="mt-3 text-muted">' + WC.escapeHtml(p.status_message) + '</p>' : '') +
            (state.blockStatus ? '<div class="alert alert-warning mt-3 mb-0 py-2 small">' + WC.escapeHtml(blockBannerText(state.blockStatus)) + '</div>' : '') +
            '<div class="d-grid gap-2 mt-4">' +
            '<a class="btn btn-outline-primary" href="' + WC.appUrl + '/friends.php"><i class="fa-solid fa-user-group"></i> Manage friendship</a>' +
            '</div></div>';
    }

    function blockBannerText(status) {
        if (status === 'blocked_you') {
            return 'You are blocked and cannot message or call this user.';
        }
        if (status === 'you_blocked') {
            return 'You blocked this user. Unblock them to message or call again.';
        }
        return '';
    }

    function applyBlockUi() {
        const blocked = !!state.blockStatus;
        const banner = els.blockBanner;
        if (banner) {
            if (blocked) {
                banner.textContent = blockBannerText(state.blockStatus);
                banner.classList.remove('d-none');
            } else {
                banner.textContent = '';
                banner.classList.add('d-none');
            }
        }

        if (!state.peer) {
            if (els.chatComposer) els.chatComposer.style.display = 'none';
            if (els.chatHeaderActions) els.chatHeaderActions.classList.add('d-none');
            return;
        }

        if (els.chatComposer) {
            els.chatComposer.style.display = blocked ? 'none' : '';
            els.chatComposer.classList.toggle('is-blocked', blocked);
        }
        if (els.chatHeaderActions) {
            els.chatHeaderActions.classList.toggle('d-none', false);
            els.chatHeaderActions.classList.toggle('is-blocked', blocked);
        }
        if (els.btnVoiceCall) els.btnVoiceCall.disabled = blocked;
        if (els.btnVideoCall) els.btnVideoCall.disabled = blocked;
        if (els.messageInput) els.messageInput.disabled = blocked;
        if (els.btnSend) els.btnSend.disabled = blocked;
    }

    function updateHeader() {
        if (!state.peer) {
            els.chatHeaderName.textContent = 'Select a conversation';
            els.chatHeaderStatus.textContent = '';
            els.chatHeaderAvatar.src = WC.appUrl + '/assets/images/default-avatar.svg';
            els.shell.classList.remove('has-peer');
            state.blockStatus = null;
            state.canMessage = true;
            applyBlockUi();
            return;
        }

        els.chatHeaderName.textContent = state.peer.username;
        els.chatHeaderStatus.textContent = state.peer.presence + (state.peer.status_message ? ' · ' + state.peer.status_message : '');
        els.chatHeaderAvatar.src = state.peer.avatar;
        els.shell.classList.add('has-peer');

        if (state.peer.block_status) {
            state.blockStatus = state.peer.block_status;
        } else if (state.peer.has_blocked_me) {
            state.blockStatus = 'blocked_you';
        } else if (state.peer.is_blocked_by_me) {
            state.blockStatus = 'you_blocked';
        }

        applyBlockUi();
    }

    function syncReplyUi(opts) {
        opts = opts || {};
        const input = els.messageInput;
        const cancelBtn = els.btnCancelReply;
        document.querySelectorAll('.wc-msg.is-reply-target').forEach(function (el) {
            el.classList.remove('is-reply-target');
        });

        if (state.replyTo) {
            const label = replyLabel({
                is_deleted: state.replyTo.is_deleted,
                message_type: state.replyTo.message_type,
                file_name: state.replyTo.file_name,
                body: state.replyTo.body
            });
            if (input) input.placeholder = 'Reply: ' + label;
            if (cancelBtn) cancelBtn.classList.remove('d-none');
            const target = els.chatMessages && els.chatMessages.querySelector('[data-message-id="' + state.replyTo.id + '"]');
            if (target) target.classList.add('is-reply-target');
            if (opts.focus && input) input.focus();
        } else {
            if (input) input.placeholder = 'Type a message...';
            if (cancelBtn) cancelBtn.classList.add('d-none');
        }
    }

    function setReply(msg) {
        state.replyTo = msg;
        syncReplyUi({ focus: true });
    }

    function clearReply() {
        state.replyTo = null;
        syncReplyUi();
        if (!state.pendingAttach && els.messageInput) {
            els.messageInput.placeholder = 'Type a message...';
        } else if (state.pendingAttach && els.messageInput) {
            els.messageInput.placeholder = 'Add a caption (optional)...';
        }
    }

    async function loadConversations() {
        const res = await WC.api('messages.php?action=conversations');
        const conversations = res.data.conversations || [];
        renderConversations(conversations);

        if (state.peerId && !state.peer) {
            const found = conversations.find(function (c) { return c.peer.id === state.peerId; });
            if (found) {
                state.peer = found.peer;
                updateHeader();
                renderContactPanel();
            }
        }
    }

    async function loadHistory(initial) {
        if (!state.peerId) return;

        const since = initial ? 0 : state.lastMessageId;
        const url = 'messages.php?action=history&peer_id=' + state.peerId + (since > 0 ? '&since_id=' + since : '');
        const res = await WC.api(url);
        const incoming = res.data.messages || [];
        const receipts = res.data.receipts || [];
        if (Object.prototype.hasOwnProperty.call(res.data, 'block_status')) {
            state.blockStatus = res.data.block_status || null;
            state.canMessage = res.data.can_message !== false && !state.blockStatus;
            if (state.peer) {
                state.peer.block_status = state.blockStatus;
                state.peer.is_blocked_by_me = state.blockStatus === 'you_blocked';
                state.peer.has_blocked_me = state.blockStatus === 'blocked_you';
            }
            applyBlockUi();
        }
        let gotNew = false;

        if (initial) {
            const temps = state.messages.filter(function (m) { return !!m._tempId && !m.id; });
            state.messages = incoming.concat(temps);
            gotNew = true;
        } else if (incoming.length) {
            const existingIds = new Set(state.messages.map(function (m) { return m.id; }));
            incoming.forEach(function (m) {
                if (!existingIds.has(m.id)) {
                    state.messages.push(m);
                    gotNew = true;
                } else {
                    state.messages = state.messages.map(function (old) {
                        return old.id === m.id ? m : old;
                    });
                }
            });
            state.messages.sort(function (a, b) { return a.id - b.id; });
        }

        if (state.messages.length) {
            state.lastMessageId = state.messages[state.messages.length - 1].id;
        }

        if (initial || gotNew) {
            renderMessages();
            applyReceipts(receipts);
            await loadConversations();
        } else {
            applyReceipts(receipts);
        }
    }

    async function selectPeer(peerId, peerObj) {
        if (state.peerId === peerId && state.messages.length) {
            startPolling();
            return;
        }

        state.peerId = peerId;
        state.peer = peerObj || await resolvePeer(peerId);
        state.messages = [];
        state.lastMessageId = 0;
        state.blockStatus = (state.peer && state.peer.block_status) || null;
        state.canMessage = !state.blockStatus;
        clearPendingAttach();
        clearReply();

        updateHeader();
        renderContactPanel();
        renderConversations(await fetchConversationsRaw());

        await loadHistory(true);
        await markRead();
        startPolling();
    }

    let cachedConversations = [];

    async function fetchConversationsRaw() {
        const res = await WC.api('messages.php?action=conversations');
        cachedConversations = res.data.conversations || [];
        return cachedConversations;
    }

    async function resolvePeer(peerId) {
        const conversations = cachedConversations.length ? cachedConversations : await fetchConversationsRaw();
        const inConv = conversations.find(function (c) { return c.peer.id === peerId; });
        if (inConv) return inConv.peer;

        const friendsRes = await WC.api('friends.php?action=list');
        const friend = (friendsRes.data.friends || []).find(function (u) { return u.id === peerId; });
        return friend || null;
    }

    async function markRead() {
        if (!state.peerId) return;
        try {
            await WC.api('messages.php', {
                method: 'POST',
                body: { action: 'mark_read', peer_id: state.peerId },
            });
        } catch (e) { /* ignore */ }
    }

    function clearPendingAttach() {
        if (state.pendingAttachUrl) {
            try { URL.revokeObjectURL(state.pendingAttachUrl); } catch (e) {}
        }
        state.pendingAttach = null;
        state.pendingAttachUrl = null;
        if (els.attachPreview) els.attachPreview.classList.remove('show');
        if (els.attachPreviewImg) {
            els.attachPreviewImg.src = '';
            els.attachPreviewImg.classList.add('d-none');
        }
        if (els.attachPreviewName) els.attachPreviewName.textContent = '';
        if (els.attachPreviewTitle) els.attachPreviewTitle.textContent = 'Attachment';
    }

    function setPendingAttach(file, messageType) {
        if (!file) return;
        clearPendingAttach();
        state.pendingAttach = { file: file, type: messageType };
        if (els.attachPreviewTitle) {
            els.attachPreviewTitle.textContent = messageType === 'image' ? 'Image' : 'File';
        }
        if (els.attachPreviewName) els.attachPreviewName.textContent = file.name || 'Selected file';
        if (messageType === 'image' && file.type && file.type.indexOf('image/') === 0 && els.attachPreviewImg) {
            state.pendingAttachUrl = URL.createObjectURL(file);
            els.attachPreviewImg.src = state.pendingAttachUrl;
            els.attachPreviewImg.classList.remove('d-none');
        }
        if (els.attachPreview) els.attachPreview.classList.add('show');
        if (els.messageInput) {
            els.messageInput.placeholder = 'Add a caption (optional)...';
            els.messageInput.focus();
        }
    }

    function nowSqlStamp() {
        const d = new Date();
        const p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    function upsertMessage(msg) {
        if (!msg) return;
        const tempId = msg._tempId;
        let replaced = false;
        if (msg.id) {
            state.messages = state.messages.filter(function (m) {
                if (tempId && m._tempId === tempId) return false;
                if (m.id && m.id === msg.id) {
                    replaced = true;
                    return false;
                }
                return true;
            });
        } else if (tempId) {
            state.messages = state.messages.filter(function (m) { return m._tempId !== tempId; });
        }
        state.messages.push(msg);
        state.messages.sort(function (a, b) {
            const aid = a.id || 0;
            const bid = b.id || 0;
            if (aid && bid) return aid - bid;
            return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });
        if (msg.id) {
            state.lastMessageId = Math.max(state.lastMessageId || 0, msg.id);
        }
        renderMessages();
    }

    async function sendComposerMessage() {
        if (!state.peerId) return;
        if (state.blockStatus) {
            WC.toast(blockBannerText(state.blockStatus) || 'Messaging is blocked.', 'error');
            return;
        }
        const body = els.messageInput.value.trim();
        const attach = state.pendingAttach;
        if (!attach && !body) return;

        const replySnap = state.replyTo;
        const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

        if (attach) {
            const form = new FormData();
            form.append('action', 'send');
            form.append('peer_id', String(state.peerId));
            form.append('message_type', attach.type);
            form.append('file', attach.file);
            if (body) form.append('body', body);
            if (replySnap) form.append('reply_to_id', String(replySnap.id));

            // Optimistic bubble
            upsertMessage({
                id: 0,
                _tempId: tempId,
                message_type: attach.type,
                body: body,
                file_url: state.pendingAttachUrl || null,
                file_name: attach.file.name,
                is_mine: true,
                delivery_status: 'sent',
                created_at: nowSqlStamp(),
                reply_to: replySnap ? { id: replySnap.id, body: replySnap.body, message_type: replySnap.message_type, is_deleted: !!replySnap.is_deleted } : null,
                reactions: [],
                is_deleted: false
            });

            els.messageInput.value = '';
            clearPendingAttach();
            clearReply();

            try {
                const res = await WC.api('messages.php?action=send', { method: 'POST', body: form });
                const real = res.data && res.data.message;
                if (real) {
                    real._tempId = tempId;
                    upsertMessage(real);
                }
                loadConversations().catch(function () {});
            } catch (e) {
                state.messages = state.messages.filter(function (m) { return m._tempId !== tempId; });
                renderMessages();
                WC.toast((e && e.message) ? e.message : 'Failed to send.', 'error');
            }
            return;
        }

        const payload = {
            action: 'send',
            peer_id: state.peerId,
            message_type: 'text',
            body: body,
        };
        if (replySnap) payload.reply_to_id = replySnap.id;

        upsertMessage({
            id: 0,
            _tempId: tempId,
            message_type: 'text',
            body: body,
            is_mine: true,
            delivery_status: 'sent',
            created_at: nowSqlStamp(),
            reply_to: replySnap ? { id: replySnap.id, body: replySnap.body, message_type: replySnap.message_type, is_deleted: !!replySnap.is_deleted } : null,
            reactions: [],
            is_deleted: false
        });

        els.messageInput.value = '';
        clearReply();

        try {
            const res = await WC.api('messages.php?action=send', {
                method: 'POST',
                body: payload
            });
            const real = res.data && res.data.message;
            if (real) {
                real._tempId = tempId;
                upsertMessage(real);
            }
            loadConversations().catch(function () {});
        } catch (e) {
            state.messages = state.messages.filter(function (m) { return m._tempId !== tempId; });
            renderMessages();
            if (els.messageInput) els.messageInput.value = body;
            WC.toast((e && e.message) ? e.message : 'Failed to send.', 'error');
        }
    }

    // Back-compat aliases used by older handlers
    async function sendTextMessage() {
        return sendComposerMessage();
    }

    async function sendFileMessage(file, messageType) {
        setPendingAttach(file, messageType);
    }

    async function deleteMessage(id) {
        if (!confirm('Delete this message?')) return;
        await WC.api('messages.php', {
            method: 'POST',
            body: { action: 'delete', message_id: id },
        });
        state.messages = state.messages.map(function (m) {
            if (m.id === id) {
                return Object.assign({}, m, { is_deleted: true, body: '' });
            }
            return m;
        });
        renderMessages();
    }

    async function toggleReaction(messageId, emoji) {
        await WC.api('reactions.php', {
            method: 'POST',
            body: {
                action: 'toggle',
                message_id: messageId,
                emoji: emoji,
                scope: 'private',
            },
        });
        await loadHistory(true);
    }

    function hideReactionPicker() {
        els.reactionPicker.classList.remove('show');
        state.reactionTargetId = null;
    }

    function showReactionPicker(messageId, anchorEl) {
        hideEmojiPicker();
        state.reactionTargetId = messageId;
        els.reactionPicker.innerHTML = reactionEmojis.map(function (emoji) {
            return '<button type="button" data-emoji-pick="' + WC.escapeHtml(emoji) + '">' + emoji + '</button>';
        }).join('');

        const rect = anchorEl.getBoundingClientRect();
        const left = Math.min(window.innerWidth - 220, Math.max(8, rect.left));
        const top = Math.max(8, rect.top - 52);
        els.reactionPicker.style.left = left + 'px';
        els.reactionPicker.style.top = top + 'px';
        els.reactionPicker.classList.add('show');
    }

    function hideEmojiPicker() {
        if (els.emojiPicker) els.emojiPicker.classList.remove('show');
    }

    function toggleEmojiPicker() {
        if (!els.emojiPicker) return;
        const open = els.emojiPicker.classList.toggle('show');
        if (open) {
            els.emojiPicker.innerHTML = composeEmojis.map(function (emoji) {
                return '<button type="button" data-compose-emoji="' + emoji + '">' + emoji + '</button>';
            }).join('');
            hideReactionPicker();
        }
    }

    function insertEmojiAtCursor(emoji) {
        const input = els.messageInput;
        if (!input) return;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const value = input.value || '';
        input.value = value.slice(0, start) + emoji + value.slice(end);
        const pos = start + emoji.length;
        input.focus();
        input.setSelectionRange(pos, pos);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function jumpToMessage(messageId) {
        const id = parseInt(messageId, 10);
        if (!id || !els.chatMessages) return;
        const el = els.chatMessages.querySelector('[data-message-id="' + id + '"]');
        if (!el) {
            if (WC.toast) WC.toast('Original message is not in view.', 'info');
            return;
        }
        els.chatMessages.querySelectorAll('.wc-msg.is-jump-target').forEach(function (n) {
            n.classList.remove('is-jump-target');
        });
        el.classList.add('is-jump-target');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { el.classList.remove('is-jump-target'); }, 1600);
    }

    const sendTyping = WC.debounce(async function () {
        if (!state.peerId) return;
        try {
            await WC.api('messages.php', {
                method: 'POST',
                body: { action: 'typing', peer_id: state.peerId },
            });
        } catch (e) { /* ignore */ }
    }, 400);

    async function pollTypingStatus() {
        if (!state.peerId) {
            els.typingIndicator.textContent = '';
            return;
        }
        try {
            const res = await WC.api('messages.php?action=typing_status&peer_id=' + state.peerId);
            els.typingIndicator.textContent = res.data.is_typing ? (state.peer ? state.peer.username + ' is typing...' : 'Typing...') : '';
        } catch (e) {
            els.typingIndicator.textContent = '';
        }
    }

    function startPolling() {
        stopPolling();
        const tick = async function () {
            if (!state.peerId) return;
            try {
                await markRead();
                await loadHistory(false);
                await loadConversations();
            } catch (e) { /* ignore */ }
        };
        state.pollTimer = setInterval(tick, WC.poll.messages || 1000);
        state.typingPollTimer = setInterval(pollTypingStatus, 1200);
        // Immediate fetch so peer messages appear quickly
        tick();
    }

    function stopPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        if (state.typingPollTimer) clearInterval(state.typingPollTimer);
    }

    function setMicRecordingUi(isRecording) {
        if (!els.btnVoice) return;
        els.btnVoice.classList.toggle('is-recording', !!isRecording);
        els.btnVoice.title = isRecording ? 'Recording... click Send to finish' : 'Voice message';
        const icon = els.btnVoice.querySelector('i');
        if (icon) icon.className = isRecording ? 'fa-solid fa-stop' : 'fa-solid fa-microphone';
    }

    function cleanupVoiceCapture(stream) {
        try {
            if (state.voiceProcessor) {
                state.voiceProcessor.disconnect();
                state.voiceProcessor.onaudioprocess = null;
            }
        } catch (e) {}
        state.voiceProcessor = null;
        try {
            if (state.voiceAudioContext && state.voiceAudioContext.state !== 'closed') {
                state.voiceAudioContext.close();
            }
        } catch (e) {}
        state.voiceAudioContext = null;
        if (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
        }
        state.voiceStream = null;
        state.mediaRecorder = null;
    }

    async function sendVoiceBlob(blob, filename, duration) {
        const form = new FormData();
        form.append('action', 'send');
        form.append('peer_id', String(state.peerId));
        form.append('message_type', 'voice');
        form.append('file', new File([blob], filename, { type: blob.type }));
        if (duration) form.append('voice_duration', String(duration));
        if (state.replyTo) form.append('reply_to_id', String(state.replyTo.id));
        clearReply();

        try {
            const res = await WC.api('messages.php?action=send', { method: 'POST', body: form });
            if (res.data && res.data.message) {
                upsertMessage(res.data.message);
                loadConversations().catch(function () {});
                WC.toast('Voice message sent.', 'success');
            }
        } catch (e) {
            WC.toast((e && e.message) ? e.message : 'Failed to send voice message', 'error');
        }
    }

    function stopVoiceRecording(send) {
        if (state.voiceTimerInterval) {
            clearInterval(state.voiceTimerInterval);
            state.voiceTimerInterval = null;
        }
        if (els.voiceRecordingBar) els.voiceRecordingBar.classList.remove('show');
        setMicRecordingUi(false);

        if (!state.mediaRecorder && !state.voiceProcessor) return;

        const stream = state.voiceStream || null;
        const duration = state.voiceStartedAt ? (Date.now() - state.voiceStartedAt) / 1000 : null;
        const pcmChunks = state.voicePcmChunks.slice();
        const sampleRate = state.voiceAudioContext ? state.voiceAudioContext.sampleRate : 44100;
        const recorder = state.mediaRecorder;

        if (!send) {
            state.voiceChunks = [];
            state.voicePcmChunks = [];
            cleanupVoiceCapture(stream);
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.ondataavailable = null;
                    recorder.onstop = null;
                    recorder.stop();
                } catch (e) {}
            }
            return;
        }

        // Prefer WAV (universal browser playback) from PCM capture
        if (pcmChunks.length && WC.encodeWav) {
            let total = 0;
            pcmChunks.forEach(function (c) { total += c.length; });
            const merged = new Float32Array(total);
            let offset = 0;
            pcmChunks.forEach(function (c) {
                merged.set(c, offset);
                offset += c.length;
            });
            state.voicePcmChunks = [];
            state.voiceChunks = [];
            cleanupVoiceCapture(stream);
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.ondataavailable = null;
                    recorder.onstop = null;
                    recorder.stop();
                } catch (e) {}
            }

            if (!merged.length) {
                WC.toast('Recording was empty. Hold a bit longer, then press Send.', 'warning');
                return;
            }

            const blob = WC.encodeWav(merged, sampleRate);
            sendVoiceBlob(blob, 'voice-' + Date.now() + '.wav', duration);
            return;
        }

        // Fallback: MediaRecorder WebM
        if (!recorder) {
            cleanupVoiceCapture(stream);
            WC.toast('Recording was empty.', 'warning');
            return;
        }

        recorder.onstop = async function () {
            cleanupVoiceCapture(stream);
            const mime = recorder.mimeType || 'audio/webm';
            const blob = new Blob(state.voiceChunks, { type: mime.split(';')[0] });
            state.voiceChunks = [];
            state.voicePcmChunks = [];

            if (!blob.size) {
                WC.toast('Recording was empty. Hold a bit longer, then press Send.', 'warning');
                return;
            }

            const ext = (blob.type || '').indexOf('ogg') !== -1 ? 'ogg' : 'webm';
            await sendVoiceBlob(blob, 'voice-' + Date.now() + '.' + ext, duration);
        };

        try {
            if (recorder.state !== 'inactive') recorder.stop();
            else recorder.onstop();
        } catch (e) {
            cleanupVoiceCapture(stream);
            WC.toast('Could not finish recording.', 'error');
        }
    }

    async function startVoiceRecording() {
        if (!state.peerId) {
            WC.toast('Select a conversation first.', 'warning');
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            WC.toast('Voice recording is not supported in this browser.', 'error');
            return;
        }
        if (state.mediaRecorder || state.voiceProcessor) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            state.voiceStream = stream;
            state.voiceChunks = [];
            state.voicePcmChunks = [];
            state.voiceStartedAt = Date.now();

            // Capture PCM for reliable WAV upload (plays everywhere)
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') await ctx.resume();
                const source = ctx.createMediaStreamSource(stream);
                const processor = ctx.createScriptProcessor(4096, 1, 1);
                const mute = ctx.createGain();
                mute.gain.value = 0;
                processor.onaudioprocess = function (ev) {
                    const input = ev.inputBuffer.getChannelData(0);
                    state.voicePcmChunks.push(new Float32Array(input));
                };
                source.connect(processor);
                processor.connect(mute);
                mute.connect(ctx.destination);
                state.voiceAudioContext = ctx;
                state.voiceProcessor = processor;
                // Marker so stopVoiceRecording knows capture is active
                state.mediaRecorder = { state: 'recording', stop: function () {} };
            } catch (pcmErr) {
                // Fallback to MediaRecorder WebM
                let options = {};
                if (window.MediaRecorder) {
                    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                        options = { mimeType: 'audio/webm;codecs=opus' };
                    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                        options = { mimeType: 'audio/webm' };
                    }
                    const recorder = new MediaRecorder(stream, options);
                    state.mediaRecorder = recorder;
                    recorder.ondataavailable = function (ev) {
                        if (ev.data && ev.data.size > 0) state.voiceChunks.push(ev.data);
                    };
                    recorder.start(250);
                } else {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    throw pcmErr;
                }
            }

            if (els.voiceRecordingBar) els.voiceRecordingBar.classList.add('show');
            if (els.voiceTimer) els.voiceTimer.textContent = '0:00';
            setMicRecordingUi(true);

            state.voiceTimerInterval = setInterval(function () {
                const elapsed = Math.floor((Date.now() - state.voiceStartedAt) / 1000);
                if (els.voiceTimer) els.voiceTimer.textContent = formatVoiceDuration(elapsed);
            }, 250);
        } catch (e) {
            WC.toast('Microphone access denied or unavailable.', 'error');
            setMicRecordingUi(false);
        }
    }

    els.conversationList.addEventListener('click', function (ev) {
        const item = ev.target.closest('[data-peer-id]');
        if (!item) return;
        const peerId = parseInt(item.getAttribute('data-peer-id'), 10);
        const conv = cachedConversations.find(function (c) { return c.peer.id === peerId; });
        selectPeer(peerId, conv ? conv.peer : null);
    });

    els.chatMessages.addEventListener('click', function (ev) {
        const replyBtn = ev.target.closest('[data-reply]');
        if (replyBtn) {
            const id = parseInt(replyBtn.getAttribute('data-reply'), 10);
            const msg = state.messages.find(function (m) { return m.id === id; });
            if (msg) setReply(msg);
            return;
        }

        const delBtn = ev.target.closest('[data-delete]');
        if (delBtn) {
            deleteMessage(parseInt(delBtn.getAttribute('data-delete'), 10));
            return;
        }

        const reactOpen = ev.target.closest('[data-react-open]');
        if (reactOpen) {
            showReactionPicker(parseInt(reactOpen.getAttribute('data-react-open'), 10), reactOpen);
            return;
        }

        const reactToggle = ev.target.closest('[data-react-toggle]');
        if (reactToggle) {
            toggleReaction(
                parseInt(reactToggle.getAttribute('data-react-toggle'), 10),
                reactToggle.getAttribute('data-emoji')
            );
            return;
        }

        const jumpBtn = ev.target.closest('[data-jump-to]');
        if (jumpBtn) {
            jumpToMessage(jumpBtn.getAttribute('data-jump-to'));
            return;
        }

        const callBackBtn = ev.target.closest('[data-call-back]');
        if (callBackBtn) {
            callBack(callBackBtn.getAttribute('data-call-back'));
            return;
        }

        const voiceBtn = ev.target.closest('[data-voice-play]');
        if (voiceBtn && WC.VoicePlayer) {
            WC.VoicePlayer.toggle(voiceBtn);
        }
    });

    els.reactionPicker.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-emoji-pick]');
        if (!btn || !state.reactionTargetId) return;
        toggleReaction(state.reactionTargetId, btn.getAttribute('data-emoji-pick'));
        hideReactionPicker();
    });

    document.addEventListener('click', function (ev) {
        if (!ev.target.closest('#reactionPicker') && !ev.target.closest('[data-react-open]')) {
            hideReactionPicker();
        }
        if (!ev.target.closest('#emojiPicker') && !ev.target.closest('#btnEmoji')) {
            hideEmojiPicker();
        }
    });

    if (els.btnEmoji) {
        els.btnEmoji.addEventListener('click', function (ev) {
            ev.stopPropagation();
            toggleEmojiPicker();
        });
    }

    if (els.emojiPicker) {
        els.emojiPicker.addEventListener('click', function (ev) {
            const btn = ev.target.closest('[data-compose-emoji]');
            if (!btn) return;
            insertEmojiAtCursor(btn.getAttribute('data-compose-emoji'));
        });
    }

    els.btnSend.addEventListener('click', function () {
        sendTextMessage().catch(function (e) { alert(e.message); });
    });

    els.messageInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            sendTextMessage().catch(function (e) { alert(e.message); });
        }
    });

    els.messageInput.addEventListener('input', function () {
        sendTyping();
    });

    if (els.btnCancelReply) els.btnCancelReply.addEventListener('click', clearReply);

    els.btnAttachImage.addEventListener('click', function () { els.imageInput.click(); });
    els.btnAttachFile.addEventListener('click', function () { els.fileInput.click(); });

    els.imageInput.addEventListener('change', function () {
        const file = els.imageInput.files && els.imageInput.files[0];
        els.imageInput.value = '';
        if (file) setPendingAttach(file, 'image');
    });

    els.fileInput.addEventListener('change', function () {
        const file = els.fileInput.files && els.fileInput.files[0];
        els.fileInput.value = '';
        if (file) setPendingAttach(file, 'file');
    });

    if (els.btnClearAttach) {
        els.btnClearAttach.addEventListener('click', function () {
            clearPendingAttach();
            if (els.messageInput && !state.replyTo) {
                els.messageInput.placeholder = 'Type a message...';
            }
        });
    }

    if (els.btnVoice) {
        els.btnVoice.addEventListener('click', function () {
            if (state.mediaRecorder) {
                // Prefer explicit Send; second mic click also sends
                stopVoiceRecording(true);
            } else {
                startVoiceRecording().catch(function (e) {
                    WC.toast((e && e.message) ? e.message : 'Could not start recording.', 'error');
                });
            }
        });
    }

    if (els.btnCancelVoice) {
        els.btnCancelVoice.addEventListener('click', function () {
            stopVoiceRecording(false);
        });
    }

    if (els.btnSendVoice) {
        els.btnSendVoice.addEventListener('click', function () {
            stopVoiceRecording(true);
        });
    }

    els.btnBackToList.addEventListener('click', function () {
        els.shell.classList.remove('has-peer');
        state.peerId = null;
        state.peer = null;
        state.messages = [];
        hideContactInfo();
        updateHeader();
        renderMessages();
        stopPolling();
    });

    function isContactInfoOpen() {
        return !!(els.infoCol && (els.infoCol.classList.contains('show-mobile') || els.infoCol.classList.contains('is-open')));
    }
    function showContactInfo() {
        if (!els.infoCol || !state.peerId) return;
        els.infoCol.classList.add('show-mobile');
        els.infoCol.classList.add('is-open');
    }
    function hideContactInfo() {
        if (!els.infoCol) return;
        els.infoCol.classList.remove('show-mobile');
        els.infoCol.classList.remove('is-open');
    }
    function toggleContactInfo() {
        if (!state.peerId) {
            WC.toast('Select a conversation first.', 'warning');
            return;
        }
        if (isContactInfoOpen()) hideContactInfo();
        else showContactInfo();
    }
    hideContactInfo();

    if (els.btnShowInfo) els.btnShowInfo.addEventListener('click', toggleContactInfo);
    if (els.btnCloseInfo) els.btnCloseInfo.addEventListener('click', hideContactInfo);
    var btnChatHeaderAvatar = document.getElementById('btnChatHeaderAvatar');
    var btnOpenContactInfo = document.getElementById('btnOpenContactInfo');
    if (btnChatHeaderAvatar) btnChatHeaderAvatar.addEventListener('click', toggleContactInfo);
    if (btnOpenContactInfo) btnOpenContactInfo.addEventListener('click', toggleContactInfo);

    if (els.btnVoiceCall) {
        els.btnVoiceCall.addEventListener('click', function () {
            if (!state.peerId) {
                WC.toast('Select a conversation first.', 'warning');
                return;
            }
            if (state.blockStatus) {
                WC.toast(blockBannerText(state.blockStatus) || 'Calling is blocked.', 'error');
                return;
            }
            if (!WC.Calls || typeof WC.Calls.startVoice !== 'function') {
                WC.toast('Calling module failed to load. Refresh the page.', 'error');
                return;
            }
            Promise.resolve(WC.Calls.startVoice(state.peerId)).catch(function (e) {
                WC.toast((e && e.message) ? e.message : 'Unable to start voice call.', 'error');
            });
        });
    }
    if (els.btnVideoCall) {
        els.btnVideoCall.addEventListener('click', function () {
            if (!state.peerId) {
                WC.toast('Select a conversation first.', 'warning');
                return;
            }
            if (state.blockStatus) {
                WC.toast(blockBannerText(state.blockStatus) || 'Calling is blocked.', 'error');
                return;
            }
            if (!WC.Calls || typeof WC.Calls.startVideo !== 'function') {
                WC.toast('Calling module failed to load. Refresh the page.', 'error');
                return;
            }
            Promise.resolve(WC.Calls.startVideo(state.peerId)).catch(function (e) {
                WC.toast((e && e.message) ? e.message : 'Unable to start video call.', 'error');
            });
        });
    }

    async function init() {
        await loadConversations();

        if (state.peerId) {
            const peer = await resolvePeer(state.peerId);
            await selectPeer(state.peerId, peer);
        } else {
            startPolling();
            setInterval(loadConversations, WC.poll.messages || 2500);
        }
    }

    init().catch(function (e) {
        console.error(e);
    });
})();

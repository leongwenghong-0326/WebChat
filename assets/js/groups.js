(function () {
    'use strict';

    window.WC = window.WC || {};

    var composeEmojis = [
        '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤗', '🤔',
        '😎', '😭', '😡', '👍', '👎', '👏', '🙏', '🔥', '❤️', '💯',
        '🎉', '✨', '🌟', '💪', '🤝', '👋', '🫡', '😅', '🥺', '😴'
    ];

    async function loadGroups() {
        var list = WC.$('#groupsList');
        if (!list) return;
        try {
            var res = await WC.api('groups.php?action=list', { method: 'GET' });
            var groups = (res.data && res.data.groups) || [];
            if (!groups.length) {
                list.innerHTML = '<p class="text-muted p-3 mb-0">No groups yet. Create one to get started.</p>';
                return;
            }
            list.innerHTML = groups.map(function (g) {
                var badge = g.unread_count > 0
                    ? '<span class="badge bg-danger rounded-pill">' + g.unread_count + '</span>'
                    : '';
                var avatar = g.avatar || (WC.appUrl + '/assets/images/default-avatar.svg');
                var desc = (g.description || '').trim();
                var sub = g.last_message || (desc ? desc : 'No messages');
                return '<a href="group_chat.php?id=' + g.id + '" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2">' +
                    '<img src="' + WC.escapeHtml(avatar) + '" alt="" class="wc-groups-list-avatar">' +
                    '<div class="min-w-0 flex-grow-1"><strong class="d-block text-truncate">' + WC.escapeHtml(g.name) + '</strong>' +
                    (desc ? ('<small class="text-muted text-truncate d-block">' + WC.escapeHtml(desc) + '</small>') : '') +
                    '<small class="text-muted text-truncate d-block">' +
                    WC.escapeHtml(g.last_message || 'No messages yet') + '</small></div>' + badge + '</a>';
            }).join('');
        } catch (e) {
            WC.toast(e.message || 'Failed to load groups');
        }
    }

    async function createGroup(e) {
        e.preventDefault();
        var name = WC.$('#groupName').value.trim();
        var description = WC.$('#groupDescription').value.trim();
        if (!name) return WC.toast('Group name is required');
        try {
            var res = await WC.api('groups.php?action=create', {
                method: 'POST',
                body: { name: name, description: description }
            });
            var modalEl = WC.$('#createGroupModal');
            if (modalEl && bootstrap.Modal.getInstance(modalEl)) {
                bootstrap.Modal.getInstance(modalEl).hide();
            }
            WC.$('#createGroupForm').reset();
            WC.toast('Group created', 'success');
            var newId = res.data && res.data.id;
            if (newId) {
                window.location.href = 'group_chat.php?id=' + newId;
                return;
            }
            loadGroups();
        } catch (err) {
            WC.toast(err.message);
        }
    }

    function initGroupsPage() {
        if (!WC.$('#groupsList')) return;
        loadGroups();
        var createForm = WC.$('#createGroupForm');
        if (createForm) createForm.addEventListener('submit', createGroup);
    }

    var state = {
        groupId: null,
        group: null,
        myRole: null,
        members: [],
        messages: [],
        lastMessageId: 0,
        replyTo: null,
        pollTimer: null,
        typingTimer: null,
        pendingAttach: null,
        pendingAttachUrl: null,
        mediaRecorder: null,
        voiceChunks: [],
        voicePcmChunks: [],
        voiceAudioContext: null,
        voiceProcessor: null,
        voiceStream: null,
        voiceStartedAt: null,
        voiceTimerInterval: null,
        reactionTargetId: null,
        addMemberModal: null,
        callModal: null,
        callType: 'voice',
        selectedCalleeIds: []
    };

    var els = {};

    function canManage() {
        return state.myRole === 'owner' || state.myRole === 'admin';
    }

    function cacheEls() {
        els = {
            shell: document.getElementById('groupChatShell'),
            messages: document.getElementById('groupMessages'),
            headerName: document.getElementById('groupHeaderName'),
            headerStatus: document.getElementById('groupHeaderStatus'),
            headerAvatar: document.getElementById('groupHeaderAvatar'),
            infoAvatar: document.getElementById('groupInfoAvatar'),
            btnGroupAvatar: document.getElementById('btnGroupAvatar'),
            btnGroupAvatarInfo: document.getElementById('btnGroupAvatarInfo'),
            groupAvatarInput: document.getElementById('groupAvatarInput'),
            groupAvatarEditBadgeInfo: document.getElementById('groupAvatarEditBadgeInfo'),
            groupAvatarHint: document.getElementById('groupAvatarHint'),
            groupInfoAvatarBlock: document.getElementById('groupInfoAvatarBlock'),
            groupInfoName: document.getElementById('groupInfoName'),
            groupInfoDescription: document.getElementById('groupInfoDescription'),
            btnEditGroupInfo: document.getElementById('btnEditGroupInfo'),
            editGroupForm: document.getElementById('editGroupForm'),
            editGroupName: document.getElementById('editGroupName'),
            editGroupDescription: document.getElementById('editGroupDescription'),
            editGroupModalEl: document.getElementById('editGroupModal'),
            typing: document.getElementById('groupTyping'),
            input: document.getElementById('groupMessageInput'),
            btnSend: document.getElementById('btnGroupSendMessage'),
            btnAttachImage: document.getElementById('btnGroupAttachImage'),
            btnAttachFile: document.getElementById('btnGroupAttachFile'),
            btnCancelReply: document.getElementById('btnGroupCancelReply'),
            btnEmoji: document.getElementById('btnGroupEmoji'),
            btnVoice: document.getElementById('btnGroupVoice'),
            emojiPicker: document.getElementById('groupEmojiPicker'),
            imageInput: document.getElementById('groupImageInput'),
            fileInput: document.getElementById('groupFileInput'),
            attachPreview: document.getElementById('groupAttachPreview'),
            attachPreviewImg: document.getElementById('groupAttachPreviewImg'),
            attachPreviewTitle: document.getElementById('groupAttachPreviewTitle'),
            attachPreviewName: document.getElementById('groupAttachPreviewName'),
            btnClearAttach: document.getElementById('btnGroupClearAttach'),
            voiceBar: document.getElementById('groupVoiceRecordingBar'),
            voiceTimer: document.getElementById('groupVoiceTimer'),
            btnCancelVoice: document.getElementById('btnGroupCancelVoice'),
            btnSendVoice: document.getElementById('btnGroupSendVoice'),
            members: document.getElementById('groupMembers'),
            infoCol: document.getElementById('groupInfoCol'),
            btnShowInfo: document.getElementById('btnShowGroupInfo'),
            btnCloseInfo: document.getElementById('btnCloseGroupInfo'),
            btnLeave: document.getElementById('btnLeaveGroup'),
            btnDelete: document.getElementById('btnDeleteGroup'),
            btnAddMember: document.getElementById('btnAddMember'),
            reactionPicker: document.getElementById('groupReactionPicker'),
            addMemberForm: document.getElementById('addMemberForm'),
            addMemberSelect: document.getElementById('addMemberSelect'),
            addMemberHint: document.getElementById('addMemberHint'),
            btnConfirmAdd: document.getElementById('btnConfirmAddMember'),
            btnVoiceCall: document.getElementById('btnGroupVoiceCall'),
            btnVideoCall: document.getElementById('btnGroupVideoCall'),
            callModalEl: document.getElementById('groupCallModal'),
            callMemberList: document.getElementById('groupCallMemberList'),
            callModalTitle: document.getElementById('groupCallModalTitle'),
            btnStartCall: document.getElementById('btnStartGroupCall'),
            btnStartCallIcon: document.getElementById('btnStartGroupCallIcon'),
            btnStartCallLabel: document.getElementById('btnStartGroupCallLabel')
        };
    }

    function formatVoiceDuration(sec) {
        if (!sec) return '0:00';
        var s = Math.round(sec);
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + String(r).padStart(2, '0');
    }

    function mediaUrl(msg) {
        return msg.file_url || msg.media_url || null;
    }

    function isMine(msg) {
        if (typeof msg.is_mine === 'boolean') return msg.is_mine;
        return !!(msg.sender && msg.sender.id === WC.userId);
    }

    function replyLabel(reply) {
        if (!reply) return '';
        if (reply.is_deleted) return 'Original message deleted';
        var t = reply.message_type || 'text';
        if (t === 'image') return 'Photo';
        if (t === 'file') return reply.file_name || 'File';
        if (t === 'voice') return 'Voice message';
        return ((reply.body || '').trim()) || 'Message';
    }

    function replyQuoteHtml(reply) {
        var id = reply && reply.id ? String(reply.id) : '';
        return '<button type="button" class="wc-msg-reply" data-jump-to="' + WC.escapeHtml(id) + '" title="View original message">' +
            '<div class="wc-msg-reply-label">Reply</div>' +
            '<div class="wc-msg-reply-text">' + WC.escapeHtml(replyLabel(reply)) + '</div></button>';
    }

    function messageBodyHtml(msg) {
        if (msg.is_deleted) {
            return '<div class="wc-msg-text text-muted">Message deleted</div>';
        }
        var html = '';
        if (msg.reply_to) html += replyQuoteHtml(msg.reply_to);
        var url = mediaUrl(msg);
        if (msg.message_type === 'text') {
            html += '<div class="wc-msg-text">' + WC.escapeHtml(msg.body || '').replace(/\n/g, '<br>') + '</div>';
        } else if (msg.message_type === 'image' && url) {
            html += '<div class="wc-msg-media"><a href="' + WC.escapeHtml(url) + '" target="_blank" rel="noopener"><img src="' + WC.escapeHtml(url) + '" alt="Image"></a></div>';
            if (msg.body) html += '<div class="wc-msg-text mt-1">' + WC.escapeHtml(msg.body) + '</div>';
        } else if (msg.message_type === 'file' && url) {
            html += '<div class="wc-msg-file"><a href="' + WC.escapeHtml(url) + '" target="_blank" rel="noopener"><i class="fa-solid fa-file"></i> ' +
                WC.escapeHtml(msg.file_name || 'Download file') + '</a></div>';
            if (msg.body) html += '<div class="wc-msg-text mt-1">' + WC.escapeHtml(msg.body) + '</div>';
        } else if (msg.message_type === 'voice' && url) {
            var dur = msg.voice_duration ? formatVoiceDuration(msg.voice_duration) : '0:00';
            var durAttr = msg.voice_duration != null ? String(msg.voice_duration) : '';
            html += '<div class="wc-msg-voice" data-voice-src="' + WC.escapeHtml(url) + '" data-voice-duration="' + WC.escapeHtml(durAttr) + '">' +
                '<button type="button" class="wc-voice-btn" data-voice-play aria-label="Play voice message"><i class="fa-solid fa-play"></i></button>' +
                '<div class="wc-voice-track"><div class="wc-voice-fill"></div></div>' +
                '<span class="wc-voice-time">' + dur + '</span></div>';
        } else if (msg.message_type === 'call') {
            html += renderGroupCallLogHtml(msg);
        }
        return html;
    }

    function renderGroupCallLogHtml(msg) {
        var info = msg.call_info || {};
        var outcome = info.outcome || 'ended';
        var isVideo = info.call_type === 'video';
        var typeLabel = isVideo ? 'Video call' : 'Voice call';
        var declined = outcome === 'rejected' || outcome === 'missed' || outcome === 'cancelled';
        var dur = '';
        if (outcome === 'ended' && (info.duration != null || msg.voice_duration != null)) {
            dur = formatVoiceDuration(info.duration != null ? info.duration : msg.voice_duration);
        }
        var subtitle = '';
        if (outcome === 'rejected') subtitle = 'Declined';
        else if (outcome === 'missed') subtitle = 'No answer';
        else if (outcome === 'cancelled') subtitle = 'Cancelled';
        else if (outcome === 'ended') subtitle = dur;
        var count = info.participant_count || (info.participants && info.participants.length) || 0;
        var faces = '';
        if (info.participants && info.participants.length) {
            faces = '<div class="wc-call-log-faces">' + info.participants.slice(0, 3).map(function (p) {
                return '<img src="' + WC.escapeHtml(p.avatar || '') + '" alt="">';
            }).join('') +
                (info.participants.length > 3 ? '<span class="wc-call-log-more">+' + (info.participants.length - 3) + '</span>' : '') +
                '</div>';
        }
        var iconClass = isVideo
            ? (declined ? 'fa-solid fa-video-slash' : 'fa-solid fa-video')
            : (declined ? 'fa-solid fa-phone-slash' : 'fa-solid fa-phone');
        var stateClass = declined ? 'is-declined' : 'is-ok';
        var callType = isVideo ? 'video' : 'voice';
        var myId = parseInt(WC.userId, 10) || 0;
        var peerIds = (info.participants || []).map(function (p) { return parseInt(p.id, 10); })
            .filter(function (id) { return id && id !== myId; });
        if (!peerIds.length && info.caller_id) {
            var cid = parseInt(info.caller_id, 10);
            if (cid && cid !== myId) peerIds = [cid];
        }
        var idsAttr = peerIds.join(',');
        return '<button type="button" class="wc-call-log ' + stateClass + '" data-group-call-back="' + callType +
            '" data-call-peers="' + WC.escapeHtml(idsAttr) + '" title="Call back">' +
            '<div class="wc-call-log-icon"><i class="' + iconClass + '"></i></div>' +
            '<div class="wc-call-log-body">' +
            '<div class="wc-call-log-title">' + typeLabel + '</div>' +
            (subtitle ? ('<div class="wc-call-log-sub"><span class="wc-call-log-arrow"><i class="fa-solid fa-arrow-down"></i></span> ' +
                WC.escapeHtml(subtitle) + (count > 1 ? (' · ' + count + ' people') : '') + '</div>') : '') +
            faces +
            '</div></button>';
    }

    function groupCallBack(callType, peerIdsCsv) {
        var type = callType === 'video' ? 'video' : 'voice';
        var ids = String(peerIdsCsv || '').split(',').map(function (x) { return parseInt(x, 10); })
            .filter(function (id) { return id && id !== WC.userId; });
        if (!ids.length) {
            // Fallback: open member picker
            openCallPicker(type);
            return;
        }
        if (!WC.Calls || typeof WC.Calls.startMulti !== 'function') {
            WC.toast('Calling module failed to load. Refresh the page.', 'error');
            return;
        }
        Promise.resolve(WC.Calls.startMulti(ids, type, state.groupId)).catch(function (e) {
            WC.toast((e && e.message) ? e.message : 'Unable to start call.', 'error');
        });
    }

    function reactionsHtml(msg) {
        if (!msg.reactions || !msg.reactions.length) return '';
        return '<div class="wc-msg-reactions">' + msg.reactions.map(function (r) {
            var cls = r.reacted ? 'wc-reaction-chip active' : 'wc-reaction-chip';
            return '<button type="button" class="' + cls + '" data-react-toggle="' + msg.id + '" data-emoji="' + WC.escapeHtml(r.emoji) + '">' +
                WC.escapeHtml(r.emoji) + ' ' + r.count + '</button>';
        }).join('') + '</div>';
    }

    function deliveryLabel(status, isMineMsg) {
        if (!isMineMsg) return '';
        if (status === 'read') return '<span class="wc-msg-status read" title="Read">✓✓ Read</span>';
        if (status === 'delivered') return '<span class="wc-msg-status" title="Delivered">✓✓</span>';
        return '<span class="wc-msg-status" title="Sent">✓</span>';
    }

    function applyReceipts(receipts) {
        if (!receipts || !receipts.length) return false;
        var changed = false;
        receipts.forEach(function (r) {
            var id = parseInt(r.id, 10);
            var status = r.delivery_status;
            var msg = state.messages.find(function (m) { return m.id === id; });
            if (!msg || !isMine(msg)) return;
            if (msg.delivery_status === status) return;
            msg.delivery_status = status;
            if (typeof r.read_count === 'number') msg.read_count = r.read_count;
            changed = true;

            var root = els.messages && els.messages.querySelector('[data-message-id="' + id + '"]');
            if (!root) return;
            var meta = root.querySelector('.wc-msg-meta');
            if (!meta) return;
            var existing = meta.querySelector('.wc-msg-status');
            var html = deliveryLabel(status, true);
            if (existing) {
                if (html) existing.outerHTML = html;
                else existing.remove();
            } else if (html) {
                meta.insertAdjacentHTML('beforeend', html);
            }
        });
        return changed;
    }

    function messageHtml(msg) {
        var mine = isMine(msg);
        var actions = msg.is_deleted ? '' : (
            '<div class="wc-msg-actions">' +
            '<button type="button" class="wc-msg-action-btn" data-reply="' + msg.id + '" title="Reply"><i class="fa-solid fa-reply"></i></button>' +
            '<button type="button" class="wc-msg-action-btn" data-react-open="' + msg.id + '" title="React"><i class="fa-regular fa-face-smile"></i></button>' +
            (mine ? '<button type="button" class="wc-msg-action-btn text-danger" data-delete="' + msg.id + '" title="Delete"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</div>'
        );

        var avatar = '';
        var sender = '';
        if (!mine && msg.sender) {
            avatar = '<img src="' + WC.escapeHtml(msg.sender.avatar) + '" class="wc-msg-avatar" alt="">';
            sender = '<div class="wc-msg-sender">' + WC.escapeHtml(msg.sender.username) + '</div>';
        }

        var timeLabel = (WC.formatTime ? WC.formatTime(msg.created_at) : (msg.created_label || ''));

        var isCall = msg.message_type === 'call';
        return '<div class="wc-msg ' + (mine ? 'mine' : 'them') + (msg.is_deleted ? ' deleted' : '') + (isCall ? ' wc-msg-call' : '') + '" data-message-id="' + msg.id + '">' +
            avatar +
            '<div class="wc-msg-bubble' + (isCall ? ' wc-call-bubble' : '') + '">' +
            sender +
            messageBodyHtml(msg) +
            reactionsHtml(msg) +
            '<div class="wc-msg-meta"><span>' + WC.escapeHtml(timeLabel) + '</span>' +
            deliveryLabel(msg.delivery_status || 'sent', mine) +
            '</div>' +
            actions +
            '</div></div>';
    }

    function renderMessages() {
        if (!els.messages) return;
        if (!state.messages.length) {
            els.messages.innerHTML = '<div class="wc-chat-empty"><p class="mb-0">No messages yet. Say hello!</p></div>';
            return;
        }
        els.messages.innerHTML = state.messages.map(messageHtml).join('');
        els.messages.scrollTop = els.messages.scrollHeight;
        syncReplyUi();
    }

    function upsertMessage(msg) {
        if (!msg) return;
        var idx = -1;
        if (msg.id) {
            idx = state.messages.findIndex(function (m) { return m.id === msg.id; });
        }
        if (idx >= 0) state.messages[idx] = Object.assign({}, state.messages[idx], msg);
        else state.messages.push(msg);
        state.messages.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
        if (msg.id && msg.id > state.lastMessageId) state.lastMessageId = msg.id;
        renderMessages();
    }

    function syncReplyUi(opts) {
        opts = opts || {};
        if (!els.input) return;
        document.querySelectorAll('#groupMessages .wc-msg.is-reply-target').forEach(function (el) {
            el.classList.remove('is-reply-target');
        });
        if (state.replyTo) {
            els.input.placeholder = 'Reply: ' + replyLabel(state.replyTo);
            if (els.btnCancelReply) els.btnCancelReply.classList.remove('d-none');
            var target = els.messages && els.messages.querySelector('[data-message-id="' + state.replyTo.id + '"]');
            if (target) target.classList.add('is-reply-target');
            if (opts.focus) els.input.focus();
        } else {
            els.input.placeholder = state.pendingAttach ? 'Add a caption (optional)...' : 'Type a message...';
            if (els.btnCancelReply) els.btnCancelReply.classList.add('d-none');
        }
    }

    function setReply(msg) {
        state.replyTo = msg;
        syncReplyUi({ focus: true });
    }

    function clearReply() {
        state.replyTo = null;
        syncReplyUi();
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
        syncReplyUi();
    }

    function setPendingAttach(file, type) {
        clearPendingAttach();
        state.pendingAttach = { file: file, type: type };
        if (type === 'image') {
            state.pendingAttachUrl = URL.createObjectURL(file);
            if (els.attachPreviewImg) {
                els.attachPreviewImg.src = state.pendingAttachUrl;
                els.attachPreviewImg.classList.remove('d-none');
            }
            if (els.attachPreviewTitle) els.attachPreviewTitle.textContent = 'Photo';
        } else {
            if (els.attachPreviewImg) els.attachPreviewImg.classList.add('d-none');
            if (els.attachPreviewTitle) els.attachPreviewTitle.textContent = 'File';
        }
        if (els.attachPreviewName) els.attachPreviewName.textContent = file.name;
        if (els.attachPreview) els.attachPreview.classList.add('show');
        syncReplyUi({ focus: true });
    }

    async function uploadGroupAvatar(file) {
        if (!file || !state.groupId) return;
        if (!canManage()) {
            WC.toast('Only owners and admins can change the group photo.', 'warning');
            return;
        }
        var fd = new FormData();
        fd.append('action', 'avatar');
        fd.append('group_id', String(state.groupId));
        fd.append('avatar', file);
        try {
            var res = await WC.api('groups.php?action=avatar', { method: 'POST', formData: fd });
            var url = (res.data && res.data.avatar) || '';
            if (url) {
                if (els.headerAvatar) els.headerAvatar.src = url;
                if (els.infoAvatar) els.infoAvatar.src = url;
                if (state.group) state.group.avatar = url;
            }
            WC.toast('Group photo updated.', 'success');
        } catch (e) {
            WC.toast((e && e.message) ? e.message : 'Unable to upload group photo.', 'error');
        }
    }

    function updateRoleUi() {
        if (els.btnAddMember) els.btnAddMember.classList.toggle('d-none', !canManage());
        if (els.btnLeave) els.btnLeave.classList.toggle('d-none', state.myRole === 'owner' || !state.myRole);
        if (els.btnDelete) els.btnDelete.classList.toggle('d-none', state.myRole !== 'owner');
        var manage = canManage();
        if (els.btnGroupAvatar) {
            els.btnGroupAvatar.disabled = false;
            els.btnGroupAvatar.title = 'Group info';
        }
        if (els.btnGroupAvatarInfo) {
            els.btnGroupAvatarInfo.disabled = !manage;
            els.btnGroupAvatarInfo.title = manage ? 'Change group photo' : 'Group photo';
        }
        if (els.btnEditGroupInfo) els.btnEditGroupInfo.classList.toggle('d-none', !manage);
        if (els.groupAvatarEditBadgeInfo) els.groupAvatarEditBadgeInfo.classList.toggle('d-none', !manage);
        if (els.groupAvatarHint) els.groupAvatarHint.classList.toggle('d-none', !manage);
    }

    function renderMembers(members) {
        state.members = members || [];
        if (!els.members) return;
        if (!state.members.length) {
            els.members.innerHTML = '<li class="list-group-item text-muted">No members</li>';
            return;
        }
        els.members.innerHTML = state.members.map(function (m) {
            var removeBtn = '';
            if (canManage() && m.id !== WC.userId && m.role !== 'owner') {
                if (!(state.myRole === 'admin' && m.role === 'admin')) {
                    removeBtn = '<button type="button" class="btn btn-outline-danger btn-sm" data-remove-member="' +
                        m.id + '" title="Remove"><i class="fa-solid fa-user-minus"></i></button>';
                }
            }
            return '<li class="list-group-item d-flex align-items-center gap-2">' +
                '<img src="' + WC.escapeHtml(m.avatar) + '" class="wc-avatar" alt="" style="width:36px;height:36px">' +
                '<div class="min-w-0 flex-grow-1"><div class="text-truncate">' + WC.escapeHtml(m.username) +
                (m.id === WC.userId ? ' <span class="text-muted">(you)</span>' : '') + '</div>' +
                '<small class="text-muted text-capitalize">' + WC.escapeHtml(m.role) + '</small></div>' +
                '<div class="wc-member-actions">' + removeBtn + '</div></li>';
        }).join('');
    }

    async function loadGroupInfo() {
        var res = await WC.api('groups.php?action=get', { method: 'GET', query: { group_id: state.groupId } });
        state.group = res.data.group;
        state.myRole = state.group.my_role || null;
        if (els.headerName) els.headerName.textContent = state.group.name;
        var avatarUrl = state.group.avatar || (WC.appUrl + '/assets/images/default-avatar.svg');
        if (els.headerAvatar) els.headerAvatar.src = avatarUrl;
        if (els.infoAvatar) els.infoAvatar.src = avatarUrl;
        if (els.groupInfoName) els.groupInfoName.textContent = state.group.name || 'Group';
        if (els.groupInfoDescription) {
            var desc = (state.group.description || '').trim();
            els.groupInfoDescription.textContent = desc || 'No description';
            els.groupInfoDescription.classList.toggle('fst-italic', !desc);
        }
        var count = (res.data.members || []).length;
        if (els.headerStatus) {
            els.headerStatus.textContent = count + ' member' + (count === 1 ? '' : 's') +
                (state.myRole ? ' · ' + state.myRole : '');
        }
        renderMembers(res.data.members || []);
        updateRoleUi();
    }

    async function loadMessages(initial) {
        // Always fetch latest window so deletes and read ticks stay synced.
        var query = { group_id: state.groupId, limit: 80 };
            var res = await WC.api('groups.php?action=messages', { method: 'GET', query: query });
            var messages = (res.data && res.data.messages) || [];
        var prevLast = state.lastMessageId;
        var byId = {};
        state.messages.forEach(function (m) { byId[m.id] = m; });

        messages.forEach(function (m) {
            var old = byId[m.id];
            if (old) {
                byId[m.id] = Object.assign({}, old, m);
            } else {
                byId[m.id] = m;
            }
            if (m.id > state.lastMessageId) state.lastMessageId = m.id;
        });

        // Keep any optimistic temps; rebuild from server window + older local outside window
        var windowIds = {};
        messages.forEach(function (m) { windowIds[m.id] = true; });
        var merged = Object.keys(byId).map(function (k) { return byId[k]; });
        merged.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
        state.messages = merged;

        var needRender = initial || state.lastMessageId > prevLast;
        if (!needRender) {
            // Still re-render if a delete/read status changed in the window
            needRender = messages.some(function (m) {
                var old = state.messages.find(function (x) { return x.id === m.id; });
                return old && (old.is_deleted !== m.is_deleted || old.delivery_status !== m.delivery_status);
            });
        }
        // Simpler: always render after merge (group chat volume is small)
        renderMessages();
        applyReceipts((res.data && res.data.receipts) || []);

            if (initial) {
                await WC.api('groups.php?action=mark_read', {
                    method: 'POST',
                body: { group_id: state.groupId }
            }).catch(function () {});
        }
        var typing = (res.data && res.data.typing) || [];
        if (els.typing) {
            els.typing.textContent = typing.length ? (typing.join(', ') + ' typing...') : '';
        }
    }

    function sendTyping() {
        WC.api('groups.php?action=typing', {
            method: 'POST',
            body: { group_id: state.groupId }
        }).catch(function () {});
    }

    async function sendComposerMessage() {
        var body = (els.input && els.input.value || '').trim();
        var attach = state.pendingAttach;
        if (!attach && !body) return;

        var replySnap = state.replyTo;
        try {
            if (attach) {
                var fd = new FormData();
                fd.append('group_id', String(state.groupId));
                fd.append('message_type', attach.type);
                fd.append('file', attach.file);
                if (body) fd.append('body', body);
                if (replySnap) fd.append('reply_to_id', String(replySnap.id));
                els.input.value = '';
                clearPendingAttach();
                clearReply();
                var res = await WC.api('groups.php?action=send', { method: 'POST', formData: fd });
                if (res.data) upsertMessage(res.data);
            } else {
                var payload = {
                    group_id: state.groupId,
                    message_type: 'text',
                    body: body
                };
                if (replySnap) payload.reply_to_id = replySnap.id;
                els.input.value = '';
                clearReply();
                var res2 = await WC.api('groups.php?action=send', { method: 'POST', body: payload });
                if (res2.data) upsertMessage(res2.data);
            }
            if (els.input) els.input.style.height = 'auto';
        } catch (err) {
            WC.toast(err.message || 'Failed to send');
        }
    }

    function hideEmojiPicker() {
        if (els.emojiPicker) els.emojiPicker.classList.remove('show');
    }

    function toggleEmojiPicker() {
        if (!els.emojiPicker) return;
        var open = els.emojiPicker.classList.toggle('show');
        if (open) {
            els.emojiPicker.innerHTML = composeEmojis.map(function (emoji) {
                return '<button type="button" data-compose-emoji="' + emoji + '">' + emoji + '</button>';
            }).join('');
            hideReactionPicker();
        }
    }

    function insertEmojiAtCursor(emoji) {
        var input = els.input;
        if (!input) return;
        var start = input.selectionStart || 0;
        var end = input.selectionEnd || 0;
        var value = input.value || '';
        input.value = value.slice(0, start) + emoji + value.slice(end);
        var pos = start + emoji.length;
        input.focus();
        input.setSelectionRange(pos, pos);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function hideReactionPicker() {
        if (els.reactionPicker) els.reactionPicker.classList.remove('show');
        state.reactionTargetId = null;
    }

    function showReactionPicker(messageId, anchorEl) {
        if (!els.reactionPicker) return;
        state.reactionTargetId = messageId;
        var emojis = WC.reactionEmojis || ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        els.reactionPicker.innerHTML = emojis.map(function (emoji) {
            return '<button type="button" data-pick-emoji="' + emoji + '">' + emoji + '</button>';
        }).join('');
        els.reactionPicker.classList.add('show');
        var rect = anchorEl.getBoundingClientRect();
        var left = rect.left;
        var top = rect.top - 48;
        if (left + 220 > window.innerWidth) left = window.innerWidth - 230;
        if (top < 8) top = rect.bottom + 8;
        els.reactionPicker.style.left = left + 'px';
        els.reactionPicker.style.top = top + 'px';
        hideEmojiPicker();
    }

    async function toggleReaction(messageId, emoji) {
        try {
            await WC.api('groups.php?action=react', {
                method: 'POST',
                body: { message_id: messageId, emoji: emoji }
            });
            var res = await WC.api('groups.php?action=messages', {
                method: 'GET',
                query: { group_id: state.groupId, limit: 80 }
            });
            var messages = (res.data && res.data.messages) || [];
            var found = messages.find(function (m) { return m.id === messageId; });
            if (found) upsertMessage(found);
            else {
                state.messages = messages;
                renderMessages();
            }
        } catch (e) {
            WC.toast(e.message || 'Failed to react');
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('Delete this message?')) return;
        try {
            await WC.api('groups.php?action=delete_message', {
                method: 'POST',
                body: { message_id: messageId }
            });
            state.messages = state.messages.map(function (m) {
                if (m.id === messageId) {
                    return Object.assign({}, m, { is_deleted: true, body: null });
                }
                return m;
            });
            renderMessages();
        } catch (e) {
            WC.toast(e.message || 'Failed to delete');
        }
    }

    function jumpToMessage(messageId) {
        var id = parseInt(messageId, 10);
        if (!id || !els.messages) return;
        var el = els.messages.querySelector('[data-message-id="' + id + '"]');
        if (!el) {
            WC.toast('Original message is not in view.', 'info');
            return;
        }
        els.messages.querySelectorAll('.wc-msg.is-jump-target').forEach(function (n) {
            n.classList.remove('is-jump-target');
        });
        el.classList.add('is-jump-target');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { el.classList.remove('is-jump-target'); }, 1600);
    }

    function setMicRecordingUi(isRecording) {
        if (!els.btnVoice) return;
        els.btnVoice.classList.toggle('is-recording', !!isRecording);
        els.btnVoice.title = isRecording ? 'Recording...' : 'Voice message';
        var icon = els.btnVoice.querySelector('i');
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
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        state.voiceStream = null;
        state.mediaRecorder = null;
    }

    async function sendVoiceBlob(blob, filename, duration) {
        var fd = new FormData();
        fd.append('group_id', String(state.groupId));
        fd.append('message_type', 'voice');
        fd.append('file', new File([blob], filename, { type: blob.type || 'audio/wav' }));
        if (duration) fd.append('voice_duration', String(duration));
        if (state.replyTo) fd.append('reply_to_id', String(state.replyTo.id));
        clearReply();
        try {
            var res = await WC.api('groups.php?action=send', { method: 'POST', formData: fd });
            if (res.data) upsertMessage(res.data);
            WC.toast('Voice message sent.', 'success');
        } catch (e) {
            WC.toast((e && e.message) ? e.message : 'Failed to send voice message', 'error');
        }
    }

    function stopVoiceRecording(send) {
        if (state.voiceTimerInterval) {
            clearInterval(state.voiceTimerInterval);
            state.voiceTimerInterval = null;
        }
        if (els.voiceBar) els.voiceBar.classList.remove('show');
        setMicRecordingUi(false);
        if (!state.mediaRecorder && !state.voiceProcessor) return;

        var stream = state.voiceStream || null;
        var duration = state.voiceStartedAt ? (Date.now() - state.voiceStartedAt) / 1000 : null;
        var pcmChunks = state.voicePcmChunks.slice();
        var sampleRate = state.voiceAudioContext ? state.voiceAudioContext.sampleRate : 44100;
        var recorder = state.mediaRecorder;

        if (!send) {
            state.voiceChunks = [];
            state.voicePcmChunks = [];
            cleanupVoiceCapture(stream);
            if (recorder && recorder.state !== 'inactive' && typeof recorder.stop === 'function') {
                try { recorder.ondataavailable = null; recorder.onstop = null; recorder.stop(); } catch (e) {}
            }
            return;
        }

        if (pcmChunks.length && WC.encodeWav) {
            var total = 0;
            pcmChunks.forEach(function (c) { total += c.length; });
            var merged = new Float32Array(total);
            var offset = 0;
            pcmChunks.forEach(function (c) { merged.set(c, offset); offset += c.length; });
            state.voicePcmChunks = [];
            state.voiceChunks = [];
            cleanupVoiceCapture(stream);
            if (recorder && recorder.state !== 'inactive' && typeof recorder.stop === 'function') {
                try { recorder.ondataavailable = null; recorder.onstop = null; recorder.stop(); } catch (e) {}
            }
            if (!merged.length) {
                WC.toast('Recording was empty.', 'warning');
                return;
            }
            var wav = WC.encodeWav(merged, sampleRate);
            sendVoiceBlob(wav, 'voice-' + Date.now() + '.wav', duration);
            return;
        }

        if (recorder && typeof recorder.stop === 'function' && recorder.state !== 'inactive') {
            recorder.onstop = function () {
                var blob = new Blob(state.voiceChunks, { type: (recorder.mimeType || 'audio/webm') });
                state.voiceChunks = [];
                cleanupVoiceCapture(stream);
                if (!blob.size) {
                    WC.toast('Recording was empty.', 'warning');
                    return;
                }
                sendVoiceBlob(blob, 'voice-' + Date.now() + '.webm', duration);
            };
            try { recorder.stop(); } catch (e) {
                cleanupVoiceCapture(stream);
                WC.toast('Could not finish recording.', 'error');
            }
        } else {
            cleanupVoiceCapture(stream);
        }
    }

    async function startVoiceRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            WC.toast('Voice recording is not supported in this browser.', 'error');
            return;
        }
        if (state.mediaRecorder || state.voiceProcessor) return;
        try {
            var stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            state.voiceStream = stream;
            state.voiceChunks = [];
            state.voicePcmChunks = [];
            state.voiceStartedAt = Date.now();
            try {
                var AudioCtx = window.AudioContext || window.webkitAudioContext;
                var ctx = new AudioCtx();
                if (ctx.state === 'suspended') await ctx.resume();
                var source = ctx.createMediaStreamSource(stream);
                var processor = ctx.createScriptProcessor(4096, 1, 1);
                var mute = ctx.createGain();
                mute.gain.value = 0;
                processor.onaudioprocess = function (ev) {
                    var input = ev.inputBuffer.getChannelData(0);
                    state.voicePcmChunks.push(new Float32Array(input));
                };
                source.connect(processor);
                processor.connect(mute);
                mute.connect(ctx.destination);
                state.voiceAudioContext = ctx;
                state.voiceProcessor = processor;
                state.mediaRecorder = { state: 'recording', stop: function () {} };
            } catch (pcmErr) {
                var options = {};
                if (window.MediaRecorder) {
                    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
                    else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
                    var recorder = new MediaRecorder(stream, options);
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
            if (els.voiceBar) els.voiceBar.classList.add('show');
            if (els.voiceTimer) els.voiceTimer.textContent = '0:00';
            setMicRecordingUi(true);
            state.voiceTimerInterval = setInterval(function () {
                var elapsed = Math.floor((Date.now() - state.voiceStartedAt) / 1000);
                if (els.voiceTimer) els.voiceTimer.textContent = formatVoiceDuration(elapsed);
            }, 250);
        } catch (e) {
            WC.toast('Microphone access denied or unavailable.', 'error');
            setMicRecordingUi(false);
        }
    }

    async function loadAddableFriends() {
        var select = els.addMemberSelect;
        var hint = els.addMemberHint;
        var submitBtn = els.btnConfirmAdd;
        if (!select) return;
        select.innerHTML = '<option value="">Loading...</option>';
        if (hint) hint.textContent = '';
        try {
            var res = await WC.api('friends.php?action=list', { method: 'GET' });
            var friends = (res.data && res.data.friends) || [];
            var memberIds = {};
            state.members.forEach(function (m) { memberIds[m.id] = true; });
            var available = friends.filter(function (f) { return !memberIds[f.id]; });
            if (!available.length) {
                select.innerHTML = '<option value="">No friends available to add</option>';
                if (hint) {
                    hint.textContent = friends.length
                        ? 'All your friends are already in this group.'
                        : 'Add friends first, then you can invite them here.';
                }
                if (submitBtn) submitBtn.disabled = true;
                return;
            }
            select.innerHTML = '<option value="">Select a friend...</option>' +
                available.map(function (f) {
                    return '<option value="' + f.id + '">' + WC.escapeHtml(f.username) + '</option>';
                }).join('');
            if (submitBtn) submitBtn.disabled = false;
            if (hint) hint.textContent = available.length + ' friend(s) can be added.';
        } catch (e) {
            select.innerHTML = '<option value="">Failed to load friends</option>';
            if (hint) hint.textContent = e.message || 'Could not load friends.';
            if (submitBtn) submitBtn.disabled = true;
        }
    }

    async function addMember(e) {
        e.preventDefault();
        var userId = parseInt(els.addMemberSelect && els.addMemberSelect.value, 10);
        if (!userId) return WC.toast('Select a friend to add');
        if (els.btnConfirmAdd) els.btnConfirmAdd.disabled = true;
        try {
            await WC.api('groups.php?action=add_member', {
                method: 'POST',
                body: { group_id: state.groupId, user_id: userId }
            });
            WC.toast('Member added', 'success');
            if (state.addMemberModal) state.addMemberModal.hide();
            await loadGroupInfo();
        } catch (err) {
            WC.toast(err.message || 'Failed to add member');
        } finally {
            if (els.btnConfirmAdd) els.btnConfirmAdd.disabled = false;
        }
    }

    async function removeMember(userId) {
        if (!confirm('Remove this member from the group?')) return;
        try {
            await WC.api('groups.php?action=remove_member', {
                method: 'POST',
                body: { group_id: state.groupId, user_id: userId }
            });
            WC.toast('Member removed', 'success');
            await loadGroupInfo();
        } catch (err) {
            WC.toast(err.message || 'Failed to remove member');
        }
    }

    function isCalleeSelected(id) {
        return state.selectedCalleeIds.indexOf(id) >= 0;
    }

    function toggleCalleeSelected(id) {
        id = parseInt(id, 10);
        if (!id) return;
        var idx = state.selectedCalleeIds.indexOf(id);
        if (idx >= 0) state.selectedCalleeIds.splice(idx, 1);
        else state.selectedCalleeIds.push(id);
    }

    function renderCallMemberPicker() {
        if (!els.callMemberList) return;
        var others = (state.members || []).filter(function (m) { return m.id !== WC.userId; });
        if (!others.length) {
            els.callMemberList.innerHTML = '<div class="text-muted p-2">No other members to call.</div>';
            if (els.btnStartCall) els.btnStartCall.disabled = true;
            return;
        }
        var selectedCount = state.selectedCalleeIds.length;
        els.callMemberList.innerHTML = others.map(function (m) {
            var active = isCalleeSelected(m.id) ? ' active' : '';
            return '<button type="button" class="list-group-item list-group-item-action wc-call-picker-item d-flex align-items-center gap-2' + active + '" data-call-user="' + m.id + '">' +
                '<img src="' + WC.escapeHtml(m.avatar) + '" class="wc-avatar" alt="" style="width:36px;height:36px">' +
                '<div class="min-w-0 flex-grow-1"><div class="text-truncate fw-semibold">' + WC.escapeHtml(m.username) + '</div>' +
                '<small class="text-muted text-capitalize">' + WC.escapeHtml(m.role || 'member') + '</small></div>' +
                (isCalleeSelected(m.id) ? '<i class="fa-solid fa-check text-primary"></i>' : '<i class="fa-regular fa-circle text-muted"></i>') +
                '</button>';
        }).join('');
        if (els.btnStartCall) els.btnStartCall.disabled = selectedCount === 0;
        if (els.btnStartCallLabel) {
            var verb = state.callType === 'video' ? 'Start video call' : 'Start voice call';
            els.btnStartCallLabel.textContent = selectedCount > 1 ? (verb + ' (' + selectedCount + ')') : verb;
        }
    }

    function openCallPicker(callType) {
        state.callType = callType === 'video' ? 'video' : 'voice';
        state.selectedCalleeIds = [];
        if (els.callModalTitle) {
            els.callModalTitle.textContent = state.callType === 'video' ? 'Video call members' : 'Voice call members';
        }
        if (els.btnStartCallIcon) {
            els.btnStartCallIcon.className = state.callType === 'video' ? 'fa-solid fa-video' : 'fa-solid fa-phone';
        }
        if (els.btnStartCallLabel) {
            els.btnStartCallLabel.textContent = state.callType === 'video' ? 'Start video call' : 'Start voice call';
        }
        renderCallMemberPicker();
        if (!state.callModal && els.callModalEl) {
            state.callModal = bootstrap.Modal.getOrCreateInstance(els.callModalEl);
        }
        if (state.callModal) state.callModal.show();
    }

    function startSelectedGroupCall() {
        var ids = (state.selectedCalleeIds || []).slice();
        if (!ids.length) {
            WC.toast('Select at least one member to call.', 'warning');
            return;
        }
        if (!WC.Calls) {
            WC.toast('Calling module failed to load. Refresh the page.', 'error');
            return;
        }
        if (state.callModal) state.callModal.hide();
        var starter = null;
        if (typeof WC.Calls.startMulti === 'function') {
            starter = WC.Calls.startMulti(ids, state.callType, state.groupId);
        } else if (ids.length === 1) {
            starter = state.callType === 'video'
                ? WC.Calls.startVideo(ids[0])
                : WC.Calls.startVoice(ids[0]);
        } else {
            WC.toast('Multi-member calling is unavailable. Refresh the page.', 'error');
            return;
        }
        Promise.resolve(starter).catch(function (e) {
            WC.toast((e && e.message) ? e.message : 'Unable to start call.', 'error');
        });
    }

    function bindGroupChatEvents() {
        if (els.btnSend) els.btnSend.addEventListener('click', sendComposerMessage);
        if (els.input) {
            els.input.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(120, this.scrollHeight) + 'px';
                clearTimeout(state.typingTimer);
                state.typingTimer = setTimeout(sendTyping, 300);
            });
            els.input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    ev.preventDefault();
                    sendComposerMessage();
                }
            });
        }
        if (els.btnAttachImage) els.btnAttachImage.addEventListener('click', function () { els.imageInput && els.imageInput.click(); });
        if (els.btnAttachFile) els.btnAttachFile.addEventListener('click', function () { els.fileInput && els.fileInput.click(); });
        if (els.imageInput) els.imageInput.addEventListener('change', function (ev) {
            var f = ev.target.files[0];
            if (f) setPendingAttach(f, 'image');
            ev.target.value = '';
        });
        if (els.fileInput) els.fileInput.addEventListener('change', function (ev) {
            var f = ev.target.files[0];
            if (f) setPendingAttach(f, 'file');
            ev.target.value = '';
        });
        if (els.btnClearAttach) els.btnClearAttach.addEventListener('click', clearPendingAttach);
        if (els.btnCancelReply) els.btnCancelReply.addEventListener('click', clearReply);
        if (els.btnEmoji) els.btnEmoji.addEventListener('click', toggleEmojiPicker);
        if (els.emojiPicker) els.emojiPicker.addEventListener('click', function (ev) {
            var btn = ev.target.closest('[data-compose-emoji]');
            if (!btn) return;
            insertEmojiAtCursor(btn.getAttribute('data-compose-emoji'));
        });
        if (els.btnVoice) els.btnVoice.addEventListener('click', function () {
            if (state.mediaRecorder || state.voiceProcessor) stopVoiceRecording(false);
            else startVoiceRecording();
        });
        if (els.btnCancelVoice) els.btnCancelVoice.addEventListener('click', function () { stopVoiceRecording(false); });
        if (els.btnSendVoice) els.btnSendVoice.addEventListener('click', function () { stopVoiceRecording(true); });

        if (els.messages) {
            els.messages.addEventListener('click', function (ev) {
                var callBackBtn = ev.target.closest('[data-group-call-back]');
                if (callBackBtn) {
                    ev.preventDefault();
                    groupCallBack(
                        callBackBtn.getAttribute('data-group-call-back'),
                        callBackBtn.getAttribute('data-call-peers')
                    );
                    return;
                }
                var voiceBtn = ev.target.closest('[data-voice-play]');
                if (voiceBtn && WC.VoicePlayer) {
                    WC.VoicePlayer.toggle(voiceBtn);
                    return;
                }
                var replyBtn = ev.target.closest('[data-reply]');
                if (replyBtn) {
                    var rid = parseInt(replyBtn.getAttribute('data-reply'), 10);
                    var msg = state.messages.find(function (m) { return m.id === rid; });
                    if (msg) setReply(msg);
                    return;
                }
                var reactOpen = ev.target.closest('[data-react-open]');
                if (reactOpen) {
                    showReactionPicker(parseInt(reactOpen.getAttribute('data-react-open'), 10), reactOpen);
                    return;
                }
                var reactToggle = ev.target.closest('[data-react-toggle]');
                if (reactToggle) {
                    toggleReaction(parseInt(reactToggle.getAttribute('data-react-toggle'), 10), reactToggle.getAttribute('data-emoji'));
                    return;
                }
                var delBtn = ev.target.closest('[data-delete]');
                if (delBtn) {
                    deleteMessage(parseInt(delBtn.getAttribute('data-delete'), 10));
                    return;
                }
                var jump = ev.target.closest('[data-jump-to]');
                if (jump) jumpToMessage(jump.getAttribute('data-jump-to'));
            });
        }

        if (els.reactionPicker) {
            els.reactionPicker.addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-pick-emoji]');
                if (!btn || !state.reactionTargetId) return;
                var emoji = btn.getAttribute('data-pick-emoji');
                var mid = state.reactionTargetId;
                hideReactionPicker();
                toggleReaction(mid, emoji);
            });
        }

        document.addEventListener('click', function (ev) {
            if (els.emojiPicker && els.emojiPicker.classList.contains('show')) {
                if (!ev.target.closest('#groupEmojiPicker') && !ev.target.closest('#btnGroupEmoji')) {
                    hideEmojiPicker();
                }
            }
            if (els.reactionPicker && els.reactionPicker.classList.contains('show')) {
                if (!ev.target.closest('#groupReactionPicker') && !ev.target.closest('[data-react-open]')) {
                    hideReactionPicker();
                }
            }
        });

        function openGroupAvatarPicker() {
            if (!canManage()) {
                WC.toast('Only owners and admins can change the group photo.', 'warning');
                return;
            }
            if (els.groupAvatarInput) els.groupAvatarInput.click();
        }
        function isGroupInfoOpen() {
            return !!(els.infoCol && (els.infoCol.classList.contains('show-mobile') || els.infoCol.classList.contains('is-open')));
        }
        function showGroupInfoPanel() {
            if (!els.infoCol) return;
            els.infoCol.classList.add('show-mobile');
            els.infoCol.classList.add('is-open');
            if (els.groupInfoAvatarBlock) els.groupInfoAvatarBlock.classList.remove('d-none');
        }
        function hideGroupInfoDetails() {
            if (!els.infoCol) return;
            els.infoCol.classList.remove('show-mobile');
            els.infoCol.classList.remove('is-open');
        }
        function toggleGroupInfoPanel() {
            if (isGroupInfoOpen()) hideGroupInfoDetails();
            else showGroupInfoPanel();
        }
        // Start with Members panel closed
        hideGroupInfoDetails();
        if (els.btnGroupAvatar) els.btnGroupAvatar.addEventListener('click', toggleGroupInfoPanel);
        var btnOpenGroupInfo = document.getElementById('btnOpenGroupInfo');
        if (btnOpenGroupInfo) btnOpenGroupInfo.addEventListener('click', toggleGroupInfoPanel);
        if (els.btnGroupAvatarInfo) els.btnGroupAvatarInfo.addEventListener('click', openGroupAvatarPicker);
        if (els.btnEditGroupInfo) {
            els.btnEditGroupInfo.addEventListener('click', function () {
                if (!canManage()) return;
                if (els.editGroupName) els.editGroupName.value = (state.group && state.group.name) || '';
                if (els.editGroupDescription) els.editGroupDescription.value = (state.group && state.group.description) || '';
                if (!state.editGroupModal && els.editGroupModalEl) {
                    state.editGroupModal = bootstrap.Modal.getOrCreateInstance(els.editGroupModalEl);
                }
                if (state.editGroupModal) state.editGroupModal.show();
            });
        }
        if (els.editGroupForm) {
            els.editGroupForm.addEventListener('submit', async function (ev) {
                ev.preventDefault();
                if (!canManage()) return;
                var name = (els.editGroupName && els.editGroupName.value || '').trim();
                var description = (els.editGroupDescription && els.editGroupDescription.value || '').trim();
                if (!name) {
                    WC.toast('Group name is required.', 'warning');
                    return;
                }
                try {
                    await WC.api('groups.php?action=update', {
                        method: 'POST',
                        body: { group_id: state.groupId, name: name, description: description }
                    });
                    if (state.editGroupModal) state.editGroupModal.hide();
                    WC.toast('Group updated.', 'success');
                    await loadGroupInfo();
                } catch (e) {
                    WC.toast((e && e.message) ? e.message : 'Unable to update group.', 'error');
                }
            });
        }
        if (els.groupAvatarInput) {
            els.groupAvatarInput.addEventListener('change', function () {
                var file = els.groupAvatarInput.files && els.groupAvatarInput.files[0];
                if (!file) return;
                uploadGroupAvatar(file).finally(function () {
                    els.groupAvatarInput.value = '';
                });
            });
        }

        if (els.btnLeave) {
            els.btnLeave.addEventListener('click', async function () {
            if (!confirm('Leave this group?')) return;
            try {
                    await WC.api('groups.php?action=leave', { method: 'POST', body: { group_id: state.groupId } });
                    window.location.href = 'groups.php';
                } catch (err) { WC.toast(err.message); }
            });
        }
        if (els.btnDelete) {
            els.btnDelete.addEventListener('click', async function () {
                if (!confirm('Delete this group for everyone? This cannot be undone.')) return;
                try {
                    await WC.api('groups.php?action=delete', { method: 'POST', body: { group_id: state.groupId } });
                window.location.href = 'groups.php';
            } catch (err) { WC.toast(err.message); }
        });
        }
        if (els.members) {
            els.members.addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-remove-member]');
                if (!btn) return;
                removeMember(parseInt(btn.getAttribute('data-remove-member'), 10));
            });
        }
        if (els.addMemberForm) els.addMemberForm.addEventListener('submit', addMember);
        var modalEl = document.getElementById('addMemberModal');
        if (modalEl) {
            state.addMemberModal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalEl.addEventListener('show.bs.modal', loadAddableFriends);
        }
        if (els.btnShowInfo) els.btnShowInfo.addEventListener('click', toggleGroupInfoPanel);
        if (els.btnCloseInfo) els.btnCloseInfo.addEventListener('click', hideGroupInfoDetails);

        if (els.btnVoiceCall) {
            els.btnVoiceCall.addEventListener('click', function () { openCallPicker('voice'); });
        }
        if (els.btnVideoCall) {
            els.btnVideoCall.addEventListener('click', function () { openCallPicker('video'); });
        }
        if (els.callMemberList) {
            els.callMemberList.addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-call-user]');
                if (!btn) return;
                toggleCalleeSelected(btn.getAttribute('data-call-user'));
                renderCallMemberPicker();
            });
        }
        if (els.btnStartCall) {
            els.btnStartCall.addEventListener('click', startSelectedGroupCall);
        }
        if (els.callModalEl) {
            state.callModal = bootstrap.Modal.getOrCreateInstance(els.callModalEl);
        }
    }

    async function initGroupChat() {
        var root = document.getElementById('groupChatShell');
        if (!root) return;
        cacheEls();
        state.groupId = parseInt(root.dataset.groupId || WC.initialGroupId || '0', 10);
        if (!state.groupId) return;
        bindGroupChatEvents();
        try {
            await loadGroupInfo();
            await loadMessages(true);
        } catch (e) {
            WC.toast(e.message || 'Failed to load group');
        }
        state.pollTimer = setInterval(function () {
            loadMessages(false).catch(function () {});
        }, WC.poll.messages || 1000);
        window.addEventListener('wc:group-call-logged', function (ev) {
            var gid = ev && ev.detail && ev.detail.group_id;
            if (gid && parseInt(gid, 10) === state.groupId) {
                loadMessages(false).catch(function () {});
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initGroupsPage();
        initGroupChat();
    });
})();

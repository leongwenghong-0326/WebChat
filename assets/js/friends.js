(function () {
    'use strict';

    if (!window.WC) return;

    const els = {
        searchInput: document.getElementById('friendSearchInput'),
        searchResults: document.getElementById('friendSearchResults'),
        incoming: document.getElementById('incomingRequests'),
        outgoing: document.getElementById('outgoingRequests'),
        incomingCount: document.getElementById('incomingCount'),
        outgoingCount: document.getElementById('outgoingCount'),
        friendsList: document.getElementById('friendsList'),
        blockedList: document.getElementById('blockedList'),
    };

    function statusBadge(status) {
        const map = {
            friend: '<span class="badge bg-success">Friends</span>',
            pending_incoming: '<span class="badge bg-warning text-dark">Request received</span>',
            pending_outgoing: '<span class="badge bg-secondary">Request sent</span>',
            none: '<span class="badge bg-light text-dark">Not connected</span>',
        };
        return map[status] || '';
    }

    function userRowHtml(user, actionsHtml) {
        return (
            '<div class="wc-list-item">' +
            '<img src="' + WC.escapeHtml(user.avatar) + '" alt="" class="wc-avatar">' +
            '<span class="' + WC.presenceClass(user.presence) + '" title="' + WC.escapeHtml(user.presence) + '"></span>' +
            '<div class="wc-list-meta">' +
            '<p class="wc-list-title">' + WC.escapeHtml(user.username) + '</p>' +
            '<p class="wc-list-sub">' + WC.escapeHtml(user.status_message || user.last_seen_label || '') + '</p>' +
            '</div>' +
            '<div class="wc-user-actions">' + actionsHtml + '</div>' +
            '</div>'
        );
    }

    function emptyState(text) {
        return '<div class="wc-empty-state">' + WC.escapeHtml(text) + '</div>';
    }

    async function apiPost(action, body) {
        return WC.api('friends.php', {
            method: 'POST',
            body: Object.assign({ action: action }, body || {}),
        });
    }

    function renderSearchResults(results) {
        if (!results.length) {
            els.searchResults.innerHTML = emptyState('No users found.');
            return;
        }

        els.searchResults.innerHTML = results.map(function (user) {
            let actions = statusBadge(user.friendship_status);

            if (user.is_blocked_by_me) {
                actions += ' <button class="btn btn-sm btn-outline-secondary" data-action="unblock" data-id="' + user.id + '">Unblock</button>';
            } else if (user.has_blocked_me) {
                actions += ' <span class="text-muted small">Unavailable</span>';
            } else if (user.friendship_status === 'none') {
                actions += ' <button class="btn btn-sm btn-primary" data-action="send" data-id="' + user.id + '">Add Friend</button>';
            } else if (user.friendship_status === 'pending_incoming') {
                actions += ' <a class="btn btn-sm btn-link" href="' + WC.appUrl + '/friends.php">View requests</a>';
            } else if (user.friendship_status === 'friend') {
                actions += ' <a class="btn btn-sm btn-outline-primary" href="' + WC.appUrl + '/chat.php?peer=' + user.id + '">Message</a>';
                actions += ' <button class="btn btn-sm btn-outline-danger" data-action="block" data-id="' + user.id + '">Block</button>';
            }

            return userRowHtml(user, actions);
        }).join('');
    }

    function renderRequests(incoming, outgoing) {
        els.incomingCount.textContent = String(incoming.length);
        els.outgoingCount.textContent = String(outgoing.length);

        els.incoming.innerHTML = incoming.length
            ? incoming.map(function (req) {
                const u = req.user;
                return userRowHtml(u, (
                    '<button class="btn btn-sm btn-success" data-action="accept" data-id="' + req.id + '">Accept</button>' +
                    '<button class="btn btn-sm btn-outline-danger" data-action="reject" data-id="' + req.id + '">Reject</button>'
                ));
            }).join('')
            : emptyState('No incoming requests.');

        els.outgoing.innerHTML = outgoing.length
            ? outgoing.map(function (req) {
                const u = req.user;
                return userRowHtml(u, (
                    '<button class="btn btn-sm btn-outline-secondary" data-action="cancel" data-id="' + req.id + '">Cancel</button>'
                ));
            }).join('')
            : emptyState('No sent requests.');
    }

    function renderFriends(friends) {
        els.friendsList.innerHTML = friends.length
            ? friends.map(function (user) {
                let actions =
                    '<a class="btn btn-sm btn-primary" href="' + WC.appUrl + '/chat.php?peer=' + user.id + '">Message</a>' +
                    '<button class="btn btn-sm btn-outline-danger" data-action="remove" data-id="' + user.id + '">Remove</button>' +
                    '<button class="btn btn-sm btn-outline-secondary" data-action="block" data-id="' + user.id + '">Block</button>';
                return userRowHtml(user, actions);
            }).join('')
            : emptyState('No friends yet. Search above to connect.');
    }

    function renderBlocked(blocked) {
        els.blockedList.innerHTML = blocked.length
            ? blocked.map(function (user) {
                return userRowHtml(user, (
                    '<button class="btn btn-sm btn-outline-primary" data-action="unblock" data-id="' + user.id + '">Unblock</button>'
                ));
            }).join('')
            : emptyState('No blocked users.');
    }

    async function loadRequests() {
        const res = await WC.api('friends.php?action=requests');
        renderRequests(res.data.incoming || [], res.data.outgoing || []);
    }

    async function loadFriends() {
        const res = await WC.api('friends.php?action=list');
        renderFriends(res.data.friends || []);
    }

    async function loadBlocked() {
        const res = await WC.api('friends.php?action=blocked');
        renderBlocked(res.data.blocked || []);
    }

    async function refreshAll() {
        await Promise.all([loadRequests(), loadFriends(), loadBlocked()]);
    }

    const doSearch = WC.debounce(async function () {
        const q = els.searchInput.value.trim();
        if (q.length < 2) {
            els.searchResults.innerHTML = '';
            return;
        }
        try {
            const res = await WC.api('friends.php?action=search&q=' + encodeURIComponent(q));
            renderSearchResults(res.data.results || []);
        } catch (e) {
            els.searchResults.innerHTML = emptyState(e.message);
        }
    }, 300);

    async function handleAction(action, id) {
        try {
            if (action === 'send') {
                await apiPost('send', { receiver_id: id });
            } else if (action === 'accept' || action === 'reject' || action === 'cancel') {
                await apiPost(action, { request_id: id });
            } else if (action === 'remove') {
                if (!confirm('Remove this friend?')) return;
                await apiPost('remove', { friend_id: id });
            } else if (action === 'block') {
                if (!confirm('Block this user? Friendship and pending requests will be removed.')) return;
                await apiPost('block', { user_id: id });
            } else if (action === 'unblock') {
                if (!confirm('Unblock this user? They will be added back to your friends list.')) return;
                await apiPost('unblock', { user_id: id });
            }
            await refreshAll();
            if (els.searchInput.value.trim().length >= 2) {
                doSearch();
            }
        } catch (e) {
            alert(e.message || 'Action failed');
        }
    }

    document.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = parseInt(btn.getAttribute('data-id'), 10);
        if (!action || !id) return;
        ev.preventDefault();
        handleAction(action, id);
    });

    els.searchInput.addEventListener('input', doSearch);

    refreshAll();
})();

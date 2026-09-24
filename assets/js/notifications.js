(function () {
    'use strict';

    window.WC = window.WC || {};

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text == null ? '' : String(text);
        return d.innerHTML;
    }

    async function updateBadge() {
        try {
            var res = await WC.api('notifications.php?action=unread_count', { method: 'GET' });
            var count = (res.data && res.data.count) || 0;
            var badge = WC.$('#navNotifBadge');
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        } catch (e) {}
    }

    async function loadNotifications() {
        var list = WC.$('#notificationsList');
        if (!list) return;
        try {
            var res = await WC.api('notifications.php?action=list', { method: 'GET' });
            var items = (res.data && res.data.notifications) || [];
            if (!items.length) {
                list.innerHTML = '<p class="text-muted p-4 text-center">No notifications yet.</p>';
                return;
            }
            list.innerHTML = items.map(function (n) {
                var unread = n.is_read ? '' : ' wc-notif-unread';
                var link = n.link ? (n.link.indexOf('http') === 0 ? n.link : WC.appUrl + '/' + n.link.replace(/^\//, '')) : '#';
                return '<a href="' + esc(link) + '" class="list-group-item list-group-item-action' + unread + '" data-id="' + n.id + '">' +
                    '<div class="d-flex w-100 justify-content-between">' +
                    '<strong>' + esc(n.title) + '</strong>' +
                    '<small class="text-muted">' + esc(n.created_label) + '</small></div>' +
                    (n.body ? '<p class="mb-0 small text-muted">' + esc(n.body) + '</p>' : '') +
                    '</a>';
            }).join('');

            WC.$$('#notificationsList .list-group-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    var id = parseInt(el.dataset.id, 10);
                    if (id) {
                        WC.api('notifications.php?action=mark_read', {
                            method: 'POST',
                            body: { id: id }
                        }).then(updateBadge).catch(function () {});
                    }
                });
            });
        } catch (e) {
            WC.toast(e.message);
        }
    }

    async function markAllRead() {
        try {
            await WC.api('notifications.php?action=mark_all_read', { method: 'POST', body: {} });
            loadNotifications();
            updateBadge();
            WC.toast('All marked as read', 'success');
        } catch (e) {
            WC.toast(e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        updateBadge();
        if (WC.poll && WC.poll.notifications) {
            setInterval(updateBadge, WC.poll.notifications);
        }
        loadNotifications();
        var btn = WC.$('#btnMarkAllRead');
        if (btn) btn.addEventListener('click', markAllRead);
    });

    WC.Notifications = { refresh: updateBadge, load: loadNotifications };
})();

(function () {
    'use strict';

    if (!WC.userId) return;

    var avatarInput = WC.$('#avatarInput');
    var profileForm = WC.$('#profileForm');
    var passwordForm = WC.$('#passwordForm');
    var blockedList = WC.$('#blockedList');
    var blockedEmpty = WC.$('#blockedEmpty');

    function updateProfileUi(profile) {
        if (!profile) return;
        var avatarEl = WC.$('#profileAvatar');
        var usernameEl = WC.$('#profileUsername');
        var emailEl = WC.$('#profileEmail');
        if (avatarEl && profile.avatar) avatarEl.src = profile.avatar;
        if (usernameEl) usernameEl.textContent = profile.username;
        if (emailEl) emailEl.textContent = profile.email;
        if (profileForm && profileForm.username) profileForm.username.value = profile.username;
        if (profileForm && profileForm.status_message) {
            profileForm.status_message.value = profile.status_message || '';
        }
    }

    function renderBlocked(list) {
        if (!blockedList) return;
        blockedList.innerHTML = '';

        if (!list || list.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'text-muted small mb-0';
            empty.textContent = 'You have not blocked anyone.';
            blockedList.appendChild(empty);
            return;
        }

        list.forEach(function (user) {
            var item = document.createElement('div');
            item.className = 'list-group-item d-flex align-items-center justify-content-between px-0';
            item.innerHTML =
                '<div class="d-flex align-items-center gap-2">' +
                '<img src="' + WC.escapeHtml(user.avatar) + '" alt="" width="36" height="36" class="rounded-circle" style="object-fit:cover">' +
                '<span>' + WC.escapeHtml(user.username) + '</span>' +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary unblock-btn" data-user-id="' + user.id + '">' +
                '<i class="fa-solid fa-unlock"></i> Unblock</button>';
            blockedList.appendChild(item);
        });

        WC.$$('.unblock-btn', blockedList).forEach(function (btn) {
            btn.addEventListener('click', function () {
                var userId = parseInt(btn.getAttribute('data-user-id'), 10);
                unblockUser(userId, btn);
            });
        });
    }

    function loadBlocked() {
        WC.api('blocks.php?action=list', { silent: true })
            .then(function (res) {
                renderBlocked((res.data && res.data.blocked) || []);
            })
            .catch(function () {
                if (blockedEmpty) {
                    blockedEmpty.textContent = 'Unable to load blocked users.';
                }
            });
    }

    function unblockUser(userId, btn) {
        if (!confirm('Unblock this user? They will be added back to your friends list.')) {
            return;
        }
        btn.disabled = true;
        WC.api('blocks.php?action=unblock', {
            method: 'POST',
            body: { action: 'unblock', user_id: userId }
        })
            .then(function (res) {
                WC.toast('User unblocked. They are back on your friends list.', 'success');
                renderBlocked((res.data && res.data.blocked) || []);
            })
            .catch(function () {
                btn.disabled = false;
            });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var saveBtn = WC.$('#profileSaveBtn');
            if (saveBtn) saveBtn.disabled = true;

            WC.api('profile.php?action=update', {
                method: 'POST',
                body: {
                    action: 'update',
                    username: profileForm.username.value.trim(),
                    status_message: profileForm.status_message.value.trim()
                }
            })
                .then(function (res) {
                    WC.toast('Profile saved.', 'success');
                    updateProfileUi(res.data && res.data.profile);
                })
                .finally(function () {
                    if (saveBtn) saveBtn.disabled = false;
                });
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var saveBtn = WC.$('#passwordSaveBtn');
            if (saveBtn) saveBtn.disabled = true;

            WC.api('profile.php?action=password', {
                method: 'POST',
                body: {
                    action: 'password',
                    current_password: passwordForm.current_password.value,
                    new_password: passwordForm.new_password.value,
                    confirm: passwordForm.confirm.value
                }
            })
                .then(function () {
                    WC.toast('Password updated.', 'success');
                    passwordForm.reset();
                })
                .finally(function () {
                    if (saveBtn) saveBtn.disabled = false;
                });
        });
    }

    if (avatarInput) {
        avatarInput.addEventListener('change', function () {
            var file = avatarInput.files && avatarInput.files[0];
            if (!file) return;

            var formData = new FormData();
            formData.append('action', 'avatar');
            formData.append('avatar', file);

            WC.api('profile.php?action=avatar', {
                method: 'POST',
                formData: formData
            })
                .then(function (res) {
                    WC.toast('Avatar updated.', 'success');
                    updateProfileUi(res.data && res.data.profile);
                    var navAvatar = document.querySelector('.wc-nav-avatar');
                    if (navAvatar && res.data && res.data.profile) {
                        navAvatar.src = res.data.profile.avatar;
                    }
                })
                .finally(function () {
                    avatarInput.value = '';
                });
        });
    }

    loadBlocked();
})();

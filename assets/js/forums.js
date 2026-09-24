(function () {
    'use strict';

    window.WC = window.WC || {};

    var forumId = null;
    var postId = null;

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text == null ? '' : String(text);
        return d.innerHTML;
    }

    async function loadCategories() {
        var el = WC.$('#forumCategories');
        if (!el) return;
        try {
            var res = await WC.api('forums.php?action=categories', { method: 'GET' });
            var forums = (res.data && res.data.forums) || [];
            el.innerHTML = forums.map(function (f) {
                return '<a href="forums.php?forum=' + f.id + '" class="list-group-item list-group-item-action ' +
                    (forumId === f.id ? 'active' : '') + '">' +
                    '<div class="d-flex w-100 justify-content-between"><strong>' + esc(f.name) + '</strong>' +
                    '<span class="badge bg-light text-dark">' + f.post_count + '</span></div>' +
                    '<small>' + esc(f.description) + '</small></a>';
            }).join('');
        } catch (e) {
            WC.toast(e.message);
        }
    }

    async function loadPosts() {
        var el = WC.$('#forumPosts');
        if (!el || !forumId) return;
        try {
            var res = await WC.api('forums.php?action=posts', {
                method: 'GET',
                query: { forum_id: forumId }
            });
            var posts = (res.data && res.data.posts) || [];
            if (!posts.length) {
                el.innerHTML = '<p class="text-muted">No posts yet. Be the first to start a discussion.</p>';
                return;
            }
            el.innerHTML = posts.map(function (p) {
                return '<div class="card wc-forum-card mb-3">' +
                    '<div class="card-body">' +
                    '<h5 class="card-title"><a href="forums.php?post=' + p.id + '">' + esc(p.title) + '</a></h5>' +
                    '<p class="card-text text-muted small">By ' + esc(p.author ? p.author.username : 'Unknown') + ' · ' + esc(p.created_label) + '</p>' +
                    '<div class="d-flex gap-3 text-muted small">' +
                    '<span><i class="fa-regular fa-comment"></i> ' + p.comment_count + '</span>' +
                    '<span><i class="fa-regular fa-heart"></i> ' + p.like_count + '</span>' +
                    '<span><i class="fa-solid fa-share"></i> ' + p.share_count + '</span>' +
                    '</div></div></div>';
            }).join('');
        } catch (e) {
            WC.toast(e.message);
        }
    }

    async function loadPostDetail() {
        var el = WC.$('#forumPostDetail');
        if (!el || !postId) return;
        try {
            var res = await WC.api('forums.php?action=get', {
                method: 'GET',
                query: { post_id: postId }
            });
            var p = res.data;
            var commentsHtml = (p.comments || []).map(function (c) {
                return '<div class="wc-comment mb-3">' +
                    '<img src="' + esc(c.author.avatar) + '" class="wc-nav-avatar" alt="">' +
                    '<div><strong>' + esc(c.author.username) + '</strong> <small class="text-muted">' + esc(c.created_label) + '</small>' +
                    '<p class="mb-0">' + esc(c.content).replace(/\n/g, '<br>') + '</p></div></div>';
            }).join('');
            el.innerHTML =
                '<div class="card wc-forum-card">' +
                '<div class="card-body">' +
                '<h3>' + esc(p.title) + '</h3>' +
                '<p class="text-muted small">By ' + esc(p.author ? p.author.username : '') + ' · ' + esc(p.created_label) + '</p>' +
                '<div class="wc-post-content mb-3">' + esc(p.content).replace(/\n/g, '<br>') + '</div>' +
                '<div class="d-flex gap-2 mb-4">' +
                '<button type="button" class="btn btn-sm btn-outline-primary" id="btnLikePost"><i class="fa-regular fa-heart"></i> ' + p.like_count + '</button>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" id="btnSharePost"><i class="fa-solid fa-share"></i> Share</button>' +
                '<button type="button" class="btn btn-sm btn-outline-danger" id="btnReportPost"><i class="fa-solid fa-flag"></i> Report</button>' +
                '</div>' +
                '<h5>Comments</h5>' +
                '<div id="postComments">' + (commentsHtml || '<p class="text-muted">No comments yet.</p>') + '</div>' +
                '<form id="commentForm" class="mt-3">' +
                '<textarea class="form-control mb-2" id="commentContent" rows="2" placeholder="Write a comment..." required></textarea>' +
                '<button type="submit" class="btn btn-primary btn-sm">Comment</button></form>' +
                '</div></div>';

            WC.$('#btnLikePost').addEventListener('click', async function () {
                try {
                    await WC.api('forums.php?action=like', { method: 'POST', body: { post_id: postId } });
                    loadPostDetail();
                } catch (err) { WC.toast(err.message); }
            });
            WC.$('#btnSharePost').addEventListener('click', async function () {
                try {
                    var s = await WC.api('forums.php?action=share', { method: 'POST', body: { post_id: postId } });
                    if (navigator.clipboard) {
                        await navigator.clipboard.writeText(s.data.share_url);
                        WC.toast('Link copied to clipboard', 'success');
                    } else {
                        WC.toast('Shared: ' + s.data.share_url, 'success');
                    }
                } catch (err) { WC.toast(err.message); }
            });
            WC.$('#btnReportPost').addEventListener('click', async function () {
                var reason = prompt('Reason for report:');
                if (!reason) return;
                try {
                    await WC.api('forums.php?action=report', { method: 'POST', body: { post_id: postId, reason: reason } });
                    WC.toast('Report submitted', 'success');
                } catch (err) { WC.toast(err.message); }
            });
            WC.$('#commentForm').addEventListener('submit', async function (ev) {
                ev.preventDefault();
                var content = WC.$('#commentContent').value.trim();
                if (!content) return;
                try {
                    await WC.api('forums.php?action=comment', {
                        method: 'POST',
                        body: { post_id: postId, content: content }
                    });
                    WC.$('#commentContent').value = '';
                    loadPostDetail();
                } catch (err) { WC.toast(err.message); }
            });
        } catch (e) {
            WC.toast(e.message);
        }
    }

    async function createPost(e) {
        e.preventDefault();
        if (!forumId) return WC.toast('Select a forum first');
        var title = WC.$('#postTitle').value.trim();
        var content = WC.$('#postContent').value.trim();
        try {
            var res = await WC.api('forums.php?action=create', {
                method: 'POST',
                body: { forum_id: forumId, title: title, content: content }
            });
            bootstrap.Modal.getInstance(WC.$('#createPostModal')).hide();
            WC.$('#createPostForm').reset();
            window.location.href = 'forums.php?post=' + res.data.id;
        } catch (err) {
            WC.toast(err.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var root = WC.$('#forumsRoot');
        if (!root) return;
        forumId = parseInt(root.dataset.forumId || '0', 10) || null;
        postId = parseInt(root.dataset.postId || '0', 10) || null;

        loadCategories();
        if (postId) {
            loadPostDetail();
        } else if (forumId) {
            loadPosts();
        }
        var form = WC.$('#createPostForm');
        if (form) form.addEventListener('submit', createPost);
    });
})();

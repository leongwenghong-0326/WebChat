(function () {
    'use strict';

    window.WC = window.WC || {};

    var toastContainer = null;
    var toastDedupe = {};

    function readMeta(name) {
        var el = document.querySelector('meta[name="' + name + '"]');
        return el ? el.getAttribute('content') : '';
    }

    if (!WC.appUrl) {
        WC.appUrl = readMeta('app-url') || '';
    }
    if (!WC.csrf) {
        WC.csrf = readMeta('csrf-token') || '';
    }
    if (!WC.userId && readMeta('user-id')) {
        WC.userId = parseInt(readMeta('user-id'), 10) || null;
    }

    WC.$ = function (selector, root) {
        return (root || document).querySelector(selector);
    };

    WC.$$ = function (selector, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    };

    WC.toast = function (message, type, duration) {
        type = type || 'info';
        duration = duration == null ? 4500 : duration;
        message = String(message == null ? '' : message);
        // Never show raw getUserMedia device errors in the UI
        if (/requested device not found/i.test(message) || message === 'NotFoundError') {
            message = 'Camera or microphone not found.';
        }

        // Dedupe identical toasts (stops stacked "device not found" spam)
        var dedupeKey = type + '::' + message;
        var now = Date.now();
        if (toastDedupe[dedupeKey] && (now - toastDedupe[dedupeKey]) < 8000) {
            return null;
        }
        toastDedupe[dedupeKey] = now;

        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'wc-toast-container';
            toastContainer.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastContainer);
        }

        var icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };

        var toast = document.createElement('div');
        toast.className = 'wc-toast wc-toast-' + type;
        toast.innerHTML =
            '<span class="wc-toast-icon"><i class="fa-solid ' + (icons[type] || icons.info) + '"></i></span>' +
            '<span class="wc-toast-body">' + WC.escapeHtml(String(message)) + '</span>' +
            '<button type="button" class="wc-toast-close" aria-label="Dismiss">&times;</button>';

        var closeBtn = toast.querySelector('.wc-toast-close');
        var remove = function () {
            toast.classList.add('wc-toast-out');
            setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 200);
        };

        closeBtn.addEventListener('click', remove);
        toastContainer.appendChild(toast);

        if (duration > 0) {
            setTimeout(remove, duration);
        }

        return toast;
    };

    WC.escapeHtml = function (str) {
        var div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    };

    WC.formatTime = function (iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        var now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    WC.presenceClass = function (presence) {
        return 'wc-presence wc-presence-' + (presence || 'offline');
    };

    WC.debounce = function (fn, ms) {
        var t;
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(t);
            t = setTimeout(function () {
                fn.apply(ctx, args);
            }, ms);
        };
    };

    WC.api = async function (path, options) {
        options = options || {};
        var method = (options.method || 'GET').toUpperCase();
        var headers = Object.assign({}, options.headers || {});
        var fetchOpts = {
            method: method,
            credentials: 'same-origin',
            headers: headers
        };

        if (WC.csrf) {
            headers['X-CSRF-TOKEN'] = WC.csrf;
        }

        if (options.formData instanceof FormData) {
            fetchOpts.body = options.formData;
            if (options.formData.get('csrf_token') == null && WC.csrf) {
                options.formData.append('csrf_token', WC.csrf);
            }
        } else if (options.body != null && method !== 'GET' && method !== 'HEAD') {
            if (options.body instanceof FormData) {
                if (options.body.get('csrf_token') == null && WC.csrf) {
                    options.body.append('csrf_token', WC.csrf);
                }
                fetchOpts.body = options.body;
            } else if (typeof options.body === 'object') {
                headers['Content-Type'] = headers['Content-Type'] || 'application/json';
                fetchOpts.body = JSON.stringify(options.body);
            } else {
                fetchOpts.body = options.body;
            }
        }

        var url = path.indexOf('http') === 0 ? path : WC.appUrl + '/api/' + path.replace(/^\//, '');

        if (options.query && typeof options.query === 'object') {
            var qs = new URLSearchParams();
            Object.keys(options.query).forEach(function (key) {
                if (options.query[key] != null && options.query[key] !== '') {
                    qs.append(key, options.query[key]);
                }
            });
            var qstr = qs.toString();
            if (qstr) {
                url += (url.indexOf('?') >= 0 ? '&' : '?') + qstr;
            }
        }

        var res;
        try {
            res = await fetch(url, fetchOpts);
        } catch (err) {
            if (!options.silent) {
                WC.toast('Network error. Please check your connection.', 'error');
            }
            throw err;
        }

        var data = null;
        var raw = await res.text();
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (parseErr) {
                if (!options.silent) {
                    WC.toast('Invalid server response.', 'error');
                }
                var invalidErr = new Error('Invalid server response');
                invalidErr.status = res.status;
                throw invalidErr;
            }
        } else {
            data = { success: false, message: 'Empty response' };
        }

        if (!res.ok || !data.success) {
            var msg = (data && data.message) ? data.message : 'Request failed';
            if (!options.silent) {
                WC.toast(msg, 'error');
            }
            var apiErr = new Error(msg);
            apiErr.status = res.status;
            apiErr.data = data;
            throw apiErr;
        }

        return data;
    };

    WC.fetchJson = WC.api;

    // Custom voice player: MediaRecorder WebM often fails in native <audio> controls.
    WC.VoicePlayer = (function () {
        var audio = null;
        var activeBtn = null;
        var activeWrap = null;
        var blobUrls = {};
        var progressTimer = null;
        var playToken = 0;

        function formatSecs(secs) {
            secs = Math.max(0, Math.round(secs || 0));
            var m = Math.floor(secs / 60);
            var s = secs % 60;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function storedDuration(wrap) {
            if (!wrap) return 0;
            var raw = wrap.getAttribute('data-voice-duration');
            var n = parseFloat(raw);
            return isFinite(n) && n > 0 ? n : 0;
        }

        function resolveDuration(wrap) {
            var d = audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
            if (d > 0) return d;
            return storedDuration(wrap);
        }

        function setPlayingUi(btn, playing) {
            if (!btn) return;
            var icon = btn.querySelector('i');
            if (icon) {
                icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            }
            btn.classList.toggle('is-playing', !!playing);
            btn.setAttribute('aria-label', playing ? 'Pause voice message' : 'Play voice message');
        }

        function stopProgress() {
            if (progressTimer) {
                cancelAnimationFrame(progressTimer);
                progressTimer = null;
            }
        }

        function updateProgress(wrap) {
            if (!audio || !wrap) return;
            // Re-find wrap if chat re-rendered while playing
            if (activeBtn && wrap && (!wrap.isConnected || !document.contains(wrap))) {
                var src = wrap.getAttribute && wrap.getAttribute('data-voice-src');
                var live = null;
                if (src) {
                    document.querySelectorAll('.wc-msg-voice[data-voice-src]').forEach(function (el) {
                        if (el.getAttribute('data-voice-src') === src) live = el;
                    });
                }
                if (live) {
                    wrap = live;
                    activeWrap = live;
                    activeBtn = live.querySelector('[data-voice-play]') || activeBtn;
                    setPlayingUi(activeBtn, !(audio.paused));
                }
            }
            var fill = wrap.querySelector('.wc-voice-fill');
            var timeEl = wrap.querySelector('.wc-voice-time');
            var dur = resolveDuration(wrap);
            var cur = audio.currentTime || 0;
            if (fill && dur > 0) {
                fill.style.width = Math.min(100, Math.max(0, (cur / dur) * 100)) + '%';
            } else if (fill && cur > 0) {
                // Indeterminate crawl when duration unknown
                fill.style.width = Math.min(90, 8 + (cur * 12) % 80) + '%';
            }
            if (timeEl && dur > 0) {
                timeEl.textContent = formatSecs(Math.max(0, dur - cur));
            }
        }

        function tickProgress() {
            if (!audio || audio.paused) {
                progressTimer = null;
                return;
            }
            updateProgress(activeWrap);
            progressTimer = requestAnimationFrame(tickProgress);
        }

        function startProgress(wrap) {
            stopProgress();
            activeWrap = wrap;
            updateProgress(wrap);
            progressTimer = requestAnimationFrame(tickProgress);
        }

        function resetActive() {
            stopProgress();
            if (activeBtn) {
                var wrap = activeBtn.closest('.wc-msg-voice') || activeWrap;
                setPlayingUi(activeBtn, false);
                if (wrap) {
                    var fill = wrap.querySelector('.wc-voice-fill');
                    if (fill) fill.style.width = '0%';
                    var timeEl = wrap.querySelector('.wc-voice-time');
                    if (timeEl) timeEl.textContent = formatSecs(storedDuration(wrap));
                }
            }
            activeBtn = null;
            activeWrap = null;
        }

        async function loadBlobUrl(src) {
            if (blobUrls[src]) return blobUrls[src];
            var res = await fetch(src, { credentials: 'same-origin', cache: 'force-cache' });
            if (!res.ok) {
                throw new Error('Voice file unavailable (' + res.status + ')');
            }
            var buf = await res.arrayBuffer();
            var headerType = (res.headers.get('Content-Type') || '').split(';')[0].trim();
            var type = headerType;
            if (!type || type === 'application/octet-stream') {
                type = src.indexOf('.wav') !== -1 ? 'audio/wav' : 'video/webm';
            }
            if (type === 'audio/webm') type = 'video/webm';
            var blob = new Blob([buf], { type: type });
            var url = URL.createObjectURL(blob);
            blobUrls[src] = url;
            return url;
        }

        async function toggle(btn) {
            var wrap = btn && btn.closest('.wc-msg-voice');
            if (!wrap) return;
            var src = wrap.getAttribute('data-voice-src');
            if (!src) return;

            // Pause current
            if (activeBtn === btn && audio && !audio.paused) {
                audio.pause();
                setPlayingUi(btn, false);
                stopProgress();
                updateProgress(wrap);
                return;
            }

            // Resume same message
            if (activeBtn === btn && audio && audio.paused && audio.src) {
                setPlayingUi(btn, true);
                try {
                    await audio.play();
                    startProgress(wrap);
                } catch (e) {
                    resetActive();
                    if (WC.toast) WC.toast('Could not play voice message.', 'error');
                }
                return;
            }

            resetActive();
            activeBtn = btn;
            activeWrap = wrap;
            setPlayingUi(btn, true);
            var token = ++playToken;

            try {
                var blobUrl = await loadBlobUrl(src);
                if (token !== playToken) return;

                async function playWith(el) {
                    audio = el;
                    el.ontimeupdate = function () { updateProgress(activeWrap || wrap); };
                    el.onended = function () { resetActive(); };
                    el.onloadedmetadata = function () { updateProgress(activeWrap || wrap); };
                    if (el.src !== blobUrl) el.src = blobUrl;
                    await el.play();
                    startProgress(wrap);
                }

                try {
                    if (!audio || audio.tagName === 'VIDEO') {
                        audio = new Audio();
                        audio.preload = 'auto';
                    }
                    await playWith(audio);
                } catch (primaryErr) {
                    var v = document.createElement('video');
                    v.playsInline = true;
                    v.preload = 'auto';
                    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;';
                    document.body.appendChild(v);
                    try {
                        await playWith(v);
                    } catch (secondaryErr) {
                        try { document.body.removeChild(v); } catch (e) {}
                        throw secondaryErr;
                    }
                }
            } catch (err) {
                if (token === playToken) {
                    resetActive();
                    if (WC.toast) {
                        WC.toast((err && err.message) ? err.message : 'Could not play voice message.', 'error');
                    }
                }
            }
        }

        return { toggle: toggle };
    })();
    /** Encode Float32 PCM mono samples to a WAV Blob. */
    WC.encodeWav = function (samples, sampleRate) {
        var numSamples = samples.length;
        var buffer = new ArrayBuffer(44 + numSamples * 2);
        var view = new DataView(buffer);

        function writeStr(offset, str) {
            for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        }

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        var offset = 44;
        for (var i = 0; i < numSamples; i++) {
            var s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }
        return new Blob([buffer], { type: 'audio/wav' });
    };

    function presencePing() {
        if (!WC.userId) return;
        WC.api('presence.php?action=ping', { method: 'POST', silent: true }).catch(function () {
            /* ignore transient failures */
        });
    }

    function pollIncomingCalls() {
        if (WC.Calls && typeof WC.Calls.pollIncoming === 'function') {
            WC.Calls.pollIncoming().catch(function () {
                /* calls module handles its own errors */
            });
        }
    }

    function initBackgroundTasks() {
        if (!WC.userId) return;

        presencePing();
        setInterval(presencePing, 30000);

        if (WC.Calls && typeof WC.Calls.pollIncoming === 'function') {
            pollIncomingCalls();
            var callInterval = (WC.poll && WC.poll.calls) ? WC.poll.calls : 1000;
            setInterval(pollIncomingCalls, callInterval);
        }
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && WC.userId) {
            presencePing();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBackgroundTasks);
    } else {
        initBackgroundTasks();
    }
})();

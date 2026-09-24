(function () {
    "use strict";

    window.WC = window.WC || {};

    var overlay, voiceArea, videoArea, remoteVideo, localVideo, remoteAudio, peerNameEl, statusEl, callAvatar;
    var btnMute, btnCamera, btnAccept, btnEnd;
    var pc = null;
    var localStream = null;
    var remoteStream = null;
    var activeCallId = null;
    var isCaller = false;
    var callType = "voice";
    var signalAfterId = 0;
    var pollTimer = null;
    var statusPollTimer = null;
    var muted = false;
    var cameraOff = false;
    var pendingCall = null;
    var pendingIce = [];
    var answerApplied = false;
    var uiBound = false;
    var accepting = false;
    var multiMode = false;
    var multiLegs = {}; // callId -> { pc, peer, answerApplied, pendingIce, signalAfterId, userId }
    var activeGroupId = null;
    var callBatchKey = null;
    var callStartedAt = null;
    var callTimerInterval = null;
    var multiAudioCtx = null;
    var lastAudioMixKey = "";
    var groupPeersCache = [];
    var videoMixCanvas = null;
    var videoMixCtx = null;
    var videoMixRaf = null;
    var videoMixStream = null;
    var videoMixSources = [];
    var mediaAcquirePromise = null;
    var mediaToastSeen = {};
    var startingMulti = false;
    var speakerCtx = null;
    var speakerAnalysers = {};
    var speakerTimer = null;
    var activeSpeakerKey = null;

    function isPhoneDevice() {
        var ua = navigator.userAgent || "";
        return /iPhone|iPad|iPod|Android.+Mobile/i.test(ua);
    }

    function isIOSDevice() {
        var ua = navigator.userAgent || "";
        return /iPhone|iPad|iPod/i.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    function canUseHostVideoMix() {
        if (!multiMode || !isCaller || callType !== "video") return false;
        // Canvas captureStream on iOS/Android is often black, blurry, or stuck
        if (isPhoneDevice() || isIOSDevice()) return false;
        return !!(HTMLCanvasElement && HTMLCanvasElement.prototype.captureStream);
    }

    function prepVideoEl(videoEl, opts) {
        if (!videoEl) return;
        opts = opts || {};
        videoEl.autoplay = true;
        videoEl.muted = opts.muted !== false;
        videoEl.playsInline = true;
        videoEl.setAttribute("playsinline", "true");
        videoEl.setAttribute("webkit-playsinline", "true");
        if (opts.mirror) videoEl.classList.add("is-mirrored");
        else videoEl.classList.remove("is-mirrored");
        var play = function () {
            var p = videoEl.play();
            if (p && typeof p.catch === "function") p.catch(function () {});
        };
        videoEl.onloadedmetadata = play;
        play();
    }

    function isGroupCallContext(opts) {
        opts = opts || {};
        return !!(opts.group || multiMode || activeGroupId || startingMulti ||
            (pendingCall && pendingCall.group_id) ||
            (opts.call && opts.call.group_id));
    }

    /** One toast per message; device errors stay suppressed across retries (~45s). */
    function toastMediaOnce(message, type) {
        if (!WC.toast || !message) return;
        message = sanitizeMediaToast(message);
        // Never surface the raw browser string
        if (/requested device not found/i.test(message)) {
            message = "Camera or microphone not found.";
        }
        var key = String(type || "info") + "::" + String(message);
        var now = Date.now();
        if (mediaToastSeen[key] && (now - mediaToastSeen[key]) < 45000) return;
        mediaToastSeen[key] = now;
        WC.toast(message, type || "warning");
    }

    function sanitizeMediaToast(message) {
        message = String(message || "");
        if (/requested device not found/i.test(message) || message === "NotFoundError") {
            return "Camera or microphone not found.";
        }
        if (/permission|notallowed|denied/i.test(message)) {
            return "Microphone/camera permission denied.";
        }
        if (/notreadable|trackstart|could not start/i.test(message)) {
            return "Camera/microphone is busy in another app.";
        }
        return message;
    }

    function friendlyMediaError(err) {
        var name = (err && err.name) ? String(err.name) : "";
        var msg = (err && err.message) ? String(err.message) : "";
        if (name === "NotFoundError" || /requested device not found/i.test(msg)) {
            return "Camera or microphone not found.";
        }
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            return "Microphone/camera permission denied.";
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
            return "Camera/microphone is busy in another app.";
        }
        return sanitizeMediaToast(msg || "Unable to access camera/microphone.");
    }

    function mediaErrorMessage(err, fallback) {
        if (!err) return fallback || "Unable to access camera/microphone.";
        if (err._wcFriendly) return err._wcFriendly;
        return friendlyMediaError(err) || fallback || "Unable to start call.";
    }

    function isDeviceMissingError(err) {
        var name = (err && err.name) ? String(err.name) : "";
        var msg = mediaErrorMessage(err, "");
        return name === "NotFoundError" || /not found/i.test(msg);
    }

    function throwMediaError(err) {
        var friendly = friendlyMediaError(err);
        var wrapped = new Error(friendly);
        wrapped.name = (err && err.name) || "MediaError";
        wrapped._wcFriendly = friendly;
        wrapped._wcMedia = true;
        throw wrapped;
    }

    function toastCallError(err, fallback, opts) {
        opts = opts || {};
        // Never toast missing camera/mic — call can continue receive-only / silent
        if (isDeviceMissingError(err) || opts.quietDevice) {
            return;
        }
        toastMediaOnce(mediaErrorMessage(err, fallback), "error");
    }

    // ---- Ringtone (Web Audio) ----
    var ringCtx = null;
    var ringTimer = null;
    var ringMode = null;
    var audioUnlocked = false;

    function getRingCtx() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!ringCtx) ringCtx = new AC();
        if (ringCtx.state === "suspended") {
            ringCtx.resume().catch(function () {});
        }
        return ringCtx;
    }

    function unlockAudio() {
        if (audioUnlocked) return;
        try {
            var c = getRingCtx();
            if (!c) return;
            var buf = c.createBuffer(1, 1, 22050);
            var src = c.createBufferSource();
            src.buffer = buf;
            src.connect(c.destination);
            src.start(0);
            audioUnlocked = true;
        } catch (e) {}
    }

    function playTonePair(freqA, freqB, duration, when, volume) {
        var c = getRingCtx();
        if (!c) return;
        volume = volume == null ? 0.18 : volume;
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(volume, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        g.connect(c.destination);

        [freqA, freqB].forEach(function (freq) {
            var o = c.createOscillator();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g);
            o.start(when);
            o.stop(when + duration + 0.02);
        });
    }

    function ringOutgoingBurst() {
        var c = getRingCtx();
        if (!c) return;
        var t = c.currentTime + 0.02;
        // Classic dual-tone ring-ring
        playTonePair(440, 480, 0.4, t, 0.16);
        playTonePair(440, 480, 0.4, t + 0.55, 0.16);
    }

    function ringIncomingBurst() {
        var c = getRingCtx();
        if (!c) return;
        var t = c.currentTime + 0.02;
        // Brighter incoming alert
        playTonePair(523.25, 659.25, 0.28, t, 0.2);
        playTonePair(523.25, 659.25, 0.28, t + 0.35, 0.2);
        playTonePair(783.99, 987.77, 0.45, t + 0.8, 0.18);
    }

    function startRingtone(mode) {
        unlockAudio();
        stopRingtone();
        ringMode = mode;
        if (!getRingCtx()) return;
        var burst = mode === "incoming" ? ringIncomingBurst : ringOutgoingBurst;
        var gap = mode === "incoming" ? 2400 : 2200;
        burst();
        ringTimer = setInterval(function () {
            if (!ringMode) return;
            burst();
        }, gap);
    }

    function stopRingtone() {
        ringMode = null;
        if (ringTimer) {
            clearInterval(ringTimer);
            ringTimer = null;
        }
    }

    function formatCallClock(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function setCallTimerVisible(show) {
        var voiceTimer = WC.$("#callVoiceTimer");
        var videoTimer = WC.$("#callVideoTimer");
        if (voiceTimer) voiceTimer.classList.toggle("d-none", !show);
        if (videoTimer) videoTimer.classList.toggle("d-none", !show);
    }

    function tickCallTimer() {
        var text = formatCallClock(getCallElapsedSec());
        var voiceTimer = WC.$("#callVoiceTimer");
        var videoTimer = WC.$("#callVideoTimer");
        if (voiceTimer) voiceTimer.textContent = text;
        if (videoTimer) videoTimer.textContent = text;
        updateCallPeopleUi();
    }

    function startCallTimer() {
        if (callTimerInterval) return;
        if (!callStartedAt) callStartedAt = Date.now();
        setCallTimerVisible(true);
        tickCallTimer();
        callTimerInterval = setInterval(tickCallTimer, 1000);
    }

    function stopCallTimer() {
        if (callTimerInterval) {
            clearInterval(callTimerInterval);
            callTimerInterval = null;
        }
        callStartedAt = null;
        setCallTimerVisible(false);
        var voiceTimer = WC.$("#callVoiceTimer");
        var videoTimer = WC.$("#callVideoTimer");
        if (voiceTimer) voiceTimer.textContent = "0:00";
        if (videoTimer) videoTimer.textContent = "0:00";
    }

    function getCallElapsedSec() {
        if (!callStartedAt) return 0;
        return Math.floor((Date.now() - callStartedAt) / 1000);
    }

    function setMetaLine(text) {
        var voiceMeta = WC.$("#callVoiceMetaLine");
        var videoMeta = WC.$("#callVideoMetaLine");
        if (voiceMeta) voiceMeta.textContent = text || "";
        if (videoMeta) videoMeta.textContent = text || "";
    }

    function renderParticipantAvatars(peers) {
        var stack = WC.$("#callAvatarStack");
        if (!stack) return;
        peers = (peers || []).filter(Boolean);
        var fallback = "";
        var existing = stack.querySelector("img");
        if (existing && existing.src) fallback = existing.src;
        stack.innerHTML = "";
        stack.classList.toggle("is-multi", peers.length > 1);
        var shown = peers.slice(0, 3);
        for (var i = 0; i < shown.length; i++) {
            var peer = shown[i];
            var img = document.createElement("img");
            if (i === 0) img.id = "callAvatar";
            img.className = "wc-call-avatar";
            img.alt = peer.username || "";
            img.src = (peer && peer.avatar) || fallback || "";
            var uid = peer.id || peer.user_id || peer.userId || "";
            var speakerKey = uid ? ("user-" + uid) : ("peer-" + i);
            if (peer._speakerKey) speakerKey = peer._speakerKey;
            if (peer.isSelf || (uid && parseInt(uid, 10) === parseInt(WC.userId, 10))) {
                speakerKey = "local";
            }
            img.setAttribute("data-speaker-key", speakerKey);
            img.setAttribute("data-username", peer.username || "");
            if (activeSpeakerKey && activeSpeakerKey === speakerKey) {
                img.classList.add("is-speaking");
            }
            stack.appendChild(img);
        }
        if (peers.length > 3) {
            var more = document.createElement("span");
            more.className = "wc-call-more";
            more.textContent = "+" + (peers.length - 3);
            stack.appendChild(more);
        }
        callAvatar = WC.$("#callAvatar");
        applySpeakerUi(activeSpeakerKey);
    }

    function stopSpeakerDetect() {
        if (speakerTimer) {
            clearInterval(speakerTimer);
            speakerTimer = null;
        }
        Object.keys(speakerAnalysers).forEach(function (key) {
            try { speakerAnalysers[key].source.disconnect(); } catch (e) {}
        });
        speakerAnalysers = {};
        activeSpeakerKey = null;
        applySpeakerUi(null);
        try {
            if (speakerCtx) speakerCtx.close();
        } catch (e) {}
        speakerCtx = null;
    }

    function ensureSpeakerCtx() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!speakerCtx || speakerCtx.state === "closed") {
            speakerCtx = new AC();
        }
        if (speakerCtx.state === "suspended") {
            speakerCtx.resume().catch(function () {});
        }
        return speakerCtx;
    }

    function bindSpeakerStream(key, stream) {
        if (!key || !stream) return;
        var tracks = stream.getAudioTracks().filter(function (t) {
            return t && t.readyState !== "ended";
        });
        if (!tracks.length) return;
        var ctx = ensureSpeakerCtx();
        if (!ctx) return;
        try {
            if (speakerAnalysers[key]) {
                try { speakerAnalysers[key].source.disconnect(); } catch (e) {}
                delete speakerAnalysers[key];
            }
            var source = ctx.createMediaStreamSource(new MediaStream([tracks[0]]));
            var analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.45;
            source.connect(analyser);
            speakerAnalysers[key] = {
                analyser: analyser,
                source: source,
                data: new Uint8Array(analyser.frequencyBinCount),
                key: key
            };
            startSpeakerDetect();
        } catch (e) {}
    }

    function refreshSpeakerBindings() {
        if (localStream) bindSpeakerStream("local", localStream);
        if (multiMode) {
            Object.keys(multiLegs).forEach(function (id) {
                var leg = multiLegs[id];
                if (!leg || leg.ended || !leg.connected || !leg.remoteStream) return;
                var key = leg.userId ? ("user-" + leg.userId) : ("leg-" + id);
                bindSpeakerStream(key, leg.remoteStream);
            });
        } else if (remoteStream) {
            bindSpeakerStream("remote", remoteStream);
        }
    }

    function startSpeakerDetect() {
        if (speakerTimer) return;
        speakerTimer = setInterval(tickSpeaker, 140);
    }

    function tickSpeaker() {
        var bestKey = null;
        var bestLevel = 0;
        Object.keys(speakerAnalysers).forEach(function (key) {
            var item = speakerAnalysers[key];
            if (!item || !item.analyser) return;
            item.analyser.getByteFrequencyData(item.data);
            var sum = 0;
            for (var i = 0; i < item.data.length; i++) sum += item.data[i];
            var avg = sum / item.data.length;
            if (key === "local" && muted) avg = 0;
            if (avg > bestLevel) {
                bestLevel = avg;
                bestKey = key;
            }
        });
        if (bestLevel < 16) bestKey = null;
        if (bestKey === activeSpeakerKey) return;
        activeSpeakerKey = bestKey;
        applySpeakerUi(bestKey);
    }

    function applySpeakerUi(key) {
        var stack = WC.$("#callAvatarStack");
        if (stack) {
            Array.prototype.slice.call(stack.querySelectorAll(".wc-call-avatar")).forEach(function (img) {
                var match = !!(key && img.getAttribute("data-speaker-key") === key);
                img.classList.toggle("is-speaking", match);
            });
            // Soft focus: enlarge speaking avatar order visually via class on stack
            stack.classList.toggle("has-active-speaker", !!key);
        }
        var grid = WC.$("#callVideoGrid");
        if (grid) {
            Array.prototype.slice.call(grid.querySelectorAll("[data-tile]")).forEach(function (tile) {
                var tileKey = tile.getAttribute("data-tile");
                var speakerKey = tile.getAttribute("data-speaker-key") || tileKey;
                // Map leg-X tile to user-Y when possible
                if (tileKey && tileKey.indexOf("leg-") === 0) {
                    var legId = tileKey.slice(4);
                    var leg = multiLegs[legId];
                    if (leg && leg.userId) speakerKey = "user-" + leg.userId;
                }
                if (tileKey === "local") speakerKey = "local";
                tile.classList.toggle("is-speaking", !!(key && (speakerKey === key || tileKey === key)));
            });
        }
        if (key) {
            var speakingName = "";
            if (key === "local") speakingName = WC.userName || "You";
            else if (stack) {
                var speakingImg = stack.querySelector('.wc-call-avatar[data-speaker-key="' + key + '"]');
                if (speakingImg) speakingName = speakingImg.getAttribute("data-username") || "";
            }
            if (!speakingName && grid) {
                var speakingTile = grid.querySelector('.wc-call-video-tile.is-speaking .wc-call-tile-label');
                if (speakingTile) speakingName = speakingTile.textContent || "";
            }
            if (speakingName) {
                setMetaLine(speakingName + " is talking");
            }
        }
    }

    function countActiveCameras() {
        var n = 0;
        function trackLive(t) {
            return t && t.readyState !== "ended" && t.enabled !== false;
        }
        if (localStream) {
            if (localStream.getVideoTracks().some(trackLive)) n++;
        }
        if (multiMode) {
            Object.keys(multiLegs).forEach(function (id) {
                var leg = multiLegs[id];
                if (!leg || !leg.connected || leg.ended || !leg.remoteStream) return;
                if (leg.remoteStream.getVideoTracks().some(trackLive)) n++;
            });
        } else if (remoteStream) {
            if (remoteStream.getVideoTracks().some(trackLive)) n++;
        }
        return n;
    }

    function applyGroupPeersUi(peers, opts) {
        opts = opts || {};
        peers = (peers || []).filter(Boolean);
        if (peers.length) groupPeersCache = peers;
        else peers = groupPeersCache || [];
        if (!peers.length) return;

        var connectedPeers = peers.filter(function (p) { return p.connected !== false; });
        var showPeers = connectedPeers.length ? connectedPeers : peers;
        var people = Math.max(showPeers.length, opts.people || 0, 1);
        var title = people + " connected";
        if (peerNameEl) peerNameEl.textContent = title;
        var nameBanner = WC.$("#callPeerBanner");
        if (nameBanner) nameBanner.textContent = title;

        var names = showPeers.map(function (p) { return p.username; }).filter(Boolean);
        if (names.length) {
            setStatus("Connected with " + names.join(", "));
        }
        renderParticipantAvatars(showPeers);
        var cams = countActiveCameras();
        // For group video, never under-count below visible streams; prefer live track count.
        if (callType === "video" && opts.minCameras != null) {
            cams = Math.max(cams, opts.minCameras);
        }
        var line = people + " connected";
        if (callType === "video") {
            line += " · " + cams + " camera" + (cams === 1 ? "" : "s") + " on";
        }
        setMetaLine(line);
    }

    function updateCallPeopleUi() {
        // Group / multi only — never force multi-avatar UI on private 1:1 calls
        if (multiMode && groupPeersCache && groupPeersCache.length > 1) {
            applyGroupPeersUi(groupPeersCache);
            return;
        }
        var people = 1;
        var faces = [];
        if (multiMode) {
            Object.keys(multiLegs).forEach(function (id) {
                var leg = multiLegs[id];
                if (!leg || leg.ended) return;
                if (leg.peer) faces.push(leg.peer);
                if (leg.connected) people++;
            });
            if (WC.userAvatar || WC.userName) {
                faces.unshift({ username: WC.userName || "You", avatar: WC.userAvatar || "", connected: true });
            }
            people = Math.max(people, faces.length, 1);
            if (faces.length) {
                renderParticipantAvatars(faces);
                if (peerNameEl) peerNameEl.textContent = people + " connected";
            }
        } else if ((pc && pc.connectionState === "connected") || answerApplied) {
            // Private 1:1 — single peer avatar only
            people = 2;
            if (callAvatar && callAvatar.src) {
                renderParticipantAvatars([{
                    username: peerNameEl ? peerNameEl.textContent : "User",
                    avatar: callAvatar.src,
                    _speakerKey: "remote"
                }]);
            }
            refreshSpeakerBindings();
        }
        var cams = countActiveCameras();
        var line = people + " connected";
        if (callType === "video") {
            line += " · " + cams + " camera" + (cams === 1 ? "" : "s") + " on";
        }
        setMetaLine(line);
    }

    function rebuildHostAudioMix() {
        if (!multiMode || !isCaller) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;

        var legs = [];
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (leg && leg.connected && !leg.ended && leg.pc && leg.remoteStream) legs.push(leg);
        });
        if (!legs.length) return;

        var mixKey = legs.map(function (l) { return String(l.callId || ""); }).sort().join(",") +
            "|" + (localStream && localStream.getAudioTracks().some(function (tr) { return tr.readyState !== "ended"; }) ? "1" : "0");
        if (mixKey === lastAudioMixKey && multiAudioCtx) return;
        lastAudioMixKey = mixKey;

        if (multiAudioCtx) {
            try { multiAudioCtx.close(); } catch (e) {}
            multiAudioCtx = null;
        }

        try {
            multiAudioCtx = new AC();
            if (multiAudioCtx.state === "suspended") {
                multiAudioCtx.resume().catch(function () {});
            }

            legs.forEach(function (targetLeg) {
                var dest = multiAudioCtx.createMediaStreamDestination();

                if (localStream) {
                    try {
                        var localAudio = new MediaStream(localStream.getAudioTracks());
                        if (localAudio.getAudioTracks().length) {
                            multiAudioCtx.createMediaStreamSource(localAudio).connect(dest);
                        }
                    } catch (e) {}
                }

                legs.forEach(function (otherLeg) {
                    if (otherLeg === targetLeg || !otherLeg.remoteStream) return;
                    try {
                        var remoteAudio = new MediaStream(otherLeg.remoteStream.getAudioTracks());
                        if (remoteAudio.getAudioTracks().length) {
                            multiAudioCtx.createMediaStreamSource(remoteAudio).connect(dest);
                        }
                    } catch (e) {}
                });

                var mixed = dest.stream.getAudioTracks()[0];
                if (!mixed) return;
                var senders = targetLeg.pc.getSenders();
                for (var si = 0; si < senders.length; si++) {
                    if (senders[si].track && senders[si].track.kind === "audio") {
                        senders[si].replaceTrack(mixed).catch(function () {});
                        break;
                    }
                }
            });
        } catch (e) {}
    }

    function els() {
        overlay = WC.$("#callOverlay");
        voiceArea = WC.$("#callVoiceArea");
        videoArea = WC.$("#callVideoArea");
        remoteVideo = WC.$("#remoteVideo");
        localVideo = WC.$("#localVideo");
        remoteAudio = WC.$("#remoteAudio");
        peerNameEl = WC.$("#callPeerName");
        statusEl = WC.$("#callStatusText");
        callAvatar = WC.$("#callAvatar");
        btnMute = WC.$("#btnMute");
        btnCamera = WC.$("#btnCamera");
        btnAccept = WC.$("#btnAcceptCall");
        btnEnd = WC.$("#btnEndCall");
    }

    function normalizeSdp(sdp) {
        if (!sdp || typeof sdp !== "string") return "";
        return sdp.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n").map(function (line) {
            return line.replace(/[ \t]+$/g, "");
        }).filter(function (line) {
            return line.length > 0;
        }).join("\r\n") + "\r\n";
    }

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
        var banner = WC.$("#callStatusBanner");
        if (banner) banner.textContent = text || "";
    }

    function showOverlay(show) {
        if (!overlay) return;
        overlay.classList.toggle("d-none", !show);
        overlay.setAttribute("aria-hidden", show ? "false" : "true");
    }

    function stopTimers() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (statusPollTimer) { clearInterval(statusPollTimer); statusPollTimer = null; }
    }

    function hideAccept() {
        if (btnAccept) btnAccept.classList.add("d-none");
    }

    function showAccept() {
        if (btnAccept) btnAccept.classList.remove("d-none");
    }

    function playRemoteMedia() {
        if (remoteAudio && remoteAudio.srcObject) {
            remoteAudio.muted = false;
            remoteAudio.volume = 1;
            var p = remoteAudio.play();
            if (p && typeof p.catch === "function") p.catch(function () {});
        }
        if (remoteVideo && remoteVideo.srcObject) {
            remoteVideo.muted = callType !== "video";
            var pv = remoteVideo.play();
            if (pv && typeof pv.catch === "function") pv.catch(function () {});
        }
        if (localVideo && localVideo.srcObject) {
            localVideo.muted = true;
            localVideo.play().catch(function () {});
        }
    }

    function clearMultiVideoGrid() {
        var grid = WC.$("#callVideoGrid");
        if (grid) {
            grid.innerHTML = "";
            grid.classList.add("d-none");
            grid.setAttribute("aria-hidden", "true");
            grid.className = "wc-call-video-grid d-none";
        }
        if (videoArea) videoArea.classList.remove("is-multi-grid");
        if (remoteVideo) remoteVideo.classList.remove("d-none");
        if (localVideo) {
            localVideo.classList.remove("d-none");
            // Restore PiP preview when leaving grid mode
            if (localStream && !localVideo.srcObject) {
                showLocalPreview(localStream);
            }
        }
    }

    function stopHostVideoMix() {
        if (videoMixRaf) {
            cancelAnimationFrame(videoMixRaf);
            videoMixRaf = null;
        }
        videoMixSources = [];
        if (videoMixStream) {
            try {
                videoMixStream.getTracks().forEach(function (tr) { tr.stop(); });
            } catch (e) {}
            videoMixStream = null;
        }
        videoMixCanvas = null;
        videoMixCtx = null;
    }

    function drawHostVideoMixFrame() {
        if (!canUseHostVideoMix() || !videoMixCanvas || !videoMixCtx) {
            videoMixRaf = null;
            return;
        }
        var w = videoMixCanvas.width;
        var h = videoMixCanvas.height;
        videoMixCtx.fillStyle = "#0b1f1c";
        videoMixCtx.fillRect(0, 0, w, h);

        var sources = [];
        if (localStream && localStream.getVideoTracks().some(function (tr) { return tr.readyState !== "ended" && tr.enabled !== false; })) {
            var localEl = WC.$("#callVideoGrid video[data-tile-video=\"local\"]") || localVideo;
            if (localEl && localEl.videoWidth) sources.push(localEl);
        }
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg || !leg.connected || leg.ended) return;
            var el = WC.$('#callVideoGrid video[data-leg="' + id + '"]');
            if (el && el.videoWidth) sources.push(el);
        });

        var n = sources.length;
        if (n === 0) {
            videoMixRaf = requestAnimationFrame(drawHostVideoMixFrame);
            return;
        }
        var cols = n <= 2 ? n : 2;
        var rows = Math.ceil(n / cols);
        var tw = Math.floor(w / cols);
        var th = Math.floor(h / rows);
        for (var i = 0; i < n; i++) {
            var sx = (i % cols) * tw;
            var sy = Math.floor(i / cols) * th;
            try {
                videoMixCtx.drawImage(sources[i], sx, sy, tw, th);
            } catch (e) {}
        }
        videoMixRaf = requestAnimationFrame(drawHostVideoMixFrame);
    }

    function rebuildHostVideoMix() {
        if (!canUseHostVideoMix()) {
            stopHostVideoMix();
            // Ensure each leg still sends the real local camera track on phones
            if (multiMode && isCaller && callType === "video" && localStream) {
                var localVid = localStream.getVideoTracks().find(function (tr) {
                    return tr.readyState !== "ended";
                });
                if (localVid) {
                    Object.keys(multiLegs).forEach(function (id) {
                        var leg = multiLegs[id];
                        if (!leg || !leg.pc || leg.ended) return;
                        leg.pc.getSenders().forEach(function (sender) {
                            if (sender.track && sender.track.kind === "video" && sender.track !== localVid) {
                                sender.replaceTrack(localVid).catch(function () {});
                            }
                        });
                    });
                }
            }
            return;
        }
        var legs = [];
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (leg && leg.connected && !leg.ended && leg.pc) legs.push(leg);
        });
        if (!legs.length) {
            stopHostVideoMix();
            return;
        }

        if (!videoMixCanvas) {
            videoMixCanvas = document.createElement("canvas");
            videoMixCanvas.width = 640;
            videoMixCanvas.height = 480;
            videoMixCtx = videoMixCanvas.getContext("2d");
            try {
                videoMixStream = videoMixCanvas.captureStream(15);
            } catch (e) {
                videoMixStream = null;
            }
        }
        if (!videoMixStream) return;
        var mixedTrack = videoMixStream.getVideoTracks()[0];
        if (!mixedTrack) return;

        legs.forEach(function (leg) {
            var senders = leg.pc.getSenders();
            for (var si = 0; si < senders.length; si++) {
                if (senders[si].track && senders[si].track.kind === "video") {
                    senders[si].replaceTrack(mixedTrack).catch(function () {});
                    break;
                }
            }
        });

        if (!videoMixRaf) {
            videoMixRaf = requestAnimationFrame(drawHostVideoMixFrame);
        }
    }

    function syncMultiVideoGrid() {
        var grid = WC.$("#callVideoGrid");
        if (!grid || !videoArea) return;

        if (!(multiMode && callType === "video")) {
            clearMultiVideoGrid();
            stopHostVideoMix();
            return;
        }

        var tiles = [];
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg || leg.ended || !leg.connected) return;
            if (!leg.remoteStream) return;
            var hasVideo = leg.remoteStream.getVideoTracks().some(function (tr) {
                return tr.readyState !== "ended";
            });
            if (!hasVideo) return;
            tiles.push({
                key: "leg-" + id,
                legId: id,
                speakerKey: leg.userId ? ("user-" + leg.userId) : ("leg-" + id),
                stream: leg.remoteStream,
                label: (leg.peer && leg.peer.username) || "Member",
                muted: true,
                mirror: false
            });
        });
        if (localStream && localStream.getVideoTracks().some(function (tr) {
            return tr.readyState !== "ended" && tr.enabled !== false;
        })) {
            tiles.push({
                key: "local",
                speakerKey: "local",
                stream: localStream,
                label: WC.userName || "You",
                muted: true,
                mirror: true
            });
        }

        if (tiles.length <= 1) {
            // Still ringing / waiting — keep classic layout
            clearMultiVideoGrid();
            return;
        }

        videoArea.classList.add("is-multi-grid");
        // Safari cannot play the same stream on PiP + grid tile — release PiP
        if (localVideo) {
            localVideo.classList.add("d-none");
            localVideo.srcObject = null;
        }
        if (remoteVideo) remoteVideo.classList.add("d-none");
        grid.classList.remove("d-none");
        grid.setAttribute("aria-hidden", "false");
        grid.className = "wc-call-video-grid tiles-" + Math.min(tiles.length, 4);

        var existing = {};
        Array.prototype.slice.call(grid.querySelectorAll("[data-tile]")).forEach(function (el) {
            existing[el.getAttribute("data-tile")] = el;
        });

        var keep = {};
        tiles.forEach(function (tile) {
            keep[tile.key] = true;
            var wrap = existing[tile.key];
            if (!wrap) {
                wrap = document.createElement("div");
                wrap.className = "wc-call-video-tile";
                wrap.setAttribute("data-tile", tile.key);
                var v = document.createElement("video");
                v.autoplay = true;
                v.playsInline = true;
                v.muted = true;
                v.setAttribute("playsinline", "true");
                v.setAttribute("webkit-playsinline", "true");
                if (tile.legId) v.setAttribute("data-leg", String(tile.legId));
                else v.setAttribute("data-tile-video", "local");
                wrap.appendChild(v);
                var lab = document.createElement("div");
                lab.className = "wc-call-tile-label";
                wrap.appendChild(lab);
                grid.appendChild(wrap);
            }
            wrap.setAttribute("data-speaker-key", tile.speakerKey || tile.key);
            var videoEl = wrap.querySelector("video");
            var labelEl = wrap.querySelector(".wc-call-tile-label");
            if (labelEl) labelEl.textContent = tile.label || "";
            if (videoEl && tile.stream && videoEl.srcObject !== tile.stream) {
                videoEl.srcObject = tile.stream;
            }
            prepVideoEl(videoEl, { muted: true, mirror: !!tile.mirror });
        });

        Object.keys(existing).forEach(function (key) {
            if (!keep[key] && existing[key].parentNode) {
                existing[key].parentNode.removeChild(existing[key]);
            }
        });

        rebuildHostVideoMix();
        refreshSpeakerBindings();
        applySpeakerUi(activeSpeakerKey);
    }

    function attachRemoteTrack(track) {
        if (!remoteStream) remoteStream = new MediaStream();
        if (!remoteStream.getTracks().some(function (t) { return t.id === track.id; })) {
            remoteStream.addTrack(track);
        }
        if (remoteAudio) remoteAudio.srcObject = remoteStream;
        if (!(multiMode && callType === "video")) {
            if (remoteVideo) remoteVideo.srcObject = remoteStream;
            prepVideoEl(remoteVideo, { muted: callType !== "video", mirror: false });
        }
        playRemoteMedia();
        syncMultiVideoGrid();
        refreshSpeakerBindings();
    }

    function showLocalPreview(stream) {
        if (!localVideo || !stream) return;
        // On multi-grid phones, only the grid tile owns the stream (Safari dual-play bug)
        if (videoArea && videoArea.classList.contains("is-multi-grid")) {
            localVideo.srcObject = null;
            localVideo.classList.add("d-none");
            syncMultiVideoGrid();
            return;
        }
        localVideo.srcObject = stream;
        prepVideoEl(localVideo, { muted: true, mirror: true });
        syncMultiVideoGrid();
        bindSpeakerStream("local", stream);
    }

    function closeMultiLegs() {
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg || !leg.pc) return;
            try {
                leg.pc.onicecandidate = null;
                leg.pc.ontrack = null;
                leg.pc.onconnectionstatechange = null;
                leg.pc.close();
            } catch (e) {}
        });
        multiLegs = {};
        multiMode = false;
    }

    function cleanup() {
        stopRingtone();
        stopCallTimer();
        stopTimers();
        accepting = false;
        startingMulti = false;
        closeMultiLegs();
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            try { pc.close(); } catch (e) {}
            pc = null;
        }
        if (localStream) {
            try {
                if (localStream._wcOsc) localStream._wcOsc.stop();
            } catch (e) {}
            try {
                if (localStream._wcAudioCtx) localStream._wcAudioCtx.close();
            } catch (e) {}
            localStream.getTracks().forEach(function (t) { t.stop(); });
            localStream = null;
        }
        if (remoteStream) {
            remoteStream.getTracks().forEach(function (t) {
                try { t.stop(); } catch (e) {}
            });
            remoteStream = null;
        }
        if (remoteVideo) remoteVideo.srcObject = null;
        if (localVideo) localVideo.srcObject = null;
        if (remoteAudio) remoteAudio.srcObject = null;
        if (multiAudioCtx) {
            try { multiAudioCtx.close(); } catch (e) {}
            multiAudioCtx = null;
        }
        stopHostVideoMix();
        clearMultiVideoGrid();
        stopSpeakerDetect();
        lastAudioMixKey = "";
        groupPeersCache = [];
        activeCallId = null;
        activeGroupId = null;
        callBatchKey = null;
        isCaller = false;
        pendingCall = null;
        pendingIce = [];
        signalAfterId = 0;
        muted = false;
        cameraOff = false;
        answerApplied = false;
        setMetaLine("");
        hideAccept();
        if (btnCamera) btnCamera.classList.add("d-none");
        if (videoArea) videoArea.classList.add("d-none");
        if (voiceArea) voiceArea.classList.remove("d-none");
        updateMuteBtn();
        updateCameraBtn();
    }

    function updateMuteBtn() {
        if (!btnMute) return;
        var icon = btnMute.querySelector("i");
        if (icon) icon.className = muted ? "fa-solid fa-microphone-slash" : "fa-solid fa-microphone";
        btnMute.classList.toggle("btn-warning", !!muted);
        btnMute.classList.toggle("btn-light", !muted);
        btnMute.title = muted ? "Unmute" : "Mute";
    }

    function updateCameraBtn() {
        if (!btnCamera) return;
        var icon = btnCamera.querySelector("i");
        if (icon) icon.className = cameraOff ? "fa-solid fa-video-slash" : "fa-solid fa-video";
        btnCamera.title = cameraOff ? "Turn camera on" : "Turn camera off";
        btnCamera.classList.toggle("btn-warning", !!cameraOff);
        btnCamera.classList.toggle("btn-light", !cameraOff);
    }

    function applyCallUi(type) {
        callType = type || "voice";
        if (callType === "video") {
            if (videoArea) videoArea.classList.remove("d-none");
            if (voiceArea) voiceArea.classList.add("d-none");
            if (btnCamera) btnCamera.classList.remove("d-none");
            if (overlay) overlay.classList.add("is-video-call");
        } else {
            if (videoArea) videoArea.classList.add("d-none");
            if (voiceArea) voiceArea.classList.remove("d-none");
            if (btnCamera) btnCamera.classList.add("d-none");
            if (overlay) overlay.classList.remove("is-video-call");
        }
        playRemoteMedia();
    }

    function setPeerInfo(peer) {
        if (!peer) return;
        if (peerNameEl) peerNameEl.textContent = peer.username || "User";
        var nameBanner = WC.$("#callPeerBanner");
        if (nameBanner) nameBanner.textContent = peer.username || "User";
        if (!multiMode) {
            renderParticipantAvatars([peer]);
        } else if (callAvatar && peer.avatar) {
            callAvatar.src = peer.avatar;
        }
    }

    function createSilentAudioStream() {
        var stream = new MediaStream();
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return stream;
        try {
            var ctx = new AC();
            if (ctx.state === "suspended") {
                ctx.resume().catch(function () {});
            }
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            var dest = ctx.createMediaStreamDestination();
            gain.gain.value = 0.0001;
            osc.connect(gain);
            gain.connect(dest);
            osc.start();
            dest.stream.getAudioTracks().forEach(function (t) {
                t.enabled = true;
                try { t.contentHint = "music"; } catch (e) {}
                stream.addTrack(t);
            });
            stream._wcSilent = true;
            stream._wcAudioCtx = ctx;
            stream._wcOsc = osc;
        } catch (e) {}
        return stream;
    }

    async function getMedia(type, opts) {
        opts = opts || {};
        var wantVideo = type === "video";
        var groupCtx = isGroupCallContext(opts);

        async function tryGum(constraints) {
            return navigator.mediaDevices.getUserMedia(constraints);
        }

        async function acquire() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throwMediaError({ name: "NotSupportedError", message: "getUserMedia unsupported" });
            }

            var lastErr = null;
            var audioTries = [
                true,
                { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                { echoCancellation: true }
            ];

            if (!wantVideo) {
                for (var a = 0; a < audioTries.length; a++) {
                    try {
                        return await tryGum({ audio: audioTries[a], video: false });
                    } catch (err) {
                        lastErr = err;
                    }
                }
                // Group: join receive-only with silent track so the call can still connect
                if (groupCtx || opts.allowSilent) {
                    var silentVoice = createSilentAudioStream();
                    if (silentVoice.getAudioTracks().length) {
                        muted = true;
                        updateMuteBtn();
                        return silentVoice;
                    }
                }
                throwMediaError(lastErr || { name: "NotFoundError", message: "Requested device not found" });
            }

            // Video: try simple combos first (facingMode often breaks desktop cams)
            var videoTries = isPhoneDevice() || isIOSDevice()
                ? [
                    { audio: true, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
                    { audio: true, video: { facingMode: "user" } },
                    { audio: true, video: true },
                    { audio: true, video: { facingMode: { ideal: "user" } } }
                ]
                : [
                    { audio: true, video: true },
                    { audio: true, video: { width: { ideal: 640 }, height: { ideal: 360 } } },
                    { audio: true, video: { facingMode: "user" } },
                    { audio: { echoCancellation: true }, video: true }
                ];
            for (var v = 0; v < videoTries.length; v++) {
                try {
                    return await tryGum(videoTries[v]);
                } catch (err) {
                    lastErr = err;
                }
            }

            // Camera failed — continue with mic only
            for (var a2 = 0; a2 < audioTries.length; a2++) {
                try {
                    var audioOnly = await tryGum({ audio: audioTries[a2], video: false });
                    if (!opts.silentFallback && !groupCtx && !opts.quiet && WC.toast) {
                        WC.toast("Camera unavailable — continuing with audio only.", "warning");
                    }
                    return audioOnly;
                } catch (err2) {
                    lastErr = err2;
                }
            }

            if (groupCtx || opts.allowSilent) {
                var silentVideo = createSilentAudioStream();
                if (silentVideo.getAudioTracks().length) {
                    muted = true;
                    updateMuteBtn();
                    return silentVideo;
                }
            }
            throwMediaError(lastErr || { name: "NotFoundError", message: "Requested device not found" });
        }

        // Serialize getUserMedia so group preview/accept/start share one attempt
        if (mediaAcquirePromise) {
            return mediaAcquirePromise;
        }

        mediaAcquirePromise = acquire().finally(function () {
            mediaAcquirePromise = null;
        });
        return mediaAcquirePromise;
    }

    function addTracksOrTransceivers(peerConnection, stream, wantVideo) {
        if (!peerConnection) return;
        var hasAudio = stream && stream.getAudioTracks().length > 0;
        var hasVideo = stream && stream.getVideoTracks().length > 0;
        if (stream) {
            stream.getTracks().forEach(function (track) {
                try { peerConnection.addTrack(track, stream); } catch (e) {}
            });
        }
        // Ensure SDP always negotiates audio (and video for video calls) so peers can connect
        if (!hasAudio) {
            try { peerConnection.addTransceiver("audio", { direction: "sendrecv" }); } catch (e) {}
        }
        if (wantVideo && !hasVideo) {
            try { peerConnection.addTransceiver("video", { direction: "recvonly" }); } catch (e) {}
        }
    }

    function sendIceCandidate(candidate) {
        if (!activeCallId || !candidate) return;
        WC.api("calls.php?action=signal", {
            method: "POST",
            body: {
                call_id: activeCallId,
                signal_type: "ice",
                payload: candidate
            }
        }).catch(function () {});
    }

    function flushPendingIce() {
        if (!pendingIce.length) return;
        pendingIce.forEach(function (c) { sendIceCandidate(c); });
        pendingIce = [];
    }

    function createPeer(wantVideo) {
        pendingIce = [];
        remoteStream = null;
        answerApplied = false;
        var cfg = WC.rtcConfig || { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
        pc = new RTCPeerConnection(cfg);

        pc.onconnectionstatechange = function () {
            if (!pc) return;
            if (pc.connectionState === "connecting") {
                setStatus("Connecting...");
            } else if (pc.connectionState === "connected") {
                stopRingtone();
                setStatus("Connected");
                playRemoteMedia();
                startCallTimer();
                updateCallPeopleUi();
            } else if (pc.connectionState === "failed") {
                setStatus("Connection failed");
                if (WC.toast) WC.toast("Unable to establish the call. Network may need a TURN server.", "warning");
            } else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
                setStatus("Call ended");
            }
        };

        pc.ontrack = function (ev) {
            if (ev.track) attachRemoteTrack(ev.track);
        };

        pc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            var payload = ev.candidate.toJSON();
            if (!activeCallId) {
                pendingIce.push(payload);
                return;
            }
            sendIceCandidate(payload);
        };
    }

    async function addLocalTracks(stream) {
        if (!pc) return;
        addTracksOrTransceivers(pc, stream, callType === "video");
        if (stream) {
            stream.getTracks().forEach(function (track) {
                try {
                    if (track.kind === "video") track.contentHint = "motion";
                    else if (track.kind === "audio") track.contentHint = "speech";
                } catch (e) {}
            });
            showLocalPreview(stream);
        }
        try {
            pc.getSenders().forEach(function (sender) {
                if (!sender.track) return;
                var params = sender.getParameters();
                if (!params.encodings || !params.encodings.length) params.encodings = [{}];
                if (sender.track.kind === "video") {
                    params.encodings[0].maxBitrate = 250000;
                    params.encodings[0].maxFramerate = 15;
                } else if (sender.track.kind === "audio") {
                    params.encodings[0].maxBitrate = 32000;
                }
                sender.setParameters(params).catch(function () {});
            });
        } catch (e) {}
    }

    async function pollSignals() {
        if (!activeCallId) return;
        try {
            var res = await WC.api("calls.php?action=poll_signals", {
                method: "GET",
                query: { call_id: activeCallId, after_id: signalAfterId }
            });
            var signals = (res.data && res.data.signals) || [];
            var myId = parseInt(WC.userId, 10) || 0;
            for (var i = 0; i < signals.length; i++) {
                var sig = signals[i];
                signalAfterId = Math.max(signalAfterId, sig.id);
                if (sig.sender_id && myId && parseInt(sig.sender_id, 10) === myId) continue;
                if (sig.signal_type === "ice" && sig.payload) {
                    try {
                        if (pc && pc.remoteDescription) {
                            await pc.addIceCandidate(new RTCIceCandidate(sig.payload));
                        }
                    } catch (e) {}
                } else if (sig.signal_type === "hangup") {
                    setStatus("Call ended");
                    endCallLocal();
                    return;
                }
            }
            if (res.data && ["ended", "rejected", "cancelled", "missed"].indexOf(res.data.status) >= 0) {
                setStatus("Call ended");
                endCallLocal();
            }
        } catch (e) {}
    }

    async function pollCallStatus() {
        if (!activeCallId) return;
        try {
            var res = await WC.api("calls.php?action=status", {
                method: "GET",
                query: { call_id: activeCallId }
            });
            var st = res.data.status;
            if (
                isCaller &&
                pc &&
                st === "accepted" &&
                !answerApplied &&
                res.data.sdp_answer &&
                pc.signalingState === "have-local-offer"
            ) {
                await pc.setRemoteDescription({
                    type: "answer",
                    sdp: normalizeSdp(res.data.sdp_answer)
                });
                answerApplied = true;
                stopRingtone();
                setStatus("Connecting...");
                playRemoteMedia();
                startCallTimer();
                updateCallPeopleUi();
            }
            if (st === "accepted") playRemoteMedia();
            if (res.data && res.data.group_id) {
                activeGroupId = parseInt(res.data.group_id, 10) || activeGroupId;
            }
            if (res.data && res.data.group_id && res.data.group_peers && res.data.group_peers.length) {
                applyGroupPeersUi(res.data.group_peers, {
                    people: res.data.group_connected_count || res.data.group_peer_count
                });
                if (st === "accepted") startCallTimer();
            }
            if (["ended", "rejected", "cancelled", "missed"].indexOf(st) >= 0) {
                setStatus(st === "rejected" ? "Call declined" : "Call ended");
                endCallLocal();
            }
        } catch (e) {}
    }

    function startPolling() {
        signalAfterId = 0;
        pollTimer = setInterval(pollSignals, (WC.poll && WC.poll.calls) || 500);
        statusPollTimer = setInterval(pollCallStatus, 700);
        pollSignals();
        pollCallStatus();
    }

    async function startCall(userId, type) {
        els();
        userId = parseInt(userId, 10);
        if (!userId || activeCallId || accepting) {
            if (activeCallId) WC.toast("You already have an active call.", "warning");
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            WC.toast("Calling is not supported in this browser.", "error");
            return;
        }
        try {
            localStream = await getMedia(type, { allowSilent: true, quiet: true });
            if (!localStream || !localStream.getTracks().length) {
                localStream = createSilentAudioStream();
            }
            createPeer(type === "video");
            await addLocalTracks(localStream);

            // Tracks already added via addTrack — createOffer includes them (avoid offerToReceive* duplicates)
            var offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            var localSdp = normalizeSdp((pc.localDescription && pc.localDescription.sdp) || offer.sdp);

            showOverlay(true);
            applyCallUi(type);
            hideAccept();
            setStatus("Calling...");
            setPeerInfo({ username: "Calling...", avatar: callAvatar ? callAvatar.src : "" });

            var res = await WC.api("calls.php?action=start", {
                method: "POST",
                body: {
                    callee_id: userId,
                    call_type: type,
                    sdp_offer: localSdp
                }
            });
            activeCallId = res.data.id;
            isCaller = true;
            flushPendingIce();
            setPeerInfo(res.data.peer);
            setStatus("Ringing...");
            startRingtone("outgoing");
            startPolling();
        } catch (e) {
            toastCallError(e, "Unable to start call.");
            endCallLocal();
        }
    }

    async function acceptIncoming(call) {
        els();
        if (!call || accepting) return;
        if (activeCallId && activeCallId !== call.id) return;
        accepting = true;
        activeCallId = call.id;
        isCaller = false;
        stopRingtone();
        hideAccept();
        setStatus("Connecting...");

        try {
            if (!localStream) {
                localStream = await getMedia(call.call_type, {
                    group: !!call.group_id,
                    call: call,
                    allowSilent: true,
                    quiet: true
                });
            } else if (call.call_type === "video" && localStream.getVideoTracks().length === 0) {
                // Upgrade preview audio-only to video if possible
                try {
                    var upgraded = await getMedia("video", {
                        group: !!call.group_id,
                        call: call,
                        quiet: true,
                        allowSilent: true,
                        silentFallback: true
                    });
                    if (upgraded && upgraded !== localStream) {
                        localStream.getTracks().forEach(function (t) { t.stop(); });
                        localStream = upgraded;
                    }
                } catch (e) {}
            }
            if (!localStream || !localStream.getTracks().length) {
                localStream = createSilentAudioStream();
            }

            createPeer(call.call_type === "video");
            await addLocalTracks(localStream);

            var offerSdp = call.sdp_offer || "";
            if (!offerSdp) {
                var st = await WC.api("calls.php?action=status", {
                    method: "GET",
                    query: { call_id: call.id }
                });
                offerSdp = normalizeSdp(st.data.sdp_offer || "");
            }

            await pc.setRemoteDescription({
                type: "offer",
                sdp: normalizeSdp(offerSdp)
            });

            var answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            var answerSdp = normalizeSdp((pc.localDescription && pc.localDescription.sdp) || answer.sdp);

            showOverlay(true);
            applyCallUi(call.call_type);
            setPeerInfo(call.peer);
            setStatus("Connecting...");
            if (call.group_id) {
                activeGroupId = parseInt(call.group_id, 10) || null;
            }
            if (call.group_peers && call.group_peers.length) {
                applyGroupPeersUi(call.group_peers, {
                    people: call.group_connected_count || call.group_peer_count
                });
            }

            var acceptRes = await WC.api("calls.php?action=accept", {
                method: "POST",
                body: { call_id: call.id, sdp_answer: answerSdp }
            });
            if (acceptRes.data && acceptRes.data.group_peers) {
                applyGroupPeersUi(acceptRes.data.group_peers, {
                    people: acceptRes.data.group_connected_count || acceptRes.data.group_peer_count
                });
            }

            pendingCall = null;
            flushPendingIce();
            startPolling();
            playRemoteMedia();
            accepting = false;
        } catch (e) {
            accepting = false;
            toastCallError(e, "Unable to accept call.", { group: !!(call && call.group_id) });
            try {
                await WC.api("calls.php?action=reject", {
                    method: "POST",
                    body: { call_id: call.id }
                });
            } catch (err) {}
            endCallLocal();
        }
    }

    function endCallLocal() {
        stopTimers();
        showOverlay(false);
        cleanup();
    }

    async function logGroupCallIfNeeded(outcome) {
        if (!activeGroupId) return;
        var participants = [];
        var myId = parseInt(WC.userId, 10) || 0;
        if (myId) participants.push(myId);
        var anyConnected = false;
        Object.keys(multiLegs).forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg) return;
            if (leg.userId) {
                var uid = parseInt(leg.userId, 10);
                if (uid && participants.indexOf(uid) < 0) participants.push(uid);
            }
            if (leg.connected || leg.answerApplied) anyConnected = true;
        });
        var resolved = outcome || (anyConnected ? "ended" : "cancelled");
        try {
            var gid = activeGroupId;
            await WC.api("calls.php?action=log_group_call", {
                method: "POST",
                body: {
                    group_id: gid,
                    call_type: callType || "voice",
                    outcome: resolved,
                    duration: getCallElapsedSec(),
                    batch_key: callBatchKey || "",
                    participants: participants
                }
            });
            try { window.dispatchEvent(new CustomEvent("wc:group-call-logged", { detail: { group_id: gid } })); } catch (ev) {}
        } catch (e) {}
    }

    async function endCall() {
        var pending = pendingCall;
        var legIds = Object.keys(multiLegs);
        if (legIds.length) {
            for (var i = 0; i < legIds.length; i++) {
                var callId = parseInt(legIds[i], 10);
                var leg = multiLegs[callId];
                try {
                    var stRes = await WC.api("calls.php?action=status", {
                        method: "GET",
                        query: { call_id: callId }
                    });
                    var action = "end";
                    if (stRes.data.status === "ringing") {
                        action = isCaller ? "cancel" : "reject";
                    }
                    await WC.api("calls.php?action=" + action, {
                        method: "POST",
                        body: { call_id: callId, skip_log: 1 }
                    });
                } catch (e) {}
                if (leg) leg.ended = true;
            }
            await logGroupCallIfNeeded();
        } else if (activeCallId) {
            var singleId = activeCallId;
            try {
                var stRes2 = await WC.api("calls.php?action=status", {
                    method: "GET",
                    query: { call_id: singleId }
                });
                var action2 = "end";
                if (stRes2.data.status === "ringing") {
                    action2 = isCaller ? "cancel" : "reject";
                }
                await WC.api("calls.php?action=" + action2, {
                    method: "POST",
                    body: { call_id: singleId }
                });
            } catch (e) {}
        } else if (pending) {
            try {
                await WC.api("calls.php?action=reject", {
                    method: "POST",
                    body: { call_id: pending.id }
                });
            } catch (e) {}
        }
        endCallLocal();
    }

    function toggleMute() {
        if (!localStream) {
            if (WC.toast) WC.toast("Microphone not ready yet.", "warning");
            return;
        }
        muted = !muted;
        localStream.getAudioTracks().forEach(function (t) { t.enabled = !muted; });
        updateMuteBtn();
    }

    function toggleCamera() {
        if (callType !== "video") return;
        if (!localStream) {
            if (WC.toast) WC.toast("Camera not ready yet.", "warning");
            return;
        }
        var tracks = localStream.getVideoTracks();
        if (!tracks.length) {
            if (WC.toast) WC.toast("No camera track on this call.", "warning");
            return;
        }
        cameraOff = !cameraOff;
        tracks.forEach(function (t) { t.enabled = !cameraOff; });
        updateCameraBtn();
        updateCallPeopleUi();
        syncMultiVideoGrid();
        rebuildHostVideoMix();
    }

    async function ensureIncomingPreview(call) {
        if (!call || call.call_type !== "video") return;
        if (localStream) {
            showLocalPreview(localStream);
            return;
        }
        try {
            localStream = await getMedia("video", {
                quiet: true,
                silentFallback: true,
                allowSilent: true,
                group: !!call.group_id,
                call: call
            });
            showLocalPreview(localStream);
        } catch (e) {
            // Preview is optional; accept can retry
        }
    }

    async function clearIncomingUi(reason) {
        if (activeCallId || accepting) return;
        if (!pendingCall && (!overlay || overlay.classList.contains("d-none"))) return;
        pendingCall = null;
        stopRingtone();
        setStatus(reason || "Call ended");
        // Brief status then close so caller/callee both leave the overlay
        setTimeout(function () {
            if (!activeCallId && !accepting) endCallLocal();
        }, 400);
    }

    async function pollIncoming() {
        if (activeCallId || accepting) return;
        try {
            var res = await WC.api("calls.php?action=incoming", { method: "GET", silent: true });
            var calls = (res.data && res.data.calls) || [];

            // Pending call vanished (rejected/cancelled/ended) — close overlay for this user
            if (!calls.length) {
                if (pendingCall) {
                    await clearIncomingUi("Call ended");
                }
                return;
            }

            var call = calls[0];

            // If we still have a pending id that is no longer ringing, drop it
            if (pendingCall && pendingCall.id !== call.id) {
                pendingCall = null;
            }

            if (pendingCall && pendingCall.id === call.id) {
                // Keep checking status in case it flipped without leaving the list race
                try {
                    var st = await WC.api("calls.php?action=status", {
                        method: "GET",
                        query: { call_id: pendingCall.id },
                        silent: true
                    });
                    if (st.data && ["ended", "rejected", "cancelled", "missed"].indexOf(st.data.status) >= 0) {
                        await clearIncomingUi(st.data.status === "rejected" ? "Call declined" : "Call ended");
                    }
                } catch (e2) {}
                return;
            }

            pendingCall = call;
            if (call.group_id) activeGroupId = parseInt(call.group_id, 10) || null;
            els();
            showOverlay(true);
            applyCallUi(call.call_type);
            setPeerInfo(call.peer);
            setStatus("Incoming " + (call.call_type === "video" ? "video" : "voice") + " call...");
            if (call.group_peers && call.group_peers.length) {
                applyGroupPeersUi(call.group_peers, {
                    people: call.group_peer_count || call.group_peers.length
                });
                setStatus("Incoming group " + (call.call_type === "video" ? "video" : "voice") + " call...");
            }
            showAccept();
            startRingtone("incoming");
            ensureIncomingPreview(call);
        } catch (e) {}
    }

    function bindUi() {
        if (uiBound) return;
        uiBound = true;
        els();
        document.addEventListener("click", unlockAudio, { once: true, passive: true });
        document.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
        document.addEventListener("keydown", unlockAudio, { once: true, passive: true });

        // Event delegation so buttons always work even if DOM re-queries
        if (overlay) {
            overlay.addEventListener("click", function (ev) {
                var t = ev.target.closest("button");
                if (!t) return;
                if (t.id === "btnMute") {
                    ev.preventDefault();
                    toggleMute();
                } else if (t.id === "btnCamera") {
                    ev.preventDefault();
                    toggleCamera();
                } else if (t.id === "btnEndCall") {
                    ev.preventDefault();
                    endCall();
                } else if (t.id === "btnAcceptCall") {
                    ev.preventDefault();
                    if (pendingCall) acceptIncoming(pendingCall);
                }
            });
        } else {
            if (btnMute) btnMute.addEventListener("click", toggleMute);
            if (btnCamera) btnCamera.addEventListener("click", toggleCamera);
            if (btnEnd) btnEnd.addEventListener("click", endCall);
            if (btnAccept) {
                btnAccept.addEventListener("click", function () {
                    if (pendingCall) acceptIncoming(pendingCall);
                });
            }
        }
    }

    function updateMultiStatus() {
        var ids = Object.keys(multiLegs);
        var connected = 0;
        var ringing = 0;
        var names = [];
        var peers = [];
        ids.forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg) return;
            if (leg.connected) {
                connected++;
                if (leg.peer) {
                    peers.push(leg.peer);
                    if (leg.peer.username) names.push(leg.peer.username);
                }
            } else if (!leg.ended) {
                ringing++;
            }
        });
        var allPeers = [];
        if (WC.userAvatar || WC.userName) {
            allPeers.push({
                username: WC.userName || "You",
                avatar: WC.userAvatar || "",
                connected: connected > 0,
                id: WC.userId,
                isSelf: true,
                _speakerKey: "local"
            });
        }
        ids.forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg || leg.ended || !leg.peer) return;
            allPeers.push(Object.assign({}, leg.peer, {
                connected: !!leg.connected,
                id: leg.userId || leg.peer.id,
                _speakerKey: leg.userId ? ("user-" + leg.userId) : ("leg-" + id)
            }));
        });
        if (allPeers.length) groupPeersCache = allPeers;

        if (connected > 0) {
            stopRingtone();
            var totalPeople = Math.max(connected + 1, allPeers.length);
            setStatus("Connected" + (names.length ? (" with " + names.join(", ")) : (" (" + connected + ")")));
            setPeerInfo({
                username: totalPeople + " connected",
                avatar: (peers[0] && peers[0].avatar) || (callAvatar ? callAvatar.src : "")
            });
            startCallTimer();
            applyGroupPeersUi(allPeers, { people: totalPeople });
            rebuildHostAudioMix();
            syncMultiVideoGrid();
            refreshSpeakerBindings();
        } else if (ringing > 0) {
            setStatus("Ringing " + ringing + " member" + (ringing > 1 ? "s" : "") + "...");
            if (allPeers.length) {
                renderParticipantAvatars(allPeers);
                if (peerNameEl) peerNameEl.textContent = allPeers.length + " people";
            }
        }
    }

    function sendIceForCall(callId, candidate) {
        if (!callId || !candidate) return;
        WC.api("calls.php?action=signal", {
            method: "POST",
            body: {
                call_id: callId,
                signal_type: "ice",
                payload: candidate
            }
        }).catch(function () {});
    }

    async function addMultiLeg(userId, type) {
        if (!localStream || !localStream.getTracks().length) {
            localStream = createSilentAudioStream();
        }
        var cfg = WC.rtcConfig || { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
        var legPc = new RTCPeerConnection(cfg);
        var leg = {
            pc: legPc,
            peer: null,
            answerApplied: false,
            pendingIce: [],
            signalAfterId: 0,
            userId: userId,
            callId: null,
            connected: false,
            ended: false
        };

        localStream.getTracks().forEach(function (track) {
            try {
                if (track.kind === "video") track.contentHint = "motion";
                else if (track.kind === "audio") track.contentHint = "speech";
            } catch (e) {}
        });
        addTracksOrTransceivers(legPc, localStream, type === "video");

        legPc.ontrack = function (ev) {
            if (ev.streams && ev.streams[0]) {
                leg.remoteStream = ev.streams[0];
            } else if (ev.track) {
                if (!leg.remoteStream) leg.remoteStream = new MediaStream();
                if (!leg.remoteStream.getTracks().some(function (t) { return t.id === ev.track.id; })) {
                    leg.remoteStream.addTrack(ev.track);
                }
            }
            if (ev.track) attachRemoteTrack(ev.track);
            rebuildHostAudioMix();
            syncMultiVideoGrid();
            updateCallPeopleUi();
        };
        legPc.onconnectionstatechange = function () {
            if (!legPc) return;
            if (legPc.connectionState === "connected") {
                leg.connected = true;
                updateMultiStatus();
                playRemoteMedia();
            } else if (legPc.connectionState === "failed") {
                leg.ended = true;
                updateMultiStatus();
            }
        };
        legPc.onicecandidate = function (ev) {
            if (!ev.candidate) return;
            var payload = ev.candidate.toJSON();
            if (!leg.callId) {
                leg.pendingIce.push(payload);
                return;
            }
            sendIceForCall(leg.callId, payload);
        };

        var offer = await legPc.createOffer();
        await legPc.setLocalDescription(offer);
        var localSdp = normalizeSdp((legPc.localDescription && legPc.localDescription.sdp) || offer.sdp);

        var startBody = {
            callee_id: userId,
            call_type: type,
            sdp_offer: localSdp,
            batch: 1
        };
        if (activeGroupId) startBody.group_id = activeGroupId;

        var res = await WC.api("calls.php?action=start", {
            method: "POST",
            body: startBody
        });

        leg.callId = res.data.id;
        leg.peer = res.data.peer;
        multiLegs[leg.callId] = leg;
        leg.pendingIce.forEach(function (c) { sendIceForCall(leg.callId, c); });
        leg.pendingIce = [];
        if (!activeCallId) activeCallId = leg.callId;
        return leg;
    }

    async function pollMultiLegs() {
        var ids = Object.keys(multiLegs);
        if (!ids.length) return;
        var alive = 0;
        for (var i = 0; i < ids.length; i++) {
            var callId = parseInt(ids[i], 10);
            var leg = multiLegs[callId];
            if (!leg || leg.ended) continue;
            try {
                var res = await WC.api("calls.php?action=status", {
                    method: "GET",
                    query: { call_id: callId }
                });
                var st = res.data.status;
                if (
                    leg.pc &&
                    st === "accepted" &&
                    !leg.answerApplied &&
                    res.data.sdp_answer &&
                    leg.pc.signalingState === "have-local-offer"
                ) {
                    await leg.pc.setRemoteDescription({
                        type: "answer",
                        sdp: normalizeSdp(res.data.sdp_answer)
                    });
                    leg.answerApplied = true;
                    leg.connected = true;
                    updateMultiStatus();
                    playRemoteMedia();
                }
                if (["ended", "rejected", "cancelled", "missed"].indexOf(st) >= 0) {
                    leg.ended = true;
                    leg.connected = false;
                    try {
                        leg.pc.close();
                    } catch (e) {}
                } else {
                    alive++;
                }

                var sigRes = await WC.api("calls.php?action=poll_signals", {
                    method: "GET",
                    query: { call_id: callId, after_id: leg.signalAfterId || 0 }
                });
                var signals = (sigRes.data && sigRes.data.signals) || [];
                var myId = parseInt(WC.userId, 10) || 0;
                for (var s = 0; s < signals.length; s++) {
                    var sig = signals[s];
                    leg.signalAfterId = Math.max(leg.signalAfterId || 0, sig.id);
                    if (sig.sender_id && myId && parseInt(sig.sender_id, 10) === myId) continue;
                    if (sig.signal_type === "ice" && sig.payload && leg.pc && leg.pc.remoteDescription) {
                        try {
                            await leg.pc.addIceCandidate(new RTCIceCandidate(sig.payload));
                        } catch (e) {}
                    } else if (sig.signal_type === "hangup") {
                        leg.ended = true;
                    }
                }
            } catch (e) {}
        }
        updateMultiStatus();
        if (alive === 0) {
            setStatus("Call ended");
            var gid = activeGroupId;
            var batch = callBatchKey;
            var ctype = callType;
            var dur = getCallElapsedSec();
            var parts = [];
            var myId = parseInt(WC.userId, 10) || 0;
            if (myId) parts.push(myId);
            var anyConnected = false;
            Object.keys(multiLegs).forEach(function (id) {
                var leg = multiLegs[id];
                if (!leg) return;
                if (leg.userId) {
                    var uid = parseInt(leg.userId, 10);
                    if (uid && parts.indexOf(uid) < 0) parts.push(uid);
                }
                if (leg.connected || leg.answerApplied) anyConnected = true;
            });
            if (gid) {
                WC.api("calls.php?action=log_group_call", {
                    method: "POST",
                    body: {
                        group_id: gid,
                        call_type: ctype || "voice",
                        outcome: anyConnected ? "ended" : "cancelled",
                        duration: dur,
                        batch_key: batch || "",
                        participants: parts
                    }
                }).then(function () {
                    try { window.dispatchEvent(new CustomEvent("wc:group-call-logged", { detail: { group_id: gid } })); } catch (e) {}
                }).catch(function () {});
            }
            endCallLocal();
        }
    }

    async function startMulti(userIds, type, groupId) {
        els();
        type = type === "video" ? "video" : "voice";
        var ids = [];
        (userIds || []).forEach(function (id) {
            id = parseInt(id, 10);
            if (id && id !== WC.userId && ids.indexOf(id) < 0) ids.push(id);
        });
        if (!ids.length) {
            if (WC.toast) WC.toast("Select at least one member.", "warning");
            return;
        }
        if (ids.length === 1 && !(groupId && parseInt(groupId, 10))) {
            return startCall(ids[0], type);
        }
        if (activeCallId || accepting || multiMode || startingMulti) {
            if (WC.toast) WC.toast("You already have an active call.", "warning");
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (WC.toast) WC.toast("Calling is not supported in this browser.", "error");
            return;
        }

        startingMulti = true;
        try {
            multiMode = true;
            multiLegs = {};
            activeGroupId = groupId ? (parseInt(groupId, 10) || null) : null;
            callBatchKey = activeGroupId
                ? ("g" + activeGroupId + "_" + Date.now() + "_" + (WC.userId || 0))
                : ("m_" + Date.now() + "_" + (WC.userId || 0));
            localStream = await getMedia(type, { group: true, allowSilent: true });
            if (!localStream || !localStream.getTracks().length) {
                localStream = createSilentAudioStream();
            }
            isCaller = true;
            callType = type;
            showOverlay(true);
            applyCallUi(type);
            hideAccept();
            setPeerInfo({ username: ids.length + " members", avatar: callAvatar ? callAvatar.src : "" });
            setStatus("Calling " + ids.length + " members...");
            startRingtone("outgoing");
            showLocalPreview(localStream);

            for (var i = 0; i < ids.length; i++) {
                await addMultiLeg(ids[i], type);
            }

            stopTimers();
            pollTimer = setInterval(pollMultiLegs, (WC.poll && WC.poll.calls) || 500);
            statusPollTimer = setInterval(pollMultiLegs, 700);
            pollMultiLegs();
            updateMultiStatus();
            startingMulti = false;
        } catch (e) {
            startingMulti = false;
            toastCallError(e, "Unable to start call.", { group: true });
            endCallLocal();
        }
    }

    WC.Calls = {
        startVoice: function (userId) { return startCall(userId, "voice"); },
        startVideo: function (userId) { return startCall(userId, "video"); },
        startMulti: startMulti,
        pollIncoming: pollIncoming,
        end: endCall,
        acceptPending: function () {
            if (pendingCall) return acceptIncoming(pendingCall);
        },
        rejectPending: endCall
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindUi);
    } else {
        bindUi();
    }
})();
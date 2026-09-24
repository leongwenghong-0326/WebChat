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
            img.alt = "";
            img.src = (peer && peer.avatar) || fallback || "";
            stack.appendChild(img);
        }
        if (peers.length > 3) {
            var more = document.createElement("span");
            more.className = "wc-call-more";
            more.textContent = "+" + (peers.length - 3);
            stack.appendChild(more);
        }
        callAvatar = WC.$("#callAvatar");
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
                    avatar: callAvatar.src
                }]);
            }
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
        if (localVideo) localVideo.classList.remove("d-none");
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
        if (!videoMixCanvas || !videoMixCtx || !multiMode || !isCaller || callType !== "video") {
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
        if (!multiMode || !isCaller || callType !== "video") {
            stopHostVideoMix();
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
                stream: leg.remoteStream,
                label: (leg.peer && leg.peer.username) || "Member",
                muted: true
            });
        });
        tiles.push({
            key: "local",
            stream: localStream,
            label: WC.userName || "You",
            muted: true
        });

        if (tiles.length <= 1) {
            // Still ringing / waiting — keep classic layout
            clearMultiVideoGrid();
            return;
        }

        videoArea.classList.add("is-multi-grid");
        if (remoteVideo) remoteVideo.classList.add("d-none");
        if (localVideo) localVideo.classList.add("d-none");
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
                if (tile.legId) v.setAttribute("data-leg", String(tile.legId));
                else v.setAttribute("data-tile-video", "local");
                wrap.appendChild(v);
                var lab = document.createElement("div");
                lab.className = "wc-call-tile-label";
                wrap.appendChild(lab);
                grid.appendChild(wrap);
            }
            var videoEl = wrap.querySelector("video");
            var labelEl = wrap.querySelector(".wc-call-tile-label");
            if (labelEl) labelEl.textContent = tile.label || "";
            if (videoEl && tile.stream && videoEl.srcObject !== tile.stream) {
                videoEl.srcObject = tile.stream;
            }
            if (videoEl) {
                videoEl.muted = true;
                var p = videoEl.play();
                if (p && typeof p.catch === "function") p.catch(function () {});
            }
        });

        Object.keys(existing).forEach(function (key) {
            if (!keep[key] && existing[key].parentNode) {
                existing[key].parentNode.removeChild(existing[key]);
            }
        });

        rebuildHostVideoMix();
    }

    function attachRemoteTrack(track) {
        if (!remoteStream) remoteStream = new MediaStream();
        if (!remoteStream.getTracks().some(function (t) { return t.id === track.id; })) {
            remoteStream.addTrack(track);
        }
        if (remoteAudio) remoteAudio.srcObject = remoteStream;
        if (!(multiMode && callType === "video")) {
            if (remoteVideo) remoteVideo.srcObject = remoteStream;
        }
        playRemoteMedia();
        syncMultiVideoGrid();
    }

    function showLocalPreview(stream) {
        if (!localVideo || !stream) return;
        localVideo.srcObject = stream;
        localVideo.muted = true;
        localVideo.setAttribute("playsinline", "true");
        localVideo.play().catch(function () {});
        syncMultiVideoGrid();
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
        closeMultiLegs();
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            try { pc.close(); } catch (e) {}
            pc = null;
        }
        if (localStream) {
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

    async function getMedia(type, opts) {
        opts = opts || {};
        var audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        if (type !== "video") {
            return navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        }

        var videoTries = [
            {
                facingMode: "user",
                width: { ideal: 320, max: 480 },
                height: { ideal: 240, max: 360 },
                frameRate: { ideal: 15, max: 20 }
            },
            { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
            { facingMode: "user", frameRate: { ideal: 15 } }
        ];

        var lastErr = null;
        for (var i = 0; i < videoTries.length; i++) {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                    video: videoTries[i]
                });
            } catch (err) {
                lastErr = err;
            }
        }

        // Last resort: audio only so call can still connect
        try {
            if (!opts.quiet && WC.toast) {
                WC.toast("Camera unavailable — continuing with audio only.", "warning");
            }
            return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        } catch (err2) {
            throw lastErr || err2;
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
        if (!pc || !stream) return;
        stream.getTracks().forEach(function (track) {
            var exists = pc.getSenders().some(function (s) {
                return s.track && s.track.id === track.id;
            });
            if (!exists) {
                try {
                    pc.addTrack(track, stream);
                } catch (e) {}
            }
            try {
                if (track.kind === "video") track.contentHint = "motion";
                else if (track.kind === "audio") track.contentHint = "speech";
            } catch (e) {}
        });
        showLocalPreview(stream);
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
            localStream = await getMedia(type);
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
            WC.toast((e && e.message) ? e.message : "Unable to start call.", "error");
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
                localStream = await getMedia(call.call_type);
            } else if (call.call_type === "video" && localStream.getVideoTracks().length === 0) {
                // Upgrade preview audio-only to video if possible
                try {
                    var upgraded = await getMedia("video");
                    localStream.getTracks().forEach(function (t) { t.stop(); });
                    localStream = upgraded;
                } catch (e) {}
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
            var msg = (e && e.message) ? e.message : "Unable to accept call.";
            if (WC.toast) WC.toast(msg, "error");
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
            localStream = await getMedia("video", { quiet: true });
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
            allPeers.push({ username: WC.userName || "You", avatar: WC.userAvatar || "", connected: connected > 0 });
        }
        ids.forEach(function (id) {
            var leg = multiLegs[id];
            if (!leg || leg.ended || !leg.peer) return;
            allPeers.push(Object.assign({}, leg.peer, { connected: !!leg.connected }));
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
            try { legPc.addTrack(track, localStream); } catch (e) {}
        });

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
        if (activeCallId || accepting || multiMode) {
            if (WC.toast) WC.toast("You already have an active call.", "warning");
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (WC.toast) WC.toast("Calling is not supported in this browser.", "error");
            return;
        }

        try {
            multiMode = true;
            multiLegs = {};
            activeGroupId = groupId ? (parseInt(groupId, 10) || null) : null;
            callBatchKey = activeGroupId
                ? ("g" + activeGroupId + "_" + Date.now() + "_" + (WC.userId || 0))
                : ("m_" + Date.now() + "_" + (WC.userId || 0));
            localStream = await getMedia(type);
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
        } catch (e) {
            if (WC.toast) WC.toast((e && e.message) ? e.message : "Unable to start call.", "error");
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
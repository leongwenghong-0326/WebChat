<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

require_login();

$pageTitle = 'Chat';
$activeNav = 'chat';
$pageScripts = ['chat.js'];

$initialPeer = int_input('peer', 0);

require __DIR__ . '/includes/layout_start.php';
?>

<div class="wc-chat-shell" id="chatShell">
    <aside class="wc-chat-col wc-chat-col-conversations" id="chatConversationsCol">
        <div class="wc-chat-col-header">Messages</div>
        <div class="wc-chat-conversations" id="conversationList"></div>
    </aside>

    <section class="wc-chat-col wc-chat-col-main wc-chat-main" id="chatMainCol">
        <div class="wc-chat-header" id="chatHeader">
            <button type="button" class="btn btn-sm btn-light wc-mobile-back" id="btnBackToList" aria-label="Back">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <button type="button" class="wc-group-avatar-btn" id="btnChatHeaderAvatar" title="Contact info" aria-label="Open contact info">
                <img src="<?= e(APP_URL) ?>/assets/images/default-avatar.svg" alt="" class="wc-avatar" id="chatHeaderAvatar">
            </button>
            <button type="button" class="flex-grow-1 min-w-0 text-start border-0 bg-transparent p-0" id="btnOpenContactInfo" title="Contact info">
                <div class="fw-semibold text-truncate" id="chatHeaderName">Select a conversation</div>
                <div class="small text-muted" id="chatHeaderStatus"></div>
            </button>
            <div class="wc-chat-header-actions d-none" id="chatHeaderActions">
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnVoiceCall" title="Voice call">
                    <i class="fa-solid fa-phone"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnVideoCall" title="Video call">
                    <i class="fa-solid fa-video"></i>
                </button>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary d-lg-none" id="btnShowInfo" title="Contact info">
                <i class="fa-solid fa-circle-info"></i>
            </button>
        </div>

        <div class="wc-chat-messages" id="chatMessages">
            <div class="wc-chat-empty">
                <div>
                    <i class="fa-regular fa-comments fa-3x mb-3 text-primary"></i>
                    <p class="mb-0">Choose a friend to start chatting.</p>
                </div>
            </div>
        </div>

        <div class="wc-typing-indicator" id="typingIndicator"></div>

        <div class="wc-block-banner d-none" id="chatBlockBanner" role="status"></div>

        <div class="wc-chat-composer" id="chatComposer" style="display:none;">

            <div class="wc-attach-preview" id="attachPreview">
                <div class="wc-attach-preview-main">
                    <img id="attachPreviewImg" alt="" class="d-none">
                    <div class="wc-attach-preview-meta">
                        <strong id="attachPreviewTitle">Attachment</strong>
                        <div class="small text-muted text-truncate" id="attachPreviewName"></div>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-link text-danger" id="btnClearAttach" title="Remove">Remove</button>
            </div>

            <div class="wc-voice-recording" id="voiceRecordingBar">
                <div class="wc-voice-recording-info">
                    <i class="fa-solid fa-circle text-danger wc-rec-pulse"></i>
                    <span>Recording... <span id="voiceTimer">0:00</span></span>
                </div>
                <div class="wc-voice-recording-actions">
                    <button type="button" class="btn btn-sm btn-outline-danger" id="btnCancelVoice">Cancel</button>
                    <button type="button" class="btn btn-sm btn-primary" id="btnSendVoice">Send</button>
                </div>
            </div>

            <div class="wc-composer-row">
                <div class="wc-composer-tools">
                    <button type="button" id="btnAttachImage" title="Send image"><i class="fa-solid fa-image"></i></button>
                    <button type="button" id="btnAttachFile" title="Send file"><i class="fa-solid fa-paperclip"></i></button>
                    <button type="button" id="btnCancelReply" class="d-none" title="Cancel reply"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="wc-composer-field">
                    <textarea id="messageInput" class="form-control" rows="1" placeholder="Type a message..." maxlength="4000"></textarea>
                    <div class="wc-composer-field-actions">
                        <button type="button" id="btnEmoji" title="Emoji"><i class="fa-regular fa-face-smile"></i></button>
                        <button type="button" id="btnVoice" title="Voice message"><i class="fa-solid fa-microphone"></i></button>
                    </div>
                </div>
                <button type="button" class="btn btn-primary wc-send-btn" id="btnSendMessage" title="Send">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
            <div class="wc-emoji-picker" id="emojiPicker"></div>
            <input type="file" id="imageInput" accept="image/*" hidden>
            <input type="file" id="fileInput" hidden>
        </div>
    </section>

    <aside class="wc-chat-col wc-chat-col-info" id="chatInfoCol">
        <div class="wc-chat-col-header d-flex align-items-center justify-content-between">
            <span>Contact Info</span>
            <button type="button" class="btn btn-sm btn-light" id="btnCloseInfo" title="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="wc-contact-panel" id="contactPanel">
            <div class="wc-chat-empty">
                <p class="mb-0">Select a conversation to view details.</p>
            </div>
        </div>
    </aside>
</div>

<div class="wc-reaction-picker" id="reactionPicker"></div>

<script>
window.WC = window.WC || {};
WC.initialPeerId = <?= json_encode($initialPeer > 0 ? $initialPeer : null) ?>;
WC.reactionEmojis = <?= json_encode(allowed_reaction_emojis()) ?>;
</script>

<?php require __DIR__ . '/includes/layout_end.php'; ?>

<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
require_login();

$groupId = (int) ($_GET['id'] ?? 0);
if ($groupId <= 0) {
    redirect('groups.php');
}

$pageTitle = 'Group Chat';
$activeNav = 'groups';
$pageScripts = ['groups.js'];

require __DIR__ . '/includes/layout_start.php';
?>
<div class="wc-chat-shell wc-group-shell has-peer" id="groupChatShell" data-group-id="<?= e((string) $groupId) ?>">
    <section class="wc-chat-col wc-chat-col-main wc-chat-main" id="groupMainCol">
        <div class="wc-chat-header" id="groupChatHeader">
            <a href="<?= e(APP_URL) ?>/groups.php" class="btn btn-sm btn-light wc-mobile-back" id="btnBackToGroups" aria-label="Back" title="Back to groups">
                <i class="fa-solid fa-arrow-left"></i>
            </a>
            <button type="button" class="wc-group-avatar-btn" id="btnGroupAvatar" title="Group info" aria-label="Open group info">
                <img src="<?= e(APP_URL) ?>/assets/images/default-avatar.svg" alt="" class="wc-avatar" id="groupHeaderAvatar">
            </button>
            <input type="file" id="groupAvatarInput" class="d-none" accept="image/jpeg,image/png,image/gif,image/webp">
            <button type="button" class="flex-grow-1 min-w-0 text-start border-0 bg-transparent p-0" id="btnOpenGroupInfo" title="Group info">
                <div class="fw-semibold text-truncate" id="groupHeaderName">Group</div>
                <div class="small text-muted" id="groupHeaderStatus">Loading...</div>
            </button>
            <div class="wc-chat-header-actions" id="groupHeaderActions">
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnGroupVoiceCall" title="Voice call">
                    <i class="fa-solid fa-phone"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" id="btnGroupVideoCall" title="Video call">
                    <i class="fa-solid fa-video"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger d-none" id="btnLeaveGroup" title="Leave group">Leave</button>
                <button type="button" class="btn btn-sm btn-outline-danger d-none" id="btnDeleteGroup" title="Delete group">Delete</button>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary d-lg-none" id="btnShowGroupInfo" title="Group info">
                <i class="fa-solid fa-circle-info"></i>
            </button>
        </div>

        <div class="wc-chat-messages" id="groupMessages">
            <div class="wc-chat-empty">
                <div>
                    <i class="fa-solid fa-users fa-3x mb-3 text-primary"></i>
                    <p class="mb-0">Loading messages...</p>
                </div>
            </div>
        </div>

        <div class="wc-typing-indicator" id="groupTyping"></div>

        <div class="wc-chat-composer" id="groupComposer">
            <div class="wc-attach-preview" id="groupAttachPreview">
                <div class="wc-attach-preview-main">
                    <img id="groupAttachPreviewImg" alt="" class="d-none">
                    <div class="wc-attach-preview-meta">
                        <strong id="groupAttachPreviewTitle">Attachment</strong>
                        <div class="small text-muted text-truncate" id="groupAttachPreviewName"></div>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-link text-danger" id="btnGroupClearAttach" title="Remove">Remove</button>
            </div>

            <div class="wc-voice-recording" id="groupVoiceRecordingBar">
                <div class="wc-voice-recording-info">
                    <i class="fa-solid fa-circle text-danger wc-rec-pulse"></i>
                    <span>Recording... <span id="groupVoiceTimer">0:00</span></span>
                </div>
                <div class="wc-voice-recording-actions">
                    <button type="button" class="btn btn-sm btn-outline-danger" id="btnGroupCancelVoice">Cancel</button>
                    <button type="button" class="btn btn-sm btn-primary" id="btnGroupSendVoice">Send</button>
                </div>
            </div>

            <div class="wc-composer-row">
                <div class="wc-composer-tools">
                    <button type="button" id="btnGroupAttachImage" title="Send image"><i class="fa-solid fa-image"></i></button>
                    <button type="button" id="btnGroupAttachFile" title="Send file"><i class="fa-solid fa-paperclip"></i></button>
                    <button type="button" id="btnGroupCancelReply" class="d-none" title="Cancel reply"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="wc-composer-field">
                    <textarea id="groupMessageInput" class="form-control" rows="1" placeholder="Type a message..." maxlength="4000"></textarea>
                    <div class="wc-composer-field-actions">
                        <button type="button" id="btnGroupEmoji" title="Emoji"><i class="fa-regular fa-face-smile"></i></button>
                        <button type="button" id="btnGroupVoice" title="Voice message"><i class="fa-solid fa-microphone"></i></button>
                    </div>
                </div>
                <button type="button" class="btn btn-primary wc-send-btn" id="btnGroupSendMessage" title="Send">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
            <div class="wc-emoji-picker" id="groupEmojiPicker"></div>
            <input type="file" id="groupImageInput" accept="image/*" hidden>
            <input type="file" id="groupFileInput" hidden>
        </div>
    </section>

    <aside class="wc-chat-col wc-chat-col-info" id="groupInfoCol">
        <div class="wc-chat-col-header d-flex align-items-center justify-content-between">
            <span>Members</span>
            <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-sm btn-primary d-none" id="btnAddMember" data-bs-toggle="modal" data-bs-target="#addMemberModal">
                    <i class="fa-solid fa-user-plus"></i> Add
                </button>
                <button type="button" class="btn btn-sm btn-light" id="btnCloseGroupInfo" title="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="wc-contact-panel flex-grow-1 overflow-auto p-0">
            <div class="wc-group-info-avatar p-3 text-center border-bottom" id="groupInfoAvatarBlock">
                <button type="button" class="wc-group-avatar-btn wc-group-avatar-btn-lg" id="btnGroupAvatarInfo" title="Group photo">
                    <img src="<?= e(APP_URL) ?>/assets/images/default-avatar.svg" alt="" class="wc-avatar wc-avatar-lg" id="groupInfoAvatar">
                    <span class="wc-group-avatar-edit d-none" id="groupAvatarEditBadgeInfo"><i class="fa-solid fa-camera"></i></span>
                </button>
                <div class="small text-muted mt-2 d-none" id="groupAvatarHint">Tap to change group photo</div>
                <div class="fw-semibold mt-2" id="groupInfoName">Group</div>
                <div class="small text-muted mt-1 px-2" id="groupInfoDescription">No description</div>
                <button type="button" class="btn btn-sm btn-outline-primary mt-2 d-none" id="btnEditGroupInfo">
                    <i class="fa-solid fa-pen"></i> Edit name &amp; description
                </button>
            </div>
            <ul class="list-group list-group-flush" id="groupMembers">
                <li class="list-group-item text-muted">Loading...</li>
            </ul>
        </div>
    </aside>
</div>

<div class="wc-reaction-picker" id="groupReactionPicker"></div>

<div class="modal fade" id="groupCallModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="groupCallModalTitle">Call member</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted mb-2">Choose one or more members to call. Tap again to unselect.</p>
                <div id="groupCallMemberList" class="list-group list-group-flush wc-call-picker-list">
                    <div class="text-muted p-2">Loading members...</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="btnStartGroupCall" disabled>
                    <i class="fa-solid fa-phone" id="btnStartGroupCallIcon"></i>
                    <span id="btnStartGroupCallLabel">Start call</span>
                </button>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="editGroupModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <form id="editGroupForm">
                <div class="modal-header">
                    <h5 class="modal-title">Edit group</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label" for="editGroupName">Group name</label>
                        <input type="text" class="form-control" id="editGroupName" maxlength="120" required>
                    </div>
                    <div class="mb-0">
                        <label class="form-label" for="editGroupDescription">Description</label>
                        <textarea class="form-control" id="editGroupDescription" rows="3" maxlength="500"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>
</div>

<div class="modal fade" id="addMemberModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <form id="addMemberForm">
                <div class="modal-header">
                    <h5 class="modal-title">Add member</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-muted mb-2">You can only add friends who are not already in this group.</p>
                    <label class="form-label" for="addMemberSelect">Friend</label>
                    <select class="form-select" id="addMemberSelect" required>
                        <option value="">Loading friends...</option>
                    </select>
                    <div class="form-text" id="addMemberHint"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="btnConfirmAddMember">Add to group</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
window.WC = window.WC || {};
WC.initialGroupId = <?= json_encode($groupId) ?>;
WC.reactionEmojis = <?= json_encode(allowed_reaction_emojis()) ?>;
</script>
<?php require __DIR__ . '/includes/layout_end.php'; ?>
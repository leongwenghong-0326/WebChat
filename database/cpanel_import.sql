-- WebConnect cPanel import
-- Database: synergy1_leongwenghong_webchat
-- In phpMyAdmin: select this database first, then Import this file
-- (Or run as-is; USE statement is included)
-- WebConnect Database Schema
-- utf8mb4 / utf8mb4_unicode_ci
-- Import into a fresh MySQL/MariaDB database

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

USE `synergy1_leongwenghong_webchat`;

DROP TABLE IF EXISTS `rate_limits`;
DROP TABLE IF EXISTS `reports`;
DROP TABLE IF EXISTS `post_shares`;
DROP TABLE IF EXISTS `post_likes`;
DROP TABLE IF EXISTS `post_comments`;
DROP TABLE IF EXISTS `forum_posts`;
DROP TABLE IF EXISTS `forums`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `voice_call_signals`;
DROP TABLE IF EXISTS `voice_call_sessions`;
DROP TABLE IF EXISTS `group_message_reads`;
DROP TABLE IF EXISTS `group_message_reactions`;
DROP TABLE IF EXISTS `group_messages`;
DROP TABLE IF EXISTS `group_members`;
DROP TABLE IF EXISTS `group_chats`;
DROP TABLE IF EXISTS `typing_indicators`;
DROP TABLE IF EXISTS `message_read_receipts`;
DROP TABLE IF EXISTS `message_reactions`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `user_blocks`;
DROP TABLE IF EXISTS `friendships`;
DROP TABLE IF EXISTS `friend_requests`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `admins`;

CREATE TABLE `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_username` (`username`),
  UNIQUE KEY `uq_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `avatar` VARCHAR(255) NULL DEFAULT NULL,
  `status_message` VARCHAR(255) NULL DEFAULT NULL,
  `presence` ENUM('online','away','offline','busy') NOT NULL DEFAULT 'offline',
  `last_seen_at` DATETIME NULL DEFAULT NULL,
  `last_activity_at` DATETIME NULL DEFAULT NULL,
  `is_disabled` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_presence` (`presence`),
  KEY `idx_users_last_activity` (`last_activity_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `friend_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sender_id` INT UNSIGNED NOT NULL,
  `receiver_id` INT UNSIGNED NOT NULL,
  `status` ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_friend_req_pair` (`sender_id`,`receiver_id`),
  KEY `idx_friend_req_receiver_status` (`receiver_id`,`status`),
  CONSTRAINT `fk_friend_req_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friend_req_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `friendships` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `friend_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_friendship_pair` (`user_id`,`friend_id`),
  KEY `idx_friendships_friend` (`friend_id`),
  CONSTRAINT `fk_friendships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_friendships_friend` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_blocks` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `blocker_id` INT UNSIGNED NOT NULL,
  `blocked_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_block_pair` (`blocker_id`,`blocked_id`),
  KEY `idx_blocks_blocked` (`blocked_id`),
  CONSTRAINT `fk_blocks_blocker` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_blocks_blocked` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sender_id` INT UNSIGNED NOT NULL,
  `receiver_id` INT UNSIGNED NOT NULL,
  `message_type` ENUM('text','image','file','voice','call') NOT NULL DEFAULT 'text',
  `body` TEXT NULL,
  `file_path` VARCHAR(255) NULL DEFAULT NULL,
  `file_name` VARCHAR(255) NULL DEFAULT NULL,
  `mime_type` VARCHAR(120) NULL DEFAULT NULL,
  `file_size` INT UNSIGNED NULL DEFAULT NULL,
  `voice_duration` DECIMAL(8,2) NULL DEFAULT NULL,
  `reply_to_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `delivery_status` ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent',
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_pair_created` (`sender_id`,`receiver_id`,`created_at`),
  KEY `idx_messages_receiver_created` (`receiver_id`,`created_at`),
  KEY `idx_messages_reply` (`reply_to_id`),
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `message_reactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_msg_reaction` (`message_id`,`user_id`,`emoji`),
  KEY `idx_msg_reactions_user` (`user_id`),
  CONSTRAINT `fk_msg_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `message_read_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_msg_read` (`message_id`,`user_id`),
  KEY `idx_msg_read_user` (`user_id`),
  CONSTRAINT `fk_msg_read_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_read_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `typing_indicators` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `conversation_type` ENUM('private','group') NOT NULL DEFAULT 'private',
  `target_id` INT UNSIGNED NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_typing` (`user_id`,`conversation_type`,`target_id`),
  KEY `idx_typing_expires` (`expires_at`),
  CONSTRAINT `fk_typing_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `group_chats` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `avatar` VARCHAR(255) NULL DEFAULT NULL,
  `owner_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_group_owner` (`owner_id`),
  CONSTRAINT `fk_group_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `group_members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role` ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_member` (`group_id`,`user_id`),
  KEY `idx_group_members_user` (`user_id`),
  CONSTRAINT `fk_group_members_group` FOREIGN KEY (`group_id`) REFERENCES `group_chats` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `group_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` INT UNSIGNED NOT NULL,
  `sender_id` INT UNSIGNED NOT NULL,
  `message_type` ENUM('text','image','file','voice','call') NOT NULL DEFAULT 'text',
  `body` TEXT NULL,
  `file_path` VARCHAR(255) NULL DEFAULT NULL,
  `file_name` VARCHAR(255) NULL DEFAULT NULL,
  `mime_type` VARCHAR(120) NULL DEFAULT NULL,
  `file_size` INT UNSIGNED NULL DEFAULT NULL,
  `voice_duration` DECIMAL(8,2) NULL DEFAULT NULL,
  `reply_to_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gmsg_group_created` (`group_id`,`created_at`),
  KEY `idx_gmsg_sender` (`sender_id`),
  KEY `idx_gmsg_reply` (`reply_to_id`),
  CONSTRAINT `fk_gmsg_group` FOREIGN KEY (`group_id`) REFERENCES `group_chats` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gmsg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gmsg_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `group_messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `group_message_reactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gmsg_reaction` (`message_id`,`user_id`,`emoji`),
  KEY `idx_gmsg_reactions_user` (`user_id`),
  CONSTRAINT `fk_gmsg_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `group_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gmsg_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `group_message_reads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gmsg_read` (`message_id`,`user_id`),
  KEY `idx_gmsg_read_user` (`user_id`),
  CONSTRAINT `fk_gmsg_read_message` FOREIGN KEY (`message_id`) REFERENCES `group_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gmsg_read_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voice_call_sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `caller_id` INT UNSIGNED NOT NULL,
  `callee_id` INT UNSIGNED NOT NULL,
  `group_id` INT UNSIGNED NULL DEFAULT NULL,
  `call_type` ENUM('voice','video') NOT NULL DEFAULT 'voice',
  `status` ENUM('ringing','accepted','rejected','ended','missed','cancelled') NOT NULL DEFAULT 'ringing',
  `sdp_offer` MEDIUMTEXT NULL,
  `sdp_answer` MEDIUMTEXT NULL,
  `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `answered_at` DATETIME NULL DEFAULT NULL,
  `ended_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_calls_callee_status` (`callee_id`,`status`),
  KEY idx_calls_caller_status (caller_id,status),
  KEY idx_calls_group (group_id),
  CONSTRAINT `fk_calls_caller` FOREIGN KEY (`caller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_calls_callee` FOREIGN KEY (`callee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `voice_call_signals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `call_id` INT UNSIGNED NOT NULL,
  `sender_id` INT UNSIGNED NOT NULL,
  `signal_type` ENUM('ice','offer','answer','hangup') NOT NULL,
  `payload` MEDIUMTEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_signals_call` (`call_id`,`id`),
  CONSTRAINT `fk_signals_call` FOREIGN KEY (`call_id`) REFERENCES `voice_call_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_signals_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` VARCHAR(500) NULL DEFAULT NULL,
  `link` VARCHAR(255) NULL DEFAULT NULL,
  `related_id` INT UNSIGNED NULL DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user_read` (`user_id`,`is_read`,`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `forums` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(140) NOT NULL,
  `description` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_forums_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `forum_posts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `forum_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `is_hidden` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_posts_forum` (`forum_id`,`created_at`),
  KEY `idx_posts_user` (`user_id`),
  CONSTRAINT `fk_posts_forum` FOREIGN KEY (`forum_id`) REFERENCES `forums` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_posts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `post_comments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `content` TEXT NOT NULL,
  `is_hidden` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comments_post` (`post_id`,`created_at`),
  CONSTRAINT `fk_comments_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `post_likes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_post_like` (`post_id`,`user_id`),
  CONSTRAINT `fk_likes_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_likes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `post_shares` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_shares_post` (`post_id`),
  CONSTRAINT `fk_shares_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shares_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reports` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reporter_id` INT UNSIGNED NOT NULL,
  `target_type` ENUM('user','private_message','group_message','forum_post') NOT NULL,
  `target_id` BIGINT UNSIGNED NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `status` ENUM('open','reviewed','resolved') NOT NULL DEFAULT 'open',
  `admin_notes` TEXT NULL,
  `reviewed_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_status` (`status`,`created_at`),
  KEY `idx_reports_reporter` (`reporter_id`),
  CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_admin` FOREIGN KEY (`reviewed_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `rate_limits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rate_key` VARCHAR(191) NOT NULL,
  `hits` INT UNSIGNED NOT NULL DEFAULT 1,
  `window_start` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rate_key` (`rate_key`),
  KEY `idx_rate_window` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- DEMO admin: username=admin  password=admin123
-- Hash generated with password_hash('admin123', PASSWORD_DEFAULT)
INSERT INTO `admins` (`username`, `email`, `password_hash`, `must_change_password`) VALUES
('admin', 'admin@webconnect.local', '$2y$10$3NrlkptKGdoXmlK.XUwwY.WBZjhMSU1ovVnt7M7LoLEcdBiyF8DLq', 0);

-- Seed app user (Leong): username=Lwh_0326  email=leongwenghong5@gmail.com  password=Hong0326
-- Hash generated with password_hash('Hong0326', PASSWORD_DEFAULT)
INSERT INTO `users` (`username`, `email`, `password_hash`, `status_message`, `presence`) VALUES
('Lwh_0326', 'leongwenghong5@gmail.com', '$2y$10$iafF/5RISRN3pqS4XBuz9ueybGzfAj5mORrzH8KAyAxaGbh06QNLO', 'Let''s be friend!!!', 'offline');

INSERT INTO `forums` (`name`, `slug`, `description`, `sort_order`) VALUES
('General Discussion', 'general-discussion', 'Talk about anything related to the community.', 1),
('Technology', 'technology', 'Share tech tips, tools, and ideas.', 2),
('Student Discussion', 'student-discussion', 'A space for students to collaborate.', 3),
('Announcements', 'announcements', 'Official platform announcements.', 4);

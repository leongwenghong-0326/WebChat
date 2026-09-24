-- Fix demo user password on cPanel (run in phpMyAdmin SQL tab)
UPDATE `users`
SET
  `password_hash` = '$2y$10$iafF/5RISRN3pqS4XBuz9ueybGzfAj5mORrzH8KAyAxaGbh06QNLO',
  `is_disabled` = 0,
  `username` = 'Lwh_0326',
  `email` = 'leongwenghong5@gmail.com'
WHERE `username` = 'Lwh_0326'
   OR `email` = 'leongwenghong5@gmail.com';

-- If no rows updated, create the user:
INSERT INTO `users` (`username`, `email`, `password_hash`, `status_message`, `presence`, `is_disabled`)
SELECT 'Lwh_0326', 'leongwenghong5@gmail.com', '$2y$10$iafF/5RISRN3pqS4XBuz9ueybGzfAj5mORrzH8KAyAxaGbh06QNLO', 'Let''s be friend!!!', 'offline', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `username` = 'Lwh_0326' OR `email` = 'leongwenghong5@gmail.com');

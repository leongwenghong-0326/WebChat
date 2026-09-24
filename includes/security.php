<?php
declare(strict_types=1);

/**
 * Secure file upload helpers
 */

function store_upload(array $file, string $category): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Upload failed. Please try again.');
    }

    $tmp = $file['tmp_name'] ?? '';
    $origName = (string) ($file['name'] ?? 'file');
    $size = (int) ($file['size'] ?? 0);

    if (!is_uploaded_file($tmp)) {
        throw new InvalidArgumentException('Invalid upload.');
    }

    $ext = extension_of($origName);
    $mime = detect_mime($tmp);

    [$allowedExt, $allowedMime, $maxSize, $subdir] = match ($category) {
        'avatar' => [ALLOWED_IMAGE_EXT, ALLOWED_IMAGE_MIME, UPLOAD_MAX_AVATAR, 'avatars'],
        'image' => [ALLOWED_IMAGE_EXT, ALLOWED_IMAGE_MIME, UPLOAD_MAX_IMAGE, 'images'],
        'file' => [ALLOWED_FILE_EXT, ALLOWED_FILE_MIME, UPLOAD_MAX_FILE, 'files'],
        'voice' => [ALLOWED_VOICE_EXT, ALLOWED_VOICE_MIME, UPLOAD_MAX_VOICE, 'voices'],
        'group' => [ALLOWED_IMAGE_EXT, ALLOWED_IMAGE_MIME, UPLOAD_MAX_AVATAR, 'groups'],
        default => throw new InvalidArgumentException('Unknown upload category.'),
    };

    if ($size <= 0 || $size > $maxSize) {
        throw new InvalidArgumentException('File size is not allowed.');
    }
    if (!in_array($ext, $allowedExt, true)) {
        throw new InvalidArgumentException('File extension is not allowed.');
    }
    if (!in_array($mime, $allowedMime, true)) {
        // Some environments report zip/text differently
        if (!($category === 'file' && in_array($ext, ['txt', 'zip'], true))) {
            throw new InvalidArgumentException('File type is not allowed.');
        }
    }

    $destDir = APP_PATH . '/uploads/' . $subdir;
    if (!is_dir($destDir) && !mkdir($destDir, 0755, true) && !is_dir($destDir)) {
        throw new RuntimeException('Upload directory is not writable.');
    }

    $stored = random_filename($ext);
    $dest = $destDir . '/' . $stored;
    if (!move_uploaded_file($tmp, $dest)) {
        throw new RuntimeException('Unable to save uploaded file.');
    }

    return [
        'stored_name' => $stored,
        'original_name' => basename($origName),
        'mime_type' => $mime,
        'file_size' => $size,
        'relative_path' => $subdir . '/' . $stored,
        'category' => $category,
    ];
}

function resolve_upload_path(string $type, string $filename): ?string
{
    $filename = basename($filename);
    if ($filename === '' || $filename === '.' || $filename === '..') {
        return null;
    }
    if (preg_match('/[^a-zA-Z0-9._-]/', $filename)) {
        return null;
    }

    $map = [
        'avatar' => 'avatars',
        'image' => 'images',
        'file' => 'files',
        'voice' => 'voices',
        'group' => 'groups',
    ];
    if (!isset($map[$type])) {
        return null;
    }

    $full = APP_PATH . '/uploads/' . $map[$type] . '/' . $filename;
    $realBase = realpath(APP_PATH . '/uploads/' . $map[$type]);
    $realFile = realpath($full);
    if (!$realBase || !$realFile || !str_starts_with($realFile, $realBase)) {
        return null;
    }
    return $realFile;
}

<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

require_login();
require_csrf();

$category = str_input('category');
if (!in_array($category, ['image', 'file', 'voice'], true)) {
    json_error('Invalid upload category.');
}

if (empty($_FILES['file'])) {
    json_error('No file uploaded.');
}

try {
    $meta = store_upload($_FILES['file'], $category);
} catch (InvalidArgumentException $e) {
    json_error($e->getMessage());
} catch (Throwable $e) {
    app_log('Upload error: ' . $e->getMessage());
    json_error('Upload failed.', 500);
}

$mediaType = $category;
json_success('Uploaded.', [
    'stored_name' => $meta['stored_name'],
    'original_name' => $meta['original_name'],
    'mime_type' => $meta['mime_type'],
    'file_size' => $meta['file_size'],
    'category' => $meta['category'],
    'url' => media_url($mediaType, $meta['stored_name']),
]);

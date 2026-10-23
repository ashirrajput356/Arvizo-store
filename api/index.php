<?php
declare(strict_types=1);

session_name('arvizo_owner');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']), 'samesite' => 'Strict', 'path' => '/']);
session_start();
date_default_timezone_set('Asia/Karachi');
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (PHP_SAPI === 'cli-server' && preg_match('#^/uploads/[a-f0-9]{32}\.(jpg|png|webp)$#', (string)$requestPath) && is_file(__DIR__ . $requestPath)) return false;

function config(string $key, string $default = ''): string {
    static $env = null;
    if ($env === null) {
        $env = [];
        $file = __DIR__ . '/.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
                [$name, $value] = explode('=', $line, 2);
                $env[trim($name)] = trim($value, " \t\n\r\0\x0B\"'");
            }
        }
    }
    return $env[$key] ?? getenv($key) ?: $default;
}

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw ?: '{}', true);
    if (!is_array($json)) respond(['error' => 'Invalid JSON request.'], 400);
    return $json;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $driver = config('DB_DRIVER', 'sqlite');
    if ($driver === 'mysql') {
        $dsn = 'mysql:host=' . config('DB_HOST', '127.0.0.1') . ';port=' . config('DB_PORT', '3306') . ';dbname=' . config('DB_NAME', 'arvizo') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, config('DB_USER'), config('DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    } else {
        $path = config('DB_PATH', __DIR__ . '/data/arvizo.sqlite');
        if (!str_starts_with($path, DIRECTORY_SEPARATOR) && !preg_match('/^[A-Za-z]:/', $path)) $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . $path;
        if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0770, true) && !is_dir(dirname($path))) throw new RuntimeException('Unable to create SQLite data directory.');
        $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA foreign_keys = ON');
    }
    initialize($pdo, $driver);
    return $pdo;
}

function initialize(PDO $pdo, string $driver): void {
    static $done = false;
    if ($done) return;
    $id = $driver === 'mysql' ? 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $text = 'TEXT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS categories (id $id, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE, image $text NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS products (id $id, name VARCHAR(180) NOT NULL, slug VARCHAR(200) NOT NULL UNIQUE, description $text NOT NULL, price DECIMAL(12,2) NOT NULL, sale_price DECIMAL(12,2) NULL, stock INT NOT NULL DEFAULT 0, category_id " . ($driver === 'mysql' ? 'INT UNSIGNED' : 'INT') . " NULL, image $text NOT NULL, rating DECIMAL(3,2) NOT NULL DEFAULT 4.8, review_count INT NOT NULL DEFAULT 0, status VARCHAR(24) NOT NULL DEFAULT 'active', created_at VARCHAR(32) NOT NULL, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL)");
    $fkId = $driver === 'mysql' ? 'INT UNSIGNED' : 'INT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS customers (id $id, name VARCHAR(160) NOT NULL, phone VARCHAR(24) NOT NULL, email VARCHAR(190) NULL, address $text NOT NULL, city VARCHAR(100) NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (id $id, order_number VARCHAR(32) NOT NULL UNIQUE, customer_id $fkId NOT NULL, notes $text NOT NULL, payment_method VARCHAR(40) NOT NULL, delivery_fee DECIMAL(12,2) NOT NULL, subtotal DECIMAL(12,2) NOT NULL, total DECIMAL(12,2) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'Pending', created_at VARCHAR(32) NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS order_items (id $id, order_id $fkId NOT NULL, product_id $fkId NULL, product_name VARCHAR(180) NOT NULL, image $text NOT NULL, unit_price DECIMAL(12,2) NOT NULL, quantity INT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_users (id $id, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at VARCHAR(32) NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS store_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value $text NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS newsletter_subscribers (id $id, email VARCHAR(190) NOT NULL UNIQUE, created_at VARCHAR(32) NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_login_limits (id $id, ip VARCHAR(64) NOT NULL, attempted_at VARCHAR(32) NOT NULL, succeeded INT NOT NULL DEFAULT 0)");
    $pdo->exec("UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM categories)");
    try {
        $pdo->exec($driver === 'mysql' ? 'CREATE INDEX login_ip_date ON admin_login_limits(ip, attempted_at)' : 'CREATE INDEX IF NOT EXISTS login_ip_date ON admin_login_limits(ip, attempted_at)');
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate key name') && !str_contains($e->getMessage(), 'already exists')) throw $e;
    }
    $seedCheck = $pdo->prepare('SELECT setting_value FROM store_settings WHERE setting_key=?');
    $seedCheck->execute(['demo_catalog_seeded']);
    if (!$seedCheck->fetchColumn()) {
        $count = (int)$pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn();
        if ($count === 0) {
        $items = [
            ['Watches','watches','https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85'],
            ['Earbuds','earbuds','https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=700&q=85'],
            ['Smart Watches','smart-watches','https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=700&q=85'],
            ['Audio Accessories','audio-accessories','https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=700&q=85'],
        ];
        $stmt = $pdo->prepare('INSERT INTO categories(name,slug,image) VALUES(?,?,?)');
        foreach ($items as $item) $stmt->execute($item);
        $samples = [
            ['Arvizo Classic Steel Watch','arvizo-classic-steel-watch','A polished everyday watch with a clean dial, stainless-steel finish, and a versatile look that works from weekdays to weekends.',6490,5490,24,1,'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=85',4.9,38],
            ['Midnight Chronograph Watch','midnight-chronograph-watch','A bold dark-dial chronograph-inspired style with refined markers and a comfortable everyday strap.',7990,6990,18,1,'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=85',4.8,27],
            ['Rose Gold Minimal Watch','rose-gold-minimal-watch','A slim minimalist watch with a warm rose-gold finish, designed to bring a subtle statement to your daily look.',5890,null,20,1,'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=800&q=85',4.8,19],
            ['Arvizo Active Smartwatch','arvizo-active-smartwatch','A versatile smartwatch look for busy days, workouts, and staying connected while you are on the move.',8990,7490,16,3,'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=85',4.7,22],
            ['True Wireless Earbuds','true-wireless-earbuds','Compact wireless earbuds with a pocket-size charging case for music, calls, and commutes throughout your day.',4990,3990,30,2,'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=85',4.8,41],
            ['Everyday Bluetooth Earbuds','everyday-bluetooth-earbuds','Lightweight in-ear comfort and easy wireless listening for podcasts, playlists, and hands-free calls.',3490,null,26,2,'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=85',4.7,24],
            ['Premium Over-Ear Headphones','premium-over-ear-headphones','Cushioned over-ear headphones with a sleek profile for focused listening at home or on the go.',9990,8490,12,4,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=85',4.9,32],
            ['Wireless Earbuds Pro','wireless-earbuds-pro','A premium everyday audio set with a compact charging case and a comfortable, secure fit.',6990,5990,15,2,'https://images.unsplash.com/photo-1598331668826-20cecc596b86?auto=format&fit=crop&w=800&q=85',4.8,18],
        ];
        $stmt = $pdo->prepare('INSERT INTO products(name,slug,description,price,sale_price,stock,category_id,image,rating,review_count,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($samples as $p) $stmt->execute([...$p, $p[5] > 0 ? 'active' : 'out-of-stock', date('c')]);
        }
        $seedMark = $pdo->prepare('INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?)');
        $seedMark->execute(['demo_catalog_seeded', date('c')]);
    }
    $watchSeed = $pdo->prepare('SELECT setting_value FROM store_settings WHERE setting_key=?');
    $watchSeed->execute(['watch_audio_catalog_seeded']);
    if (!$watchSeed->fetchColumn()) {
        $categoryImages = [
            'watches' => 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85',
            'earbuds' => 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=700&q=85',
            'smart-watches' => 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=700&q=85',
            'audio-accessories' => 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=700&q=85',
        ];
        $addCategory = $pdo->prepare('INSERT INTO categories(name,slug,image) VALUES(?,?,?)');
        foreach ($categoryImages as $slug => $image) {
            $exists = $pdo->prepare('SELECT id FROM categories WHERE slug=?');
            $exists->execute([$slug]);
            if (!$exists->fetchColumn()) $addCategory->execute([ucwords(str_replace('-', ' ', $slug)), $slug, $image]);
        }
        $categoryIds = [];
        foreach (array_keys($categoryImages) as $slug) {
            $lookup = $pdo->prepare('SELECT id FROM categories WHERE slug=?');
            $lookup->execute([$slug]);
            $categoryIds[$slug] = (int)$lookup->fetchColumn();
        }
        $watchProducts = [
            ['Arvizo Classic Steel Watch','arvizo-classic-steel-watch','A polished everyday watch with a clean dial, stainless-steel finish, and a versatile look that works from weekdays to weekends.',6490,5490,24,'watches','https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=85',4.9,38],
            ['Midnight Chronograph Watch','midnight-chronograph-watch','A bold dark-dial chronograph-inspired style with refined markers and a comfortable everyday strap.',7990,6990,18,'watches','https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=85',4.8,27],
            ['Rose Gold Minimal Watch','rose-gold-minimal-watch','A slim minimalist watch with a warm rose-gold finish, designed to bring a subtle statement to your daily look.',5890,null,20,'watches','https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=800&q=85',4.8,19],
            ['Arvizo Active Smartwatch','arvizo-active-smartwatch','A versatile smartwatch look for busy days, workouts, and staying connected while you are on the move.',8990,7490,16,'smart-watches','https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=85',4.7,22],
            ['True Wireless Earbuds','true-wireless-earbuds','Compact wireless earbuds with a pocket-size charging case for music, calls, and commutes throughout your day.',4990,3990,30,'earbuds','https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=85',4.8,41],
            ['Everyday Bluetooth Earbuds','everyday-bluetooth-earbuds','Lightweight in-ear comfort and easy wireless listening for podcasts, playlists, and hands-free calls.',3490,null,26,'earbuds','https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=85',4.7,24],
            ['Premium Over-Ear Headphones','premium-over-ear-headphones','Cushioned over-ear headphones with a sleek profile for focused listening at home or on the go.',9990,8490,12,'audio-accessories','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=85',4.9,32],
            ['Wireless Earbuds Pro','wireless-earbuds-pro','A premium everyday audio set with a compact charging case and a comfortable, secure fit.',6990,5990,15,'earbuds','https://images.unsplash.com/photo-1598331668826-20cecc596b86?auto=format&fit=crop&w=800&q=85',4.8,18],
        ];
        $exists = $pdo->prepare('SELECT id FROM products WHERE slug=?');
        $addProduct = $pdo->prepare('INSERT INTO products(name,slug,description,price,sale_price,stock,category_id,image,rating,review_count,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($watchProducts as [$name, $slug, $description, $price, $sale, $stock, $category, $image, $rating, $reviews]) {
            $exists->execute([$slug]);
            if (!$exists->fetchColumn()) $addProduct->execute([$name, $slug, $description, $price, $sale, $stock, $categoryIds[$category], $image, $rating, $reviews, 'active', date('c')]);
        }
        $mark = $pdo->prepare('INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?)');
        $mark->execute(['watch_audio_catalog_seeded', date('c')]);
    }
    $email = strtolower(trim(config('ADMIN_EMAIL')));
    $password = config('ADMIN_PASSWORD');
    if ($email !== '' && strlen($password) >= 12) {
        $users = $pdo->query('SELECT id,email,password_hash FROM admin_users ORDER BY id')->fetchAll();
        if (!$users) {
            $stmt = $pdo->prepare('INSERT INTO admin_users(email,password_hash,created_at) VALUES(?,?,?)');
            $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), date('c')]);
        } else {
            $owner = null;
            foreach ($users as $user) if ($user['email'] === $email) $owner = $user;
            $owner ??= $users[0];
            if ($owner['email'] !== $email || !password_verify($password, $owner['password_hash'])) {
                $stmt = $pdo->prepare('UPDATE admin_users SET email=?,password_hash=? WHERE id=?');
                $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), $owner['id']]);
            }
            $stmt = $pdo->prepare('DELETE FROM admin_users WHERE id != ?');
            $stmt->execute([$owner['id']]);
        }
    } else {
        $pdo->exec('DELETE FROM admin_users');
    }
    $done = true;
}

function admin(PDO $pdo): void {
    if (empty($_SESSION['admin_id'])) respond(['error' => 'Please sign in to continue.'], 401);
    $stmt = $pdo->prepare('SELECT id FROM admin_users WHERE id=?');
    $stmt->execute([(int)$_SESSION['admin_id']]);
    if (!$stmt->fetch()) {
        $_SESSION = [];
        session_destroy();
        respond(['error' => 'Your owner account is no longer configured.'], 401);
    }
}

function strvalRequired(array $data, string $key, int $max, bool $optional = false): string {
    $value = trim((string)($data[$key] ?? ''));
    if (!$optional && $value === '') respond(['error' => ucfirst(str_replace('_', ' ', $key)) . ' is required.'], 422);
    $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($length > $max) respond(['error' => ucfirst(str_replace('_', ' ', $key)) . ' is too long.'], 422);
    return $value;
}

function dateKarachi(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('Y-m-d H:i:s');
}

function canonicalPakistaniPhone(string $phone): string {
    $phone = preg_replace('/[\s()-]/', '', $phone);
    if (str_starts_with($phone, '+92')) $phone = substr($phone, 3);
    elseif (str_starts_with($phone, '92') && strlen($phone) === 12) $phone = substr($phone, 2);
    if (str_starts_with($phone, '0')) $phone = substr($phone, 1);
    return $phone;
}

function sendOrderEmail(string $number, string $name, string $phone, string $address, string $city, string $notes, array $items, float $subtotal, float $deliveryFee, float $total): bool {
    $recipient = filter_var(config('STORE_ORDER_EMAIL', 'arvizostore@gmail.com'), FILTER_VALIDATE_EMAIL);
    $sender = config('STORE_EMAIL_FROM');
    if (!$recipient || ($sender !== '' && !filter_var($sender, FILTER_VALIDATE_EMAIL))) {
        error_log('Arvizo order email skipped: configure a valid STORE_ORDER_EMAIL and STORE_EMAIL_FROM.');
        return false;
    }
    if (!function_exists('mail')) {
        error_log('Arvizo order email failed: PHP mail() is unavailable.');
        return false;
    }

    $lines = [
        "New Arvizo order: $number",
        '',
        "Customer: $name",
        "Phone: $phone",
        "Address: $address, $city",
        "Payment: Cash on Delivery",
        '',
        'Items:',
    ];
    foreach ($items as [$product, $quantity, $unitPrice]) {
        $lines[] = '- ' . $product['name'] . ' x ' . $quantity . ' — Rs. ' . number_format($unitPrice * $quantity, 0);
    }
    $lines[] = '';
    $lines[] = 'Subtotal: Rs. ' . number_format($subtotal, 0);
    $lines[] = 'Delivery: Rs. ' . number_format($deliveryFee, 0);
    $lines[] = 'Total: Rs. ' . number_format($total, 0);
    if ($notes !== '') $lines[] = "Customer note: $notes";

    $headers = ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8'];
    if ($sender !== '') $headers[] = 'From: Arvizo Store <' . $sender . '>';
    $sent = mail($recipient, 'New Arvizo order ' . $number, implode("\r\n", $lines), implode("\r\n", $headers));
    if (!$sent) error_log('Arvizo order email could not be handed to the configured mail server for order ' . $number . '.');
    return $sent;
}

try {
    $pdo = db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $path = preg_replace('#^/api/?#', '', (string)$uri);

    if ($method === 'GET' && $path === 'products') {
        $products = $pdo->query('SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status = "active" AND p.stock > 0 ORDER BY p.id DESC')->fetchAll();
        respond(['products' => $products]);
    }
    if ($method === 'GET' && $path === 'categories') respond(['categories' => $pdo->query('SELECT * FROM categories ORDER BY name')->fetchAll()]);
    if ($method === 'POST' && $path === 'newsletter') {
        $data = body();
        $email = filter_var(trim((string)($data['email'] ?? '')), FILTER_VALIDATE_EMAIL);
        if (!$email || strlen($email) > 190) respond(['error' => 'Enter a valid email address.'], 422);
        $stmt = $pdo->prepare('INSERT OR IGNORE INTO newsletter_subscribers(email,created_at) VALUES(?,?)');
        if (config('DB_DRIVER', 'sqlite') === 'mysql') $stmt = $pdo->prepare('INSERT IGNORE INTO newsletter_subscribers(email,created_at) VALUES(?,?)');
        $stmt->execute([$email, dateKarachi()]);
        respond(['message' => 'You’re on the list. Welcome to Arvizo!']);
    }
    if ($method === 'POST' && $path === 'orders') {
        $data = body();
        $name = strvalRequired($data, 'name', 160);
        $phone = preg_replace('/[\s()-]/', '', (string)($data['phone'] ?? ''));
        if (!preg_match('/^(?:\+?92|0)?3\d{9}$/', $phone)) respond(['error' => 'Enter a valid Pakistani mobile number.'], 422);
        $email = trim((string)($data['email'] ?? ''));
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190)) respond(['error' => 'Enter a valid email address.'], 422);
        $address = strvalRequired($data, 'address', 600);
        $city = strvalRequired($data, 'city', 100);
        $notes = strvalRequired($data, 'notes', 1000, true);
        $items = $data['items'] ?? [];
        if (!is_array($items) || count($items) < 1 || count($items) > 50) respond(['error' => 'Your bag must contain between 1 and 50 items.'], 422);
        $pdo->beginTransaction();
        $validated = [];
        $subtotal = 0.0;
        foreach ($items as $item) {
            if (!is_array($item)) throw new DomainException('One of the bag items is invalid.');
            $id = filter_var($item['product_id'] ?? null, FILTER_VALIDATE_INT);
            $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
            if (!$id || !$quantity || $quantity < 1 || $quantity > 99) throw new DomainException('One of the item quantities is invalid.');
            $stmt = $pdo->prepare('SELECT id,name,image,price,sale_price,stock,status FROM products WHERE id=?');
            $stmt->execute([$id]);
            $product = $stmt->fetch();
            if (!$product || $product['status'] !== 'active' || (int)$product['stock'] < $quantity) throw new DomainException('A product is no longer available in the requested quantity. Please update your bag.');
            $unit = $product['sale_price'] !== null ? (float)$product['sale_price'] : (float)$product['price'];
            $subtotal += $unit * $quantity;
            $validated[] = [$product, $quantity, $unit];
        }
        $customer = $pdo->prepare('INSERT INTO customers(name,phone,email,address,city) VALUES(?,?,?,?,?)');
        $customer->execute([$name, $phone, $email ?: null, $address, $city]);
        $customerId = (int)$pdo->lastInsertId();
        $number = 'ARV-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(6)));
        $fee = 300.0;
        $order = $pdo->prepare('INSERT INTO orders(order_number,customer_id,notes,payment_method,delivery_fee,subtotal,total,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
        $order->execute([$number, $customerId, $notes, 'Cash on Delivery', $fee, $subtotal, $subtotal + $fee, 'Pending', dateKarachi()]);
        $orderId = (int)$pdo->lastInsertId();
        $add = $pdo->prepare('INSERT INTO order_items(order_id,product_id,product_name,image,unit_price,quantity) VALUES(?,?,?,?,?,?)');
        $stock = $pdo->prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?');
        foreach ($validated as [$product, $quantity, $unit]) {
            $add->execute([$orderId, $product['id'], $product['name'], $product['image'], $unit, $quantity]);
            $stock->execute([$quantity, $product['id'], $quantity]);
            if ($stock->rowCount() !== 1) throw new DomainException('Stock changed while placing your order. Please try again.');
        }
        $pdo->commit();
        $total = round($subtotal + $fee, 2);
        $emailNotified = sendOrderEmail($number, $name, $phone, $address, $city, $notes, $validated, $subtotal, $fee, $total);
        respond(['message' => 'Your order is confirmed.', 'order' => ['id' => $orderId, 'order_number' => $number, 'name' => $name, 'phone' => $phone, 'address' => $address, 'city' => $city, 'items' => array_map(fn($x) => ['name' => $x[0]['name'], 'image' => $x[0]['image'], 'quantity' => $x[1], 'unit_price' => $x[2]], $validated), 'subtotal' => round($subtotal, 2), 'delivery_fee' => $fee, 'total' => $total, 'payment_method' => 'Cash on Delivery', 'email_notified' => $emailNotified, 'created_at' => dateKarachi()] ], 201);
    }
    if ($method === 'GET' && $path === 'orders/public') {
        $stmt = $pdo->query('SELECT id,status,created_at,delivery_fee,total FROM orders ORDER BY id DESC');
        $orders = $stmt->fetchAll();
        $items = $pdo->prepare('SELECT product_name AS name,image,unit_price,quantity FROM order_items WHERE order_id=?');
        foreach ($orders as &$order) {
            $items->execute([(int)$order['id']]);
            $order['items'] = $items->fetchAll();
        }
        unset($order);
        respond(['orders' => $orders]);
    }
    if ($method === 'POST' && $path === 'admin/login') {
        $data = body();
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $ip = substr($_SERVER['REMOTE_ADDR'] ?? 'unknown', 0, 64);
        $since = date('c', time() - 900);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM admin_login_limits WHERE ip=? AND succeeded=0 AND attempted_at>=?');
        $stmt->execute([$ip, $since]);
        if ((int)$stmt->fetchColumn() >= 8) respond(['error' => 'Too many sign-in attempts. Please try again in 15 minutes.'], 429);
        $stmt = $pdo->prepare('SELECT id,password_hash FROM admin_users WHERE email=?');
        $stmt->execute([$email]);
        $owner = $stmt->fetch();
        $valid = $owner && password_verify((string)($data['password'] ?? ''), $owner['password_hash']);
        $stmt = $pdo->prepare('INSERT INTO admin_login_limits(ip,attempted_at,succeeded) VALUES(?,?,?)');
        $stmt->execute([$ip, date('c'), $valid ? 1 : 0]);
        if (!$valid) respond(['error' => 'Email or password is incorrect.'], 401);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$owner['id'];
        $_SESSION['last_activity'] = time();
        respond(['message' => 'Signed in.']);
    }
    if ($method === 'POST' && $path === 'admin/logout') {
        $_SESSION = [];
        session_destroy();
        respond(['message' => 'Signed out.']);
    }
    if (str_starts_with($path, 'admin/')) {
        admin($pdo);
        if (isset($_SESSION['last_activity']) && time() - (int)$_SESSION['last_activity'] > 3600) {
            $_SESSION = [];
            session_destroy();
            respond(['error' => 'Your session expired. Please sign in again.'], 401);
        }
        $_SESSION['last_activity'] = time();
    }
    if ($method === 'GET' && $path === 'admin/me') respond(['email' => $pdo->query('SELECT email FROM admin_users WHERE id=' . (int)$_SESSION['admin_id'])->fetchColumn()]);
    if ($method === 'GET' && $path === 'admin/dashboard') {
        $month = (new DateTimeImmutable('now', new DateTimeZone('Asia/Karachi')))->format('Y-m');
        $stmt = $pdo->prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total ELSE 0 END),0) sales, COALESCE(SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END),0) pending, COALESCE(SUM(CASE WHEN status='Delivered' THEN 1 ELSE 0 END),0) delivered, COALESCE(SUM(CASE WHEN status='Cancelled' THEN 1 ELSE 0 END),0) cancelled FROM orders WHERE substr(created_at,1,7)=?");
        $stmt->execute([$month]);
        respond(['stats' => $stmt->fetch()]);
    }
    if ($method === 'GET' && $path === 'admin/orders') {
        $search = trim((string)($_GET['q'] ?? ''));
        $stmt = $pdo->prepare('SELECT o.*, c.name customer_name,c.phone,c.email,c.address,c.city FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.order_number LIKE ? OR c.phone LIKE ? ORDER BY o.id DESC');
        $like = '%' . $search . '%';
        $stmt->execute([$like, $like]);
        $orders = $stmt->fetchAll();
        $items = $pdo->prepare('SELECT product_name,image,unit_price,quantity FROM order_items WHERE order_id=?');
        foreach ($orders as &$row) { $items->execute([$row['id']]); $row['items'] = $items->fetchAll(); }
        respond(['orders' => $orders]);
    }
    if (preg_match('#^admin/orders/(\d+)$#', $path, $match)) {
        $id = (int)$match[1];
        if ($method === 'PATCH') {
            $status = (string)(body()['status'] ?? '');
            if (!in_array($status, ['Pending','Confirmed','Processing','Shipped','Out for Delivery','Delivered','Cancelled'], true)) respond(['error' => 'Invalid order status.'], 422);
            $stmt = $pdo->prepare('UPDATE orders SET status=? WHERE id=?');
            $stmt->execute([$status, $id]);
            if (!$stmt->rowCount()) {
                $exists = $pdo->prepare('SELECT id FROM orders WHERE id=?');
                $exists->execute([$id]);
                if (!$exists->fetch()) respond(['error' => 'Order not found.'], 404);
            }
            respond(['message' => 'Order status updated.']);
        }
        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM orders WHERE id=?');
            $stmt->execute([$id]);
            if (!$stmt->rowCount()) respond(['error' => 'Order not found.'], 404);
            respond(['message' => 'Order deleted.']);
        }
    }
    if ($method === 'GET' && $path === 'admin/reports') {
        $month = (string)($_GET['month'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) respond(['error' => 'Choose a valid report month.'], 422);
        $stmt = $pdo->prepare('SELECT o.*,c.name customer_name,c.phone,c.city FROM orders o JOIN customers c ON c.id=o.customer_id WHERE substr(o.created_at,1,7)=? ORDER BY o.id DESC');
        $stmt->execute([$month]);
        $orders = $stmt->fetchAll();
        $items = $pdo->prepare('SELECT product_name,quantity,unit_price FROM order_items WHERE order_id=?');
        foreach ($orders as &$row) { $items->execute([$row['id']]); $row['items'] = $items->fetchAll(); }
        $sales = array_sum(array_map(fn($o) => $o['status'] === 'Cancelled' ? 0 : (float)$o['total'], $orders));
        respond(['orders' => $orders, 'summary' => ['count' => count($orders), 'sales' => $sales, 'cancelled' => count(array_filter($orders, fn($o) => $o['status'] === 'Cancelled'))]]);
    }
    if ($method === 'GET' && $path === 'admin/products') respond(['products' => $pdo->query('SELECT p.*, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC')->fetchAll()]);
    if ($method === 'GET' && $path === 'admin/images') {
        $images = [];
        foreach (glob(__DIR__ . '/uploads/*') ?: [] as $file) {
            if (is_file($file) && preg_match('/^[a-f0-9]{32}\.(jpg|png|webp)$/', basename($file))) $images[] = '/uploads/' . basename($file);
        }
        respond(['images' => $images]);
    }
    if (($method === 'POST' && $path === 'admin/products') || (preg_match('#^admin/products/(\d+)$#', $path, $match) && in_array($method, ['PATCH','DELETE'], true))) {
        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM products WHERE id=?'); $stmt->execute([(int)$match[1]]);
            if (!$stmt->rowCount()) respond(['error' => 'Product not found.'], 404);
            respond(['message' => 'Product deleted.']);
        }
        $data = body();
        $name = strvalRequired($data, 'name', 180);
        $slug = strtolower(trim((string)($data['slug'] ?? '')));
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) respond(['error' => 'Use a valid lowercase product slug.'], 422);
        $description = strvalRequired($data, 'description', 5000, true);
        $price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
        $sale = ($data['sale_price'] ?? '') === '' || ($data['sale_price'] ?? null) === null ? null : filter_var($data['sale_price'], FILTER_VALIDATE_FLOAT);
        $stock = filter_var($data['stock'] ?? null, FILTER_VALIDATE_INT);
        $category = ($data['category_id'] ?? '') === '' || !isset($data['category_id']) ? null : filter_var($data['category_id'], FILTER_VALIDATE_INT);
        $status = (string)($data['status'] ?? 'active');
        $image = strvalRequired($data, 'image', 500, true);
        if ($price === false || $price <= 0 || $price > 10000000 || ($sale !== null && ($sale === false || $sale <= 0 || $sale >= $price)) || $stock === false || $stock < 0 || $stock > 1000000 || !in_array($status, ['active','draft','out-of-stock'], true)) respond(['error' => 'Check the product price, sale price, stock, and status.'], 422);
        if ($category !== null && $category === false) respond(['error' => 'Invalid category.'], 422);
        if ($category !== null) {
            $categoryCheck = $pdo->prepare('SELECT id FROM categories WHERE id=?');
            $categoryCheck->execute([$category]);
            if (!$categoryCheck->fetch()) respond(['error' => 'Choose an existing product category.'], 422);
        }
        if ($image !== '' && !preg_match('#^(https://|/uploads/)[A-Za-z0-9._/?=&%-]+$#', $image)) respond(['error' => 'Use a secure image URL or an uploaded image.'], 422);
        if ($method === 'PATCH') {
            $stmt = $pdo->prepare('UPDATE products SET name=?,slug=?,description=?,price=?,sale_price=?,stock=?,category_id=?,image=?,status=? WHERE id=?');
            $stmt->execute([$name,$slug,$description,$price,$sale,$stock,$category,$image,$status,(int)$match[1]]);
            $exists = $pdo->prepare('SELECT id FROM products WHERE id=?');
            $exists->execute([(int)$match[1]]);
            if (!$exists->fetch()) respond(['error' => 'Product not found.'], 404);
            respond(['message' => 'Product updated.']);
        }
        $stmt = $pdo->prepare('INSERT INTO products(name,slug,description,price,sale_price,stock,category_id,image,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$name,$slug,$description,$price,$sale,$stock,$category,$image,$status,dateKarachi()]);
        respond(['message' => 'Product added.'], 201);
    }
    if ($method === 'GET' && $path === 'admin/categories') {
        respond(['categories' => $pdo->query('SELECT c.*,COUNT(p.id) product_count FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY c.name')->fetchAll()]);
    }
    if (($method === 'POST' && $path === 'admin/categories') || (preg_match('#^admin/categories/(\d+)$#', $path, $match) && in_array($method, ['PATCH','DELETE'], true))) {
        if ($method === 'DELETE') {
            $exists = $pdo->prepare('SELECT id FROM categories WHERE id=?');
            $exists->execute([(int)$match[1]]);
            if (!$exists->fetch()) respond(['error' => 'Category not found.'], 404);
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE products SET category_id=NULL WHERE category_id=?'); $stmt->execute([(int)$match[1]]);
            $stmt = $pdo->prepare('DELETE FROM categories WHERE id=?'); $stmt->execute([(int)$match[1]]);
            $pdo->commit();
            respond(['message' => 'Category deleted; its products are now uncategorized.']);
        }
        $data = body();
        $name = strvalRequired($data, 'name', 120);
        $slug = strtolower(trim((string)($data['slug'] ?? '')));
        $image = strvalRequired($data, 'image', 500, true);
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) || ($image !== '' && !preg_match('#^(https://|/uploads/)[A-Za-z0-9._/?=&%-]+$#', $image))) respond(['error' => 'Check the category slug and image.'], 422);
        if ($method === 'PATCH') {
            $stmt = $pdo->prepare('UPDATE categories SET name=?,slug=?,image=? WHERE id=?'); $stmt->execute([$name,$slug,$image,(int)$match[1]]);
            $exists = $pdo->prepare('SELECT id FROM categories WHERE id=?');
            $exists->execute([(int)$match[1]]);
            if (!$exists->fetch()) respond(['error' => 'Category not found.'], 404);
            respond(['message' => 'Category updated.']);
        }
        $stmt = $pdo->prepare('INSERT INTO categories(name,slug,image) VALUES(?,?,?)'); $stmt->execute([$name,$slug,$image]);
        respond(['message' => 'Category added.'], 201);
    }
    if ($method === 'POST' && $path === 'admin/upload') {
        admin($pdo);
        $file = $_FILES['image'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) respond(['error' => 'Choose a JPEG, PNG, or WebP image up to 5 MB.'], 422);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $extensions = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
        if (!isset($extensions[$mime]) || !getimagesize($file['tmp_name'])) respond(['error' => 'Only valid JPEG, PNG, or WebP images are allowed.'], 422);
        $directory = __DIR__ . '/uploads';
        if (!is_dir($directory) && !mkdir($directory, 0770, true)) respond(['error' => 'Image storage is unavailable.'], 500);
        $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
        if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $filename)) respond(['error' => 'Image upload failed.'], 500);
        respond(['image' => '/uploads/' . $filename], 201);
    }
    respond(['error' => 'Not found.'], 404);
} catch (DomainException $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    respond(['error' => $e->getMessage()], 422);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate entry')) respond(['error' => 'That name or slug is already in use.'], 409);
    error_log($e->getMessage());
    respond(['error' => 'A database error occurred. Check the server configuration.'], 500);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log($e->getMessage());
    respond(['error' => 'The server could not complete your request.'], 500);
}

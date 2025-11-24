-- Database schema for additional features
-- Run this after the main schema

-- Refund requests table
CREATE TABLE IF NOT EXISTS `ps_crypto_refund_requests` (
    `id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `order_id` INT(11) NOT NULL,
    `amount` DECIMAL(20,8) NOT NULL,
    `chain` VARCHAR(20) NOT NULL,
    `asset` VARCHAR(20) NOT NULL,
    `recipient` VARCHAR(100) NOT NULL,
    `reason` TEXT,
    `status` ENUM('pending', 'broadcasted', 'confirmed', 'failed') DEFAULT 'pending',
    `tx_hash` VARCHAR(100),
    `error_message` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `expires_at` DATETIME NOT NULL,
    INDEX `idx_order_id` (`order_id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Compliance audit log
CREATE TABLE IF NOT EXISTS `ps_crypto_compliance_log` (
    `id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `event_type` VARCHAR(50) NOT NULL,
    `order_id` INT(11),
    `user_id` INT(11),
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `details` JSON,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_event_type` (`event_type`),
    INDEX `idx_order_id` (`order_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- WalletConnect sessions
CREATE TABLE IF NOT EXISTS `ps_crypto_walletconnect_sessions` (
    `id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `topic` VARCHAR(200) NOT NULL UNIQUE,
    `relay_protocol` VARCHAR(20),
    `relay_data` JSON,
    `controller` VARCHAR(100),
    `expiry` BIGINT,
    `acknowledged` BOOLEAN DEFAULT FALSE,
    `namespaces` JSON,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_topic` (`topic`),
    INDEX `idx_controller` (`controller`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Insert sample data for testing
INSERT IGNORE INTO `ps_crypto_refund_requests` (`id`, `order_id`, `amount`, `chain`, `asset`, `recipient`, `reason`, `status`, `expires_at`) VALUES
('refund_test_001', 1, 0.1, 'ETH', 'ETH', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'Customer request', 'pending', DATE_ADD(NOW(), INTERVAL 1 HOUR));

-- Sample compliance log entry
INSERT IGNORE INTO `ps_crypto_compliance_log` (`event_type`, `order_id`, `details`) VALUES
('system_init', NULL, '{"message": "Compliance system initialized", "version": "1.0"}');
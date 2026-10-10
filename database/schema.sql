
CREATE DATABASE IF NOT EXISTS wildsense_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE wildsense_db;

CREATE TABLE IF NOT EXISTS cameras (
    id VARCHAR(20) PRIMARY KEY,
    zone VARCHAR(100) NOT NULL,
    status ENUM('Online', 'Warning', 'Offline')
        NOT NULL DEFAULT 'Online',
    last_seen TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS image_analyses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    camera_id VARCHAR(20) NULL,
    image_name VARCHAR(255) NOT NULL,
    blur_score DOUBLE,
    brightness_score DOUBLE,
    contrast_score DOUBLE,
    reliability_score DECIMAL(5,2),
    decision ENUM('KEEP', 'LOW PRIORITY', 'FLAG'),
    health_status VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_analysis_camera
        FOREIGN KEY (camera_id) REFERENCES cameras(id)
        ON DELETE SET NULL
);

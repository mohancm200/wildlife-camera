
USE wildsense_db;

INSERT INTO cameras (id, zone, status)
VALUES
    ('CAM-001', 'North Forest', 'Online'),
    ('CAM-002', 'River Edge', 'Online'),
    ('CAM-003', 'East Woodland', 'Warning'),
    ('CAM-004', 'South Trail', 'Online')
ON DUPLICATE KEY UPDATE
    zone = VALUES(zone),
    status = VALUES(status);

INSERT INTO image_analyses (
    camera_id, image_name, blur_score, brightness_score,
    contrast_score, reliability_score, decision, health_status
)
SELECT
    'CAM-001', 'demo_forest_clear.jpg',
    185.4, 132.0, 48.2, 92.0, 'KEEP', 'Healthy'
WHERE NOT EXISTS (
    SELECT 1 FROM image_analyses
    WHERE image_name = 'demo_forest_clear.jpg'
);

INSERT INTO image_analyses (
    camera_id, image_name, blur_score, brightness_score,
    contrast_score, reliability_score, decision, health_status
)
SELECT
    'CAM-002', 'demo_river_normal.jpg',
    96.2, 118.0, 35.1, 76.0, 'KEEP', 'Healthy'
WHERE NOT EXISTS (
    SELECT 1 FROM image_analyses
    WHERE image_name = 'demo_river_normal.jpg'
);

INSERT INTO image_analyses (
    camera_id, image_name, blur_score, brightness_score,
    contrast_score, reliability_score, decision, health_status
)
SELECT
    'CAM-003', 'demo_woodland_blurry.jpg',
    12.8, 62.0, 18.4, 34.0, 'FLAG', 'Warning'
WHERE NOT EXISTS (
    SELECT 1 FROM image_analyses
    WHERE image_name = 'demo_woodland_blurry.jpg'
);

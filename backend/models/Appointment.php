<?php
/**
 * Strong Care - Appointment Model
 * Represents scheduled rehabilitation appointments with training modes (ROM + MiniGame)
 */

require_once __DIR__ . '/../config/Database.php';

class Appointment {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Normalize training_modes for backward compatibility
     * If empty or missing, defaults to rom only
     */
    public static function normalizeTrainingModes($raw): array {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $raw = $decoded;
            }
        }

        if (!is_array($raw) || empty($raw)) {
            return [
                'rom' => [
                    'enabled' => true,
                    'type' => 'pack',
                    'packId' => 'modpack-shoulder-daily',
                    'poseIds' => []
                ],
                'minigame' => [
                    'enabled' => false,
                    'questionCount' => 20
                ]
            ];
        }

        $rom = $raw['rom'] ?? [];
        $minigame = $raw['minigame'] ?? [];

        return [
            'rom' => [
                'enabled' => isset($rom['enabled']) ? (bool)$rom['enabled'] : true,
                'type' => in_array($rom['type'] ?? '', ['pack', 'custom']) ? $rom['type'] : 'pack',
                'packId' => $rom['packId'] ?? null,
                'packName' => $rom['packName'] ?? null,
                'poseIds' => is_array($rom['poseIds'] ?? null) ? $rom['poseIds'] : []
            ],
            'minigame' => [
                'enabled' => isset($minigame['enabled']) ? (bool)$minigame['enabled'] : false,
                'questionCount' => isset($minigame['questionCount']) ? max(5, min(50, (int)$minigame['questionCount'])) : 20
            ]
        ];
    }

    public function getAll(): array {
        $stmt = $this->db->query("
            SELECT a.*, p.name AS patient_name, p.patient_code 
            FROM appointments a 
            LEFT JOIN patients p ON a.patient_id = p.id 
            ORDER BY a.appointment_date ASC, a.time_slot ASC
        ");
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($results as &$row) {
            $row['training_modes'] = self::normalizeTrainingModes($row['training_modes'] ?? null);
            $row['trainingModes'] = $row['training_modes']; // CamelCase alias
        }
        return $results;
    }

    public function getById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT a.*, p.name AS patient_name, p.patient_code 
            FROM appointments a 
            LEFT JOIN patients p ON a.patient_id = p.id 
            WHERE a.id = ?
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;

        $row['training_modes'] = self::normalizeTrainingModes($row['training_modes'] ?? null);
        $row['trainingModes'] = $row['training_modes'];
        return $row;
    }

    public function getByPatientId(int $patientId): array {
        $stmt = $this->db->prepare("
            SELECT * FROM appointments 
            WHERE patient_id = ? 
            ORDER BY appointment_date ASC, time_slot ASC
        ");
        $stmt->execute([$patientId]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($results as &$row) {
            $row['training_modes'] = self::normalizeTrainingModes($row['training_modes'] ?? null);
            $row['trainingModes'] = $row['training_modes'];
        }
        return $results;
    }

    public function getByDate(string $date): array {
        $stmt = $this->db->prepare("
            SELECT a.*, p.name AS patient_name, p.patient_code 
            FROM appointments a 
            LEFT JOIN patients p ON a.patient_id = p.id 
            WHERE a.appointment_date = ? 
            ORDER BY a.time_slot ASC
        ");
        $stmt->execute([$date]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($results as &$row) {
            $row['training_modes'] = self::normalizeTrainingModes($row['training_modes'] ?? null);
            $row['trainingModes'] = $row['training_modes'];
        }
        return $results;
    }

    public function create(array $data): int {
        $modes = isset($data['trainingModes']) ? $data['trainingModes'] : ($data['training_modes'] ?? null);
        $normalizedModes = self::normalizeTrainingModes($modes);
        $modesJson = json_encode($normalizedModes, JSON_UNESCAPED_UNICODE);

        $stmt = $this->db->prepare("
            INSERT INTO appointments (
                patient_id, therapist_id, appointment_date, time_slot, station, training_modes, notes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            (int)($data['patient_id'] ?? $data['patientId'] ?? 1),
            isset($data['therapist_id']) || isset($data['therapistId']) ? (int)($data['therapist_id'] ?? $data['therapistId']) : null,
            $data['appointment_date'] ?? $data['date'] ?? date('Y-m-d'),
            $data['time_slot'] ?? $data['timeSlot'] ?? '09:30 - 10:30',
            $data['station'] ?? 'ตู้ Kiosk 1',
            $modesJson,
            $data['notes'] ?? null,
            $data['status'] ?? 'scheduled'
        ]);

        return (int)$this->db->lastInsertId();
    }

    public function update(int $id, array $data): bool {
        $fields = [];
        $params = [];

        if (isset($data['appointment_date']) || isset($data['date'])) {
            $fields[] = "appointment_date = ?";
            $params[] = $data['appointment_date'] ?? $data['date'];
        }
        if (isset($data['time_slot']) || isset($data['timeSlot'])) {
            $fields[] = "time_slot = ?";
            $params[] = $data['time_slot'] ?? $data['timeSlot'];
        }
        if (isset($data['station'])) {
            $fields[] = "station = ?";
            $params[] = $data['station'];
        }
        if (isset($data['training_modes']) || isset($data['trainingModes'])) {
            $modes = $data['trainingModes'] ?? $data['training_modes'];
            $normalized = self::normalizeTrainingModes($modes);
            $fields[] = "training_modes = ?";
            $params[] = json_encode($normalized, JSON_UNESCAPED_UNICODE);
        }
        if (isset($data['notes'])) {
            $fields[] = "notes = ?";
            $params[] = $data['notes'];
        }
        if (isset($data['status'])) {
            $fields[] = "status = ?";
            $params[] = $data['status'];
        }

        if (empty($fields)) {
            return false;
        }

        $params[] = $id;
        $sql = "UPDATE appointments SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    public function delete(int $id): bool {
        $stmt = $this->db->prepare("DELETE FROM appointments WHERE id = ?");
        return $stmt->execute([$id]);
    }
}

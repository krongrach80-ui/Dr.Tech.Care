<?php
/**
 * Moh Tech Care - Schedule Controller (Module 3)
 * Handles Therapy Schedule, Patient Calendar, and Routine Assignment
 */

require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class ScheduleController {
    private AuditRepository $auditRepo;
    private PDO $db;
    private array $config;

    public function __construct() {
        $this->auditRepo = new AuditRepository();
        $this->db = Database::getConnection();
        $this->config = require __DIR__ . '/../../config/config.php';
    }

    public function getAppointments(): void {
        AuthMiddleware::check();

        $month = $_GET['month'] ?? null;
        $patientId = $_GET['patient_id'] ?? null;
        $ptId = $_GET['pt_id'] ?? null;

        $sql = "
            SELECT a.*,
                   u_patient.full_name as patient_name,
                   u_pt.full_name as pt_name
            FROM appointments a
            JOIN users u_patient ON a.patient_id = u_patient.id
            LEFT JOIN users u_pt ON a.pt_id = u_pt.id
            WHERE 1=1
        ";
        $params = [];

        if ($month) {
            $sql .= " AND a.appointment_date LIKE :month";
            $params[':month'] = "{$month}%";
        }
        if ($patientId) {
            $sql .= " AND a.patient_id = :pid";
            $params[':pid'] = $patientId;
        }
        if ($ptId) {
            $sql .= " AND a.pt_id = :ptid";
            $params[':ptid'] = $ptId;
        }

        $sql .= " ORDER BY a.appointment_date ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $appointments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Attach routine items for each appointment
        foreach ($appointments as &$appt) {
            $rStmt = $this->db->prepare("
                SELECT ri.*, e.name_th as exercise_name_th, e.name_en as exercise_name_en, e.category
                FROM routine_items ri
                JOIN exercises e ON ri.exercise_id = e.id
                WHERE ri.appointment_id = :aid
                ORDER BY ri.order_index ASC
            ");
            $rStmt->execute([':aid' => $appt['id']]);
            $appt['routine_items'] = $rStmt->fetchAll(PDO::FETCH_ASSOC);
        }

        echo json_encode([
            'status' => 'success',
            'appointments' => $appointments
        ], JSON_UNESCAPED_UNICODE);
    }

    public function assignRoutine(): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $patientId = trim($body['patient_id'] ?? '');
        $appointmentDate = trim($body['appointment_date'] ?? date('Y-m-d'));
        $items = $body['items'] ?? [];

        if (!$patientId || empty($items)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID and routine items are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Server-Side RBAC Guard: Verify write authorization on this patient's schedule!
        RbacMiddleware::requireScheduleWrite($patientId);

        // Feature flag validation: FEATURE_PT_POSE_EXERCISES
        $featurePoseAllowed = $this->config['feature_flags']['FEATURE_PT_POSE_EXERCISES'] ?? false;

        if (!$featurePoseAllowed) {
            foreach ($items as $item) {
                $exId = $item['exercise_id'] ?? '';
                $exStmt = $this->db->prepare("SELECT category FROM exercises WHERE id = :id LIMIT 1");
                $exStmt->execute([':id' => $exId]);
                $exRow = $exStmt->fetch(PDO::FETCH_ASSOC);

                if ($exRow && $exRow['category'] !== 'Minigame') {
                    http_response_code(400);
                    echo json_encode([
                        'status' => 'error',
                        'message' => "ท่าฝึก '{$exId}' อยู่ระหว่างพัฒนา ไม่สามารถจัดโปรแกรมได้ในขณะนี้ (เลือกได้เฉพาะมินิเกม)"
                    ], JSON_UNESCAPED_UNICODE);
                    return;
                }
            }
        }

        $this->db->beginTransaction();
        try {
            // Find patient's primary PT
            $pStmt = $this->db->prepare("SELECT assigned_pt_id FROM patient_profiles WHERE patient_id = :pid");
            $pStmt->execute([':pid' => $patientId]);
            $pRow = $pStmt->fetch(PDO::FETCH_ASSOC);
            $primaryPtId = $pRow['assigned_pt_id'] ?? null;

            // Check if appointment exists for this patient on this date
            $apptStmt = $this->db->prepare("
                SELECT id FROM appointments
                WHERE patient_id = :pid AND appointment_date = :adate
                LIMIT 1
            ");
            $apptStmt->execute([':pid' => $patientId, ':adate' => $appointmentDate]);
            $existingAppt = $apptStmt->fetch(PDO::FETCH_ASSOC);

            $appointmentId = 0;
            if ($existingAppt) {
                $appointmentId = (int)$existingAppt['id'];
                // Clean existing routine items
                $del = $this->db->prepare("DELETE FROM routine_items WHERE appointment_id = :aid");
                $del->execute([':aid' => $appointmentId]);
            } else {
                $insAppt = $this->db->prepare("
                    INSERT INTO appointments (patient_id, pt_id, appointment_date, status, created_by)
                    VALUES (:pid, :ptid, :adate, 'scheduled', :created_by)
                ");
                $insAppt->execute([
                    ':pid' => $patientId,
                    ':ptid' => $primaryPtId,
                    ':adate' => $appointmentDate,
                    ':created_by' => $actor['user_id']
                ]);
                $appointmentId = (int)$this->db->lastInsertId();
            }

            // Insert routine items
            $insItem = $this->db->prepare("
                INSERT INTO routine_items (appointment_id, exercise_id, order_index, reps, sets, rest_seconds, custom_instructions, status)
                VALUES (:aid, :exid, :idx, :reps, :sets, :rest, :inst, 'pending')
            ");

            foreach ($items as $idx => $item) {
                $insItem->execute([
                    ':aid' => $appointmentId,
                    ':exid' => $item['exercise_id'],
                    ':idx' => $idx + 1,
                    ':reps' => (int)($item['reps'] ?? 10),
                    ':sets' => (int)($item['sets'] ?? 3),
                    ':rest' => (int)($item['rest_seconds'] ?? 30),
                    ':inst' => $item['custom_instructions'] ?? null
                ]);
            }

            $this->db->commit();

            $this->auditRepo->log(
                $actor['user_id'],
                $actor['full_name'],
                $actor['role'],
                BannedIpMiddleware::getClientIp(),
                'Desktop',
                'SCHEDULE_ASSIGN_ROUTINE',
                "Assigned daily routine for patient {$patientId} on {$appointmentDate}",
                'Normal'
            );

            echo json_encode([
                'status' => 'success',
                'message' => 'Routine assigned successfully',
                'appointment_id' => $appointmentId
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function moveAppointment(int $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();

        $stmt = $this->db->prepare("SELECT patient_id FROM appointments WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $appt = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$appt) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Appointment not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // RBAC Guard
        RbacMiddleware::requireScheduleWrite($appt['patient_id']);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $newDate = trim($body['appointment_date'] ?? '');

        if (!$newDate) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'New appointment date is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $upd = $this->db->prepare("
            UPDATE appointments
            SET appointment_date = :new_date, updated_at = :upd
            WHERE id = :id
        ");
        $upd->execute([
            ':new_date' => $newDate,
            ':upd' => date('Y-m-d H:i:s'),
            ':id' => $id
        ]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'SCHEDULE_MOVE_DATE',
            "Moved appointment #{$id} to {$newDate}",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => 'Appointment moved successfully'
        ], JSON_UNESCAPED_UNICODE);
    }
}
